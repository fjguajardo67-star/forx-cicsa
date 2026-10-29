import { test, expect } from 'vitest';
import { generateDays, evaluateMenuRules, restrictedDay } from '../src/domain/menus.js';
import { KitchenService } from '../src/domain/kitchen-service.js';
import { MemoryEntityRepository } from '../src/data/entity-repository.js';

const recipe=(id,type='guisado',extra={})=>({id,name:id,type,protein:'',status:'active',omitted:false,...extra});
const input={startDate:'2026-10-05',count:7,contractLineId:'comida-completa'};
const large=()=>[...Array.from({length:40},(_,i)=>recipe('G'+i,'guisado',{protein:i%2?'Pollo':'Res'})),...Array.from({length:30},(_,i)=>recipe('GN'+i,'garnacha'))];

test('historial independiente: acompañamientos no consumen la ventana de guisados ni garnachas',()=>{
  const catalog=large(), extras=['guarnicion','postre','agua'].flatMap(type=>Array.from({length:20},(_,i)=>recipe(type+i,type)));
  const plain=generateDays(catalog,input,()=>0), withExtras=generateDays([...catalog,...extras],input,()=>0);
  expect(withExtras.map(d=>d.slots.slice(0,3).map(s=>s.recipeId))).toEqual(plain.map(d=>d.slots.map(s=>s.recipeId)));
  expect(new Set(plain.flatMap(d=>d.slots.map(s=>s.recipeId))).size).toBe(21);
  expect(plain[6].slots[2].recipeId).toBe('GN6'); // Before: GN0, despite 24 unused garnachas.
});
test('ventana heredada es max(duración,15) selecciones por familia, no días ni todo el menú',()=>{
  const days=generateDays(large(),{...input,count:16},()=>0);
  expect(new Set(days.map(d=>d.slots[2].recipeId)).size).toBe(16);
  // Two guisados per day; each family uses its own last sixteen selections.
  expect(days[8].slots[0].recipeId).toBe('G16');
  expect(days[9].slots[0].recipeId).toBe('G0');
});
test('especiales reales de jueves y domingos alternados, aun comenzando en domingo',()=>{
  const catalog=[...large(),recipe('Pozole rojo','guisado',{protein:'Cerdo'}),recipe('Barbacoa','guisado',{protein:'Res'}),recipe('Menudo','guisado',{protein:'Res'}),recipe('TACOS DORADOS DE PAPA','garnacha'),recipe('Tacos dorados de pollo','garnacha')];
  const days=generateDays(catalog,{...input,startDate:'2026-10-04',count:15},()=>0);
  expect([0,7,14].map(i=>days[i].slots[0].recipeId)).toEqual(['Barbacoa','Menudo','Barbacoa']);
  for (const day of days) {
    const weekday=new Date(day.date).getUTCDay();
    if(weekday===4) { expect(day.slots[0]).toMatchObject({recipeId:'Pozole rojo',locked:true}); expect(day.slots[2]).toMatchObject({recipeId:'TACOS DORADOS DE PAPA',locked:true}); }
    for(const slot of day.slots){const r=catalog.find(r=>r.id===slot.recipeId);if(restrictedDay(r.name)!=null)expect(restrictedDay(r.name)).toBe(weekday);}
  }
});
test('omisiones, borradores, archivadas y Grill no entran; falta de especial nunca crea candado falso',()=>{
  const catalog=[...large(),recipe('Pozole','guisado',{omitted:true}),recipe('Tacos dorados de papa','garnacha',{status:'draft'}),recipe('Archivada','guisado',{status:'archived'}),recipe('Grill','grill')];
  const days=generateDays(catalog,input,()=>0);
  expect(days[3].slots[0].locked).toBe(false); expect(days[3].warnings.join(' ')).toMatch(/Pozole/);
  expect(days[3].warnings.join(' ')).toMatch(/Tacos dorados de papa/);
  expect(days.flatMap(d=>d.slots.map(s=>s.recipeId))).not.toEqual(expect.arrayContaining(['Pozole','Archivada','Grill']));
});
test('diversidad de guisados normaliza proteína; garnacha no comparte esa restricción',()=>{
  const days=generateDays([recipe('A','guisado',{protein:'Cerdo'}),recipe('B','guisado',{protein:'PUERCO'}),recipe('C','guisado',{protein:'Res'}),recipe('T','garnacha',{protein:'cerdo'})],{...input,count:1},()=>0);
  expect(days[0].slots.map(s=>s.recipeId)).toEqual(['A','C','T']);
});
test('guisado sin proteína máximo uno por día, evitando consecutivos si hay alternativas',()=>{
  const catalog=[recipe('V1','guisado',{protein:'Verdura'}),recipe('V2','guisado',{protein:'Vegetariano'}),...large()];
  const days=generateDays(catalog,{...input,count:3},()=>0);
  expect(days[0].slots[0].recipeId).toBe('V1');
  expect(days[0].slots[1].recipeId).toBe('G0');
  expect(days[1].slots.slice(0,2).every(s=>s.recipeId.startsWith('G'))).toBe(true);
  expect(days[2].slots[0].recipeId).toBe('V2');
});
test('catálogo insuficiente sigue generando con advertencias explícitas, nunca recetas ficticias',()=>{
  const days=generateDays([recipe('V','guisado',{protein:'Verdura'})],{...input,count:2},()=>0);
  expect(days[1].slots.map(s=>s.recipeId)).toEqual(['V','V',null]);
  expect(days[1].warnings.join(' ')).toMatch(/se repite/);
  expect(days[1].warnings.join(' ')).toMatch(/alternancia/);
  expect(days[1].warnings.join(' ')).toMatch(/no hay receta/);
});
test('sustituciones recalculan advertencias y candados; el cliente no puede ocultarlas',async()=>{
  const kitchen=new KitchenService(new MemoryEntityRepository());await kitchen.initialize();
  const save=(name,type='guisado',extra={})=>kitchen.saveRecipe({name,type,baseServings:1,lines:[{name:'Pendiente',quantity:1,unit:'g'}],...extra});
  const a=await save('A'), b=await save('B'), pozole=await save('Pozole'), draft=await save('Borrador','guisado',{status:'draft'}), omitted=await save('Omitida','guisado',{omitted:true});
  await save('Tacos dorados de papa','garnacha');
  const menu=await kitchen.generateMenu({name:'Semana',startDate:'2026-10-08',count:1,diners:100});
  const changed=structuredClone(menu);changed.expectedRevision=menu._revision;
  changed.days[0].slots[0].recipeId=a.id;changed.days[0].slots[0].locked=true;changed.days[0].warnings=[];
  const result=await kitchen.saveMenu(changed);
  expect(result.days[0].slots[0].locked).toBe(false);expect(result.days[0].warnings.join(' ')).toMatch(/Pozole/);
  for(const invalid of [draft,omitted]){await expect(kitchen.saveMenu({...result,expectedRevision:result._revision,days:[{...result.days[0],slots:result.days[0].slots.map(s=>s.id==='guisado2'?{...s,recipeId:invalid.id}:s)}]})).rejects.toThrow(/activa y no omitida/);}
  const bad=structuredClone(result);bad.expectedRevision=result._revision;bad.startDate='2026-10-09';bad.days[0].date='2026-10-09';bad.days[0].slots[0].recipeId=pozole.id;
  await expect(kitchen.saveMenu(bad)).rejects.toThrow(/restringido/);
  expect(evaluateMenuRules(result.days,[a,b,pozole]).at(0).warnings.join(' ')).toMatch(/no hay receta/);
});
