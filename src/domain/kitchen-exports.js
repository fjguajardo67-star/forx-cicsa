import Decimal from 'decimal.js';
import { costLine, money } from './costing.js';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e=escapeHtml;
export function csv(rows) { return '\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v ?? '').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n'); }
export function menuRows(menu,costs) {
  return [['Fecha','Línea','Guisado 1','Guisado 2','Garnacha','Complementos del menú','Costo total por comida','Estado','Faltantes','Advertencias de reglas'],...menu.days.map((d,i)=> {
    const c=costs[i];
    return [d.date,c.line?.name || 'Sin línea',...c.slots.filter(s=>s.slot.charged).map(s=>s.recipe?.name || 'Sin receta'),
      c.slots.filter(s=>!s.slot.charged).map(s=>s.recipe?.name || 'Sin receta').join(' · '),c.verified?c.total:'No verificable',c.band,
      c.missing.map(m=>`${m.recipeName ? m.recipeName+': ':''}${m.name}: ${m.reason}`).join('; '),(d.warnings || []).join('; ')];
  })];
}
export function shoppingList(menu,state) {
  const map=new Map();
  const add=(line,factor)=> {
    const cost=costLine(line,state.catalog), ingredient=state.catalog.find(i=>i.id===line.ingredientId);
    const compatible=cost.baseQuantity!=null, unit=compatible?cost.baseUnit:line.unit;
    const key=`${line.ingredientId || line.name}|${unit}|${compatible}`;
    const row=map.get(key) || {name:ingredient?.canonicalName || line.name,ingredientId:line.ingredientId,unit,quantity:new Decimal(0),buyQuantity:compatible && ingredient?.wastePct!=null ? new Decimal(0):null,amount:new Decimal(0),missing:[],observationId:cost.observationId};
    const quantity=new Decimal(compatible?cost.baseQuantity:line.quantity).times(factor);
    row.quantity=row.quantity.plus(quantity);
    if (row.buyQuantity) row.buyQuantity=row.buyQuantity.plus(quantity.div(new Decimal(1).minus(new Decimal(ingredient.wastePct).div(100))));
    row.amount=row.amount.plus(new Decimal(cost.amount || 0).times(factor));
    if(cost.status!=='verified') row.missing.push(cost.reason);
    map.set(key,row);
  };
  for(const day of menu.days) {
    for(const slot of day.slots.filter(s=>s.charged)) {
      const recipe=state.recipes.find(r=>r.id===slot.recipeId); if(!recipe)continue;
      recipe.lines.forEach(l=>add(l,new Decimal(menu.diners).div(recipe.baseServings)));
    }
    state.settings.complements.filter(c=>c.fixedCost==null).forEach(l=>add(l,menu.diners));
  }
  return [...map.values()].map(r=>({...r,quantity:r.quantity.toString(),buyQuantity:r.buyQuantity?.toString() ?? null,amount:r.missing.length?null:r.amount.toString(),missing:[...new Set(r.missing)]}));
}
function document(title,body,company) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${e(title)}</title><style>@page{size:letter;margin:14mm}body{font:12px Arial,sans-serif;color:#111;background:#fff;margin:24px}h1{font-size:22px}h2{font-size:18px}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #888;padding:7px;text-align:left;vertical-align:top}th{background:#eee}tr{break-inside:avoid}.recipe{break-before:page}.notice{border:1px solid #333;padding:10px;font-weight:bold}small{display:block}pre{white-space:pre-wrap;font:inherit}@media print{body{margin:0}}</style></head><body><h1>${e(title)}</h1><p>${e(company)} · FORX</p>${body}</body></html>`;
}
export function printMenu(menu,state) {
  const costs=state.menuCosts[menu.id];
  return document(menu.name,`<p>Comensales: ${e(menu.diners)}. Costeo actual; los precios pueden cambiar tras otra validación.</p>`+costs.map((c,i)=>`<section><h2>${e(menu.days[i].date)} · ${e(menu.days[i].label)}</h2><p>Línea: ${e(c.line?.name || 'Sin línea')}</p><table><thead><tr><th>Servicio</th><th>Platillo</th><th>Costo por porción</th></tr></thead><tbody>${c.slots.map(s=>`<tr><td>${e(s.slot.label)}</td><td>${e(s.recipe?.name || 'Sin receta')}</td><td>${s.slot.charged?e(money(s.cost?.total)):'Se cobra en la canasta'}</td></tr>`).join('')}</tbody></table><p>Costo total por comida: ${e(money(c.total))} · ${e(c.band)}</p>${c.missing.length?`<p class="notice">Costo no verificable: ${c.missing.map(m=>e(`${m.name}: ${m.reason}`)).join('; ')}</p>`:''}</section>`).join(''),state.settings.identity.company);
}
export function printRecipes(recipes,state,diners=1) {
  return document('Libro de recetas',recipes.map(r=> {
    const c=state.recipeCosts[r.id],factor=new Decimal(diners).div(r.baseServings);
    return `<section class="recipe"><h2>${e(r.code)} · ${e(r.name)}</h2><p>${e(r.region)} · ${e(r.minutes)} min · ${e(diners)} porciones</p><table><thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Costo</th><th>Observación</th></tr></thead><tbody>${r.lines.map((l,i)=>`<tr><td>${e(l.name)}</td><td>${new Decimal(l.quantity).times(factor).toString()} ${e(l.unit)}</td><td>${e(money(c.lines[i].amount==null?null:new Decimal(c.lines[i].amount).times(factor)))}</td><td>${e(c.lines[i].observationId || c.lines[i].reason)}</td></tr>`).join('')}</tbody></table><p>Costo por porción: ${e(money(c.total))}</p>${c.missing.length?`<p class="notice">Costo no verificable: ${c.missing.map(m=>e(`${m.name}: ${m.reason}`)).join('; ')}</p>`:''}<h3>Procedimiento</h3><pre>${e(r.instructions)}</pre></section>`;
  }).join(''),state.settings.identity.company);
}
export function recipesText(recipes) {
  return recipes.map(r=>`NOMBRE: ${r.name}\nTIPO: ${r.type}\nREGION: ${r.region}\nCARNICO: ${r.protein}\nPORCIONES_BASE: ${r.baseServings}\nINGREDIENTES:\n${r.lines.map(l=>`* ${l.name}: ${l.quantity} ${l.unit}`).join('\n')}\nPROCEDIMIENTO:\n${r.instructions}`).join('\n\n---\n\n');
}
export function printGrillMenu(recipes,state) {
  return document('Grill Express',`<table><thead><tr><th>Platillo</th><th>Precio de venta</th></tr></thead><tbody>${recipes.map(r=>`<tr><td>${e(r.name)}</td><td>${r.salePrice?e(money(r.salePrice)):'Por definir'}</td></tr>`).join('')}</tbody></table><p>Precios de venta capturados por administración. No constituyen validación del costo de las recetas.</p>`,state.settings.identity.company);
}
// Small OOXML writer (inline strings, no formulas or remote dependencies).
// Uncompressed ZIP preserves interoperable .xlsx output without a CDN runtime.
export function xlsx(rows) {
  const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
  const files={
    '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Menú FORX" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row,i)=>`<row r="${i+1}">${row.map((cell,j)=>`<c r="${col(j)}${i+1}" t="inlineStr"><is><t xml:space="preserve">${e(cell).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'')}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`
  };
  const encoder=new TextEncoder(),chunks=[],central=[];let offset=0;
  const block=(size)=>({bytes:new Uint8Array(size),view:null});
  for (const [name,xml] of Object.entries(files)) {
    const filename=encoder.encode(name),data=encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+xml);
    let crc=0xffffffff; for(const b of data){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);} crc=(crc^0xffffffff)>>>0;
    const h=block(30+filename.length);h.view=new DataView(h.bytes.buffer);
    h.view.setUint32(0,0x04034b50,true);h.view.setUint16(4,20,true);h.view.setUint16(6,0x800,true);h.view.setUint32(14,crc,true);h.view.setUint32(18,data.length,true);h.view.setUint32(22,data.length,true);h.view.setUint16(26,filename.length,true);h.bytes.set(filename,30);
    const c=block(46+filename.length);c.view=new DataView(c.bytes.buffer);
    c.view.setUint32(0,0x02014b50,true);c.view.setUint16(4,20,true);c.view.setUint16(6,20,true);c.view.setUint16(8,0x800,true);c.view.setUint32(16,crc,true);c.view.setUint32(20,data.length,true);c.view.setUint32(24,data.length,true);c.view.setUint16(28,filename.length,true);c.view.setUint32(42,offset,true);c.bytes.set(filename,46);
    chunks.push(h.bytes,data);central.push(c.bytes);offset+=h.bytes.length+data.length;
  }
  const centralSize=central.reduce((n,c)=>n+c.length,0),end=new Uint8Array(22),view=new DataView(end.buffer);
  view.setUint32(0,0x06054b50,true);view.setUint16(8,central.length,true);view.setUint16(10,central.length,true);view.setUint32(12,centralSize,true);view.setUint32(16,offset,true);
  const result=new Uint8Array(offset+centralSize+22);let cursor=0;for(const c of [...chunks,...central,end]){result.set(c,cursor);cursor+=c.length;}return result;
}
