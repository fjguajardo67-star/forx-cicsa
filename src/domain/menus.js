import { norm } from './recipes.js';

export const DAYS=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
export const MAIN_SLOTS=[{id:'guisado1',label:'GUISADO 1',type:'guisado'},{id:'guisado2',label:'GUISADO 2',type:'guisado'},{id:'garnacha',label:'GARNACHA',type:'garnacha'}];
export const EXTRA_SLOTS=[{id:'guarnicion1',label:'GUARNICIÓN 1',type:'guarnicion'},{id:'guarnicion2',label:'GUARNICIÓN 2',type:'guarnicion'},{id:'postre',label:'POSTRE',type:'postre'},{id:'agua',label:'AGUA',type:'agua'}];
export function restrictedDay(name) {
  const n=norm(name);
  return n.includes('pozole') ? 4 : /menudo|barbacoa/.test(n) ? 0 : null;
}
export function validDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
export const menuEligible = recipe => recipe.status==='active' && !recipe.omitted && recipe.type!=='grill';
const vegetable = recipe => /^(verdura|sin proteina|vegetariano)$/.test(norm(recipe?.protein));
const proteinKey = recipe => norm(recipe?.protein).replace(/^puerco$/, 'cerdo');
function special(slot, weekday, sunday) {
  if (slot.id==='guisado1' && weekday===4) return {name:'Pozole',matches:r=>norm(r.name).includes('pozole')};
  if (slot.id==='guisado1' && weekday===0) {
    const name=sunday%2 ? 'Barbacoa':'Menudo';
    return {name,matches:r=>norm(r.name).includes(norm(name))};
  }
  if (slot.id==='garnacha' && weekday===4) return {name:'Tacos dorados de papa',matches:r=>norm(r.name)==='tacos dorados de papa'};
  return null;
}
// Shared by generation, manual substitutions and live consultation. Warnings
// and special locks are derived from the recipes, never trusted from a client.
export function evaluateMenuRules(days, recipes) {
  const byId=new Map(recipes.map(r=>[r.id,r])), history=new Map();
  const windowSize=Math.max(days.length,15); let sunday=0, yesterdayVegetable=false;
  return days.map(day=> {
    const weekday=new Date(`${day.date}T12:00:00Z`).getUTCDay(), selected=[], warnings=[];
    if (weekday===0) sunday++;
    const slots=day.slots.map(slot=> {
      const recipe=byId.get(slot.recipeId), expected=special(slot,weekday,sunday);
      const locked=Boolean(recipe && expected?.matches(recipe));
      if (expected && !locked) warnings.push(`${slot.label}: falta el especial ${expected.name}.`);
      if (!recipe) warnings.push(`${slot.label}: no hay receta disponible.`);
      else {
        if (!menuEligible(recipe)) warnings.push(`${slot.label}: ${recipe.name} ya no participa en la rotación.`);
        if (selected.some(r=>r.id===recipe.id)) warnings.push(`${slot.label}: catálogo insuficiente o selección manual; se repite ${recipe.name} en el día.`);
        else if (!locked && (history.get(slot.type) || []).slice(-windowSize).includes(recipe.id)) warnings.push(`${slot.label}: ${recipe.name} se repite dentro de las últimas ${windowSize} selecciones de ${slot.type}.`);
        selected.push(recipe);
      }
      return {...slot,locked};
    });
    const mains=selected.filter(r=>r.type==='guisado');
    if (mains.filter(vegetable).length>1 || (yesterdayVegetable && mains.some(vegetable))) warnings.push('No se cumple la alternancia de guisados con proteína; revisa las opciones disponibles.');
    const proteins=mains.map(proteinKey).filter(p=>p && !['verdura','vegetariano','sin proteina','mixto'].includes(p));
    if (new Set(proteins).size<proteins.length) warnings.push('Los dos guisados comparten proteína; revisa las alternativas.');
    for (const recipe of selected) history.set(recipe.type,[...(history.get(recipe.type) || []),recipe.id].slice(-windowSize));
    yesterdayVegetable=mains.some(vegetable);
    return {...day,label:DAYS[weekday],slots,warnings};
  });
}
export function generateDays(recipes,{startDate,count,contractLineId},random=Math.random) {
  if (!validDay(startDate) || !Number.isInteger(Number(count)) || count<1 || count>60) throw new Error('Selecciona fecha inicial y entre 1 y 60 días.');
  const available=recipes.filter(menuEligible);
  if (!available.some(r=>r.type==='guisado' || r.type==='garnacha')) throw new Error('Agrega al menos un guisado o garnacha al catálogo.');
  const history=new Map(), windowSize=Math.max(Number(count),15); let yesterdayVegetable=false, sunday=0;
  const days=Array.from({length:Number(count)},(_,index)=> {
    const date=new Date(`${startDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate()+index);
    const weekday=date.getUTCDay(), chosen=[], warnings=[];
    if (weekday===0) sunday++;
    const slots=[...MAIN_SLOTS,...EXTRA_SLOTS.filter(s=>available.some(r=>r.type===s.type))].map(slot=> {
      let pool=available.filter(r=>r.type===slot.type && (restrictedDay(r.name)==null || restrictedDay(r.name)===weekday));
      const expected=special(slot,weekday,sunday), fixed=expected && pool.find(expected.matches);
      if (slot.type==='guisado' && (yesterdayVegetable || chosen.some(r=>r.type==='guisado' && vegetable(r)))) {
        const withProtein=pool.filter(r=>!vegetable(r));
        // Legacy behavior: a small vegetarian-only catalog remains usable, but
        // evaluateMenuRules makes the unavoidable relaxation explicit.
        if (withProtein.length) pool=withProtein;
      }
      const distinct=pool.filter(r=>!chosen.some(c=>c.id===r.id));
      const recent=distinct.filter(r=>!(history.get(slot.type) || []).slice(-windowSize).includes(r.id));
      const protein=recent.filter(r=>slot.type!=='guisado' || !proteinKey(r) || vegetable(r) || proteinKey(r)==='mixto' || !chosen.some(c=>c.type==='guisado' && proteinKey(c)===proteinKey(r)));
      const candidates=protein.length ? protein : recent.length ? recent : distinct.length ? distinct : pool;
      const recipe=fixed || candidates[Math.min(candidates.length-1,Math.floor(random()*candidates.length))];
      if (recipe) chosen.push(recipe);
      return {...slot,recipeId:recipe?.id || null,charged:MAIN_SLOTS.some(s=>s.id===slot.id),locked:Boolean(fixed)};
    });
    for (const recipe of chosen) history.set(recipe.type,[...(history.get(recipe.type) || []),recipe.id].slice(-windowSize));
    yesterdayVegetable=chosen.some(r=>r.type==='guisado' && vegetable(r));
    return {date:date.toISOString().slice(0,10),label:DAYS[weekday],contractLineId,slots,warnings};
  });
  return evaluateMenuRules(days,recipes);
}
