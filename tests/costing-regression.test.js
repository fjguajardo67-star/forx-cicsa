import { test,expect } from 'vitest';
import Decimal from 'decimal.js';
import { costLine,costRecipe,costMenuDay,costBasket,recipeCap,marginBand } from '../src/domain/costing.js';
import { catalogPrices,priceForPurchase,productPriceKey,ingredientPriceKey } from '../src/domain/prices.js';
import { validateRecipe } from '../src/domain/recipes.js';
import { shoppingList,menuRows,printMenu } from '../src/domain/kitchen-exports.js';
import { MAIN_SLOTS,EXTRA_SLOTS } from '../src/domain/menus.js';

const settings={confirmed:true,marginTarget:'15',productionCost:'20',dishPortions:'2',contractLines:[{id:'comida',price:'77',active:true}],complements:[{name:'Canasta',fixedCost:'21.16'}],identity:{company:'Pruebas'}};
const ingredient={id:'i',canonicalName:'Ingrediente',status:'active',baseUnit:'kg',wastePct:'10',wasteEffectiveFrom:'2026-01-01'};
const product={id:'p',ingredientId:'i',classification:'culinary',contentQuantity:'12',contentUnit:'kg'};
const event={id:'e',currency:'MXN',observedAt:'2026-09-20T12:00:00',original:{cantidad:'2',importe:'768',descuento:'48',valor_unitario:'384'}};
const line=(overrides={})=>({id:'l',name:'Ingrediente',ingredientId:'i',quantity:'100',unit:'g',yieldFactor:'1',...overrides});
const recipe=(id='r',overrides={})=>({id,...validateRecipe({name:id,type:'guisado',baseServings:1,lines:[line()],...overrides})});
const catalog=(baseUnit='kg',price='20')=>[{...ingredient,baseUnit,currentPrice:{id:'observation',normalizedPrice:price,baseUnit}}];
const day=(ids=['a','b','c'])=>({date:'2026-10-05',label:'Lunes',contractLineId:'comida',warnings:[],slots:MAIN_SLOTS.map((s,i)=>({...s,recipeId:ids[i],charged:true}))});

