import Decimal from 'decimal.js';
import { UNIT } from './recipes.js';
import { MAIN_SLOTS } from './menus.js';

const sum = values => values.reduce((a,b)=>a.plus(b), new Decimal(0));
export const money = value => value == null ? 'No verificable' : new Intl.NumberFormat('es-MX',{ style:'currency',currency:'MXN' }).format(Number(value));
export function costLine(line, catalog) {
  const ingredient=catalog.find(i=>i.id===line.ingredientId);
  const fail = (status,reason) => ({ lineId:line.id, name:line.name, ingredientId:line.ingredientId, status, reason, amount:null, observationId:null });
  if (!ingredient || ingredient.status !== 'active') return fail('unlinked', 'Ingrediente no vinculado o no disponible');
  if (!ingredient.currentPrice) return fail('unpriced', 'Sin precio validado vigente');
  const positive=value=>{try{return new Decimal(value).isFinite() && new Decimal(value).gt(0);}catch{return false;}};
  const price=ingredient.currentPrice, unitPrice=price.calculationPrice || price.normalizedPrice;
  if (!Object.hasOwn(UNIT,line.unit) || !positive(line.quantity) || !positive(line.yieldFactor ?? 1)) return fail('invalid','Cantidad, unidad o rendimiento inválido');
  if (!positive(unitPrice) || (price.baseUnit && price.baseUnit!==ingredient.baseUnit)) return fail('unpriced','Precio vigente inválido o incompatible');
  let quantity=new Decimal(line.quantity).times(UNIT[line.unit][1]);
  if (UNIT[line.unit]?.[0] !== ingredient.baseUnit) {
    if (['pz','porcion'].includes(line.unit) && ingredient.baseUnit==='kg' && positive(line.gramsPerPiece) && line.conversionNote) quantity=new Decimal(line.quantity).times(line.gramsPerPiece).div(1000);
    else return fail('incompatible', `Unidad incompatible: catálogo en ${ingredient.baseUnit}`);
  }
  if (!new Decimal(line.yieldFactor ?? 1).eq(1) && !line.conversionNote) return fail('incompatible','Rendimiento sin confirmar');
  quantity=quantity.div(line.yieldFactor || 1);
  return { lineId:line.id, name:line.name, ingredientId:ingredient.id, status:'verified', reason:null,
    amount:quantity.times(unitPrice).toString(), baseQuantity:quantity.toString(), baseUnit:ingredient.baseUnit,
    price:unitPrice, observationId:price.id, observedAt:price.observedAt,
    formula:`${line.quantity} ${line.unit} → ${quantity.toString()} ${ingredient.baseUnit} × ${unitPrice}` };
}
export function costRecipe(recipe, catalog, settings) {
  const lines=recipe.lines.map(line=>costLine(line,catalog));
  const disposables=(recipe.disposables || []).map(line=>costLine(line,catalog));
  const missing=[...lines,...disposables].filter(l=>l.status!=='verified');
  if (!lines.length) missing.push({name:recipe.name, reason:'Sin ingredientes para verificar el costo'});
  const known=sum([...lines,...disposables].map(l=>l.amount || 0)).div(recipe.baseServings);
  const total=recipe.type==='grill' ? known.plus(recipe.productionCost || 0) : known;
  const verified=!missing.length;
  const sale=recipe.salePrice && new Decimal(recipe.salePrice).gt(0) ? recipe.salePrice : null;
  const margin=verified && sale ? new Decimal(sale).minus(total).div(sale).times(100).toString() : null;
  return { verified, lines, disposables, missing, knownSubtotal:total.toString(), total:verified ? total.toString() : null,
    margin, band:!verified ? 'incompleto' : !sale ? 'sinprecio' : marginBand(margin,settings.marginTarget),
    observationIds:[...new Set([...lines,...disposables].map(l=>l.observationId).filter(Boolean))] };
}
export function marginBand(margin, target='15') {
  const value=new Decimal(margin), goal=new Decimal(target), epsilon='0.000000001';
  return value.gte(goal.minus(epsilon)) ? 'verde' : value.gte(goal.times(2).div(3).minus(epsilon)) ? 'amarillo' : value.gte(new Decimal(0).minus(epsilon)) ? 'naranja' : 'rojo';
}
export function costBasket(settings,catalog) {
  const lines=settings.complements.map(row=>row.fixedCost != null ? {name:row.name, status:'verified',amount:row.fixedCost} : costLine(row,catalog));
  const missing=lines.filter(l=>l.status!=='verified');
  const knownSubtotal=sum(lines.map(l=>l.amount || 0)).toString();
  return { lines, missing, verified:!missing.length, total:missing.length ? null:knownSubtotal, knownSubtotal };
}
export function recipeCap(settings, catalog, lineId) {
  const basket=costBasket(settings,catalog), line=settings.contractLines.find(l=>l.id===lineId && l.active);
  if (!settings.confirmed || !basket.verified || !line) return null;
  return new Decimal(line.price).times(new Decimal(1).minus(new Decimal(settings.marginTarget).div(100)))
    .minus(settings.productionCost).minus(basket.total).div(settings.dishPortions).toString();
}
export function costMenuDay(day, recipes, catalog, settings) {
  const basket=costBasket(settings,catalog), missing=[...basket.missing];
  for (const slot of MAIN_SLOTS) if (!day.slots.some(s=>s.id===slot.id)) missing.push({name:slot.label,reason:'Falta espacio principal del menú'});
  const costs=day.slots.map(slot=> {
    const recipe=recipes.find(r=>r.id===slot.recipeId);
    if (!recipe || recipe.status==='archived') { missing.push({name:slot.label,reason:'Falta receta disponible'}); return {slot,recipe:null,cost:null}; }
    const cost=costRecipe(recipe,catalog,settings);
    // Accompaniments are selected for display; the original basket pays them.
    // Their unresolved recipes still propagate warnings, never fake a green day.
    missing.push(...cost.missing.map(m=>({...m,recipeName:recipe.name})));
    return {slot,recipe,cost};
  });
  if (!settings.confirmed) missing.push({name:'Configuración',reason:'Confirma los parámetros del negocio'});
  const line=settings.contractLines.find(l=>l.id===day.contractLineId && l.active);
  if (!line) missing.push({name:'Línea de contrato',reason:'Sin línea asignada'});
  const material=sum(costs.filter(c=>c.slot.charged!==false).map(c=>c.cost?.knownSubtotal || 0));
  const total=material.plus(basket.knownSubtotal).plus(settings.productionCost);
  const verified=!missing.length;
  const margin=verified ? new Decimal(line.price).minus(total).div(line.price).times(100).toString() : null;
  return { verified, slots:costs, missing, basket, material:verified ? material.toString():null,
    total:verified ? total.toString():null, knownSubtotal:total.toString(), margin,
    band:verified ? marginBand(margin,settings.marginTarget) : !line ? 'sinlinea':'incompleto',
    line, observationIds:[...new Set([...costs.flatMap(c=>c.cost?.observationIds || []),...basket.lines.map(l=>l.observationId).filter(Boolean)])] };
}