test('factura neta, cajas y merma: calcula sin redondeo intermedio ni duplicar merma',()=>{
  const value=priceForPurchase(event,product,ingredient);
  expect(value.normalizedPrice).toBe('33.3333');
  expect(new Decimal(value.calculationPrice).eq(new Decimal(720).div('21.6'))).toBe(true);
  const cost=costLine(line(),[{...ingredient,currentPrice:{id:'o',...value}}]);
  expect(new Decimal(cost.amount).eq(new Decimal(720).div('21.6').times('.1'))).toBe(true);
  const old={id:'o',...value,eventId:'e',ingredientId:'i',productId:'p',observedAt:event.observedAt,reviewedAt:'2026-10-01',productPriceKey:productPriceKey(product),ingredientPriceKey:ingredientPriceKey(ingredient)};
  delete old.calculationPrice;
  const immutable=structuredClone(old);
  const projected=catalogPrices({ingredients:[ingredient],products:[product],reviews:[{eventId:'e',status:'validated',observationId:'o'}],price_observations:[old]});
  expect(projected[0].currentPrice.calculationPrice).toBe(value.calculationPrice);expect(old).toEqual(immutable);
});
test('la merma confirmada se aplica a una factura anterior sin cambiar su fecha ni su importe',()=>{
  const august={...event,observedAt:'2026-08-21T14:18:41',original:{cantidad:'125',importe:'3625',descuento:'0',valor_unitario:'29'}};
  const frijol={...ingredient,wastePct:'3',wasteEffectiveFrom:'2026-10-07'};
  const bulk={...product,contentQuantity:'1'};
  const price=priceForPurchase(august,bulk,frijol);
  expect(price.normalizedPrice).toBe('29.8969');
  expect(price.priceBasis).toMatchObject({purchasePrice:'3625',packageCount:'125',wastePct:'3'});
  expect(price.wasteEffectiveFrom).toBe('2026-10-07');
});
test('corregir solo la fecha registrada de merma no invalida precios anteriores, incluso con clave histórica',()=>{
  const old={id:'o',eventId:'e',productId:'p',ingredientId:'i',observedAt:event.observedAt,reviewedAt:'2026-10-07',
    normalizedPrice:'33.3333',productPriceKey:productPriceKey(product),
    ingredientPriceKey:JSON.stringify([ingredient.baseUnit,ingredient.wastePct,'2026-01-01'])};
  const state={products:[product],reviews:[{eventId:'e',status:'validated',observationId:'o'}],price_observations:[old]};
  expect(catalogPrices({...state,ingredients:[{...ingredient,wasteEffectiveFrom:'2026-10-07'}]})[0].currentPrice?.id).toBe('o');
  expect(catalogPrices({...state,ingredients:[{...ingredient,wastePct:'12'}]})[0].currentPrice).toBeNull();
});
test('jerarquía de precios: fecha de factura, revisión y desempate estable; nunca el importe mayor',()=>{
  const observation=(id,observedAt,reviewedAt,price)=>({id,eventId:id,productId:'p',ingredientId:'i',observedAt,reviewedAt,normalizedPrice:price,productPriceKey:productPriceKey(product),ingredientPriceKey:ingredientPriceKey(ingredient)});
  const observations=[observation('old','2026-08-01','2026-10-03','999'),observation('recent','2026-09-01','2026-10-01','20'),observation('b','2026-09-01','2026-10-02','21'),observation('a','2026-09-01','2026-10-02','22')];
  const state={ingredients:[ingredient],products:[product],price_observations:observations,reviews:observations.map(o=>({eventId:o.id,status:'validated',observationId:o.id}))};
  expect(catalogPrices(state)[0].currentPrice.id).toBe('a');
  state.reviews.at(-1).status='excluded';expect(catalogPrices(state)[0].currentPrice.id).toBe('b');
  state.reviews.at(-2).observationId='replaced';expect(catalogPrices(state)[0].currentPrice.id).toBe('recent');
  expect(catalogPrices({...state,products:[{...product,contentQuantity:'6'}]})[0].currentPrice).toBeNull();
  expect(catalogPrices({...state,ingredients:[{...ingredient,wastePct:'20'}]})[0].currentPrice).toBeNull();
});
test.each([['g','100','kg','2'],['kg','0.1','kg','2'],['ml','250','l','5'],['l','0.25','l','5'],['pz','3','pz','60']])('unidad %s escala solo dentro de su familia', (unit,quantity,base,amount)=>{
  expect(costLine(line({unit,quantity}),catalog(base)).amount).toBe(amount);
});
test('equivalencias explícitas y rendimiento; bloquea densidades, precios y cantidades inválidas',()=>{
  expect(costLine(line({unit:'pz',quantity:2,gramsPerPiece:50,conversionNote:'Pesado y confirmado'}),catalog()).amount).toBe('2');
  expect(costLine(line({unit:'porcion',quantity:1,gramsPerPiece:50,conversionNote:'Porción pesada y confirmada'}),catalog()).amount).toBe('1');
  expect(costLine(line({unit:'porcion',quantity:1}),catalog()).amount).toBeNull();
  expect(costLine(line({quantity:85,yieldFactor:'2.5',conversionNote:'Medición servido/seco'}),catalog()).amount).toBe('0.68');
  for(const bad of [{unit:'ml'},{unit:'caja'},{quantity:-1},{quantity:'NaN'},{yieldFactor:0},{yieldFactor:2},{unit:'pz',gramsPerPiece:-1,conversionNote:'No válido'}])expect(costLine(line(bad),catalog()).amount).toBeNull();
  expect(costLine(line(),catalog('kg','0')).amount).toBeNull();
  expect(costLine(line(),catalog('kg','Infinity')).amount).toBeNull();
});
test('canasta y producción una vez, extras sin doble cargo; faltantes de extras impiden verificar',()=>{
  const recipes=[recipe('a'),recipe('b'),recipe('c',{type:'garnacha'}),recipe('extra',{type:'postre'})];
  const d=day();d.slots.push({...EXTRA_SLOTS[2],charged:false,recipeId:'extra'});
  const cost=costMenuDay(d,recipes,catalog(),settings);
  expect(cost).toMatchObject({verified:true,total:'47.16',material:'6'});
  recipes[3].lines[0].ingredientId=null;
  const incomplete=costMenuDay(d,recipes,catalog(),settings);expect(incomplete.total).toBeNull();expect(incomplete.band).toBe('incompleto');
  expect(recipeCap(settings,catalog(),'comida')).toBe('12.145');
});
test('ninguna canasta parcial, configuración no confirmada o espacio principal ausente acredita total',()=>{
  const incomplete={...settings,complements:[{name:'Fijo',fixedCost:'3'},line({ingredientId:null})]};
  expect(costBasket(incomplete,catalog())).toMatchObject({verified:false,total:null,knownSubtotal:'3'});
  expect(recipeCap(incomplete,catalog(),'comida')).toBeNull();
  const recipes=['a','b','c'].map(id=>recipe(id));
  expect(costMenuDay(day(),recipes,catalog(),{...settings,confirmed:false}).total).toBeNull();
  expect(costMenuDay({...day(),slots:[]},recipes,catalog(),settings).total).toBeNull();
  expect(costMenuDay({...day(),contractLineId:'no-existe'},recipes,catalog(),settings).band).toBe('sinlinea');
});
test('Grill: divide materia y desechables por base; producción por platillo, sin canasta global',()=>{
  const r=recipe('grill',{type:'grill',baseServings:4,productionCost:5,salePrice:30,lines:[line({quantity:400})],disposables:[line({id:'d',quantity:8,unit:'pz',ingredientId:'piece'})]});
  const pantry=[...catalog(),{id:'piece',baseUnit:'pz',status:'active',currentPrice:{id:'o2',normalizedPrice:'3'}}];
  expect(costRecipe(r,pantry,settings)).toMatchObject({total:'13',verified:true,band:'verde'}); // 8/4 + 24/4 + 5
  expect(costRecipe({...r,salePrice:null},pantry,settings).band).toBe('sinprecio');
  expect(costRecipe(r,catalog(),settings).total).toBeNull();
});
test('margen calculado en fronteras y tope negativo; no valores fijos de semáforo',()=>{
  expect(['30','20','0','-1'].map(m=>marginBand(m,'30'))).toEqual(['verde','amarillo','naranja','rojo']);
  expect(marginBand('0','0')).toBe('verde');expect(marginBand('14.99')).toBe('amarillo');
  expect(Number(recipeCap({...settings,productionCost:100},catalog(),'comida'))).toBeLessThan(0);
  expect(costMenuDay(day(),['a','b','c'].map(id=>recipe(id)),catalog(),{...settings,productionCost:100}).band).toBe('rojo');
});
test('lista de compras escala por comensales/base y merma una vez; documentos conservan faltantes',()=>{
  const recipes=['a','b','c'].map(id=>recipe(id,{baseServings:2,lines:[line({quantity:400})]}));
  const cfg={...settings,complements:[]},d=day();d.warnings=['Regla pendiente de revisar'];
  const menu={id:'m',name:'Prueba',diners:10,days:[d]},state={recipes,catalog:catalog(),settings:cfg};
  state.menuCosts={m:[costMenuDay(d,recipes,state.catalog,cfg)]};
  const [row]=shoppingList(menu,state);expect(row.quantity).toBe('6');expect(Number(row.buyQuantity)).toBeCloseTo(6/.9,12);expect(row.amount).toBe('120');
  expect(menuRows(menu,state.menuCosts.m)[1].at(-1)).toBe('Regla pendiente de revisar');
  recipes[0].lines[0].ingredientId=null;state.menuCosts.m=[costMenuDay(d,recipes,state.catalog,cfg)];
  expect(menuRows(menu,state.menuCosts.m)[1][6]).toBe('No verificable');
  expect(printMenu(menu,state)).toContain('Costo no verificable');
});
