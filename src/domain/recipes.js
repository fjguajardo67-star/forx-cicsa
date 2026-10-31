import { boundedDecimal } from './bounded-decimal.js';

export const TYPES = Object.freeze([
  { id:'guisado', label:'Guisado', plural:'Guisados', prefix:'G', main:true },
  { id:'garnacha', label:'Garnacha', plural:'Garnachas', prefix:'GN', main:true },
  { id:'guarnicion', label:'Guarnición', plural:'Guarniciones', prefix:'GU' },
  { id:'postre', label:'Postre', plural:'Postres', prefix:'PO' },
  { id:'agua', label:'Agua', plural:'Aguas', prefix:'AG' },
  { id:'grill', label:'Grill Express', plural:'Grill Express', prefix:'GX', main:true }
]);
// `porcion` preserves an unresolved legacy serving exactly as captured. It is
// deliberately incompatible with catalog units until grams per portion and a
// source note are confirmed; it must never acquire a price by name alone.
export const UNIT = Object.freeze({ g:['kg','0.001'], kg:['kg','1'], ml:['l','0.001'], l:['l','1'], pz:['pz','1'], porcion:['porcion','1'] });
export const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const nameKey = value => encodeURIComponent(norm(value));
export function number(value, label, { zero=false, max='1000000000' }={}) {
  let n;
  try { n = boundedDecimal(value, label, {max}); } catch { throw new Error(`${label}: indica un número válido dentro del rango y con hasta 32 decimales.`); }
  if (!n.isFinite() || (zero ? n.lt(0) : n.lte(0)) || n.gt(max)) throw new Error(`${label}: fuera del rango permitido.`);
  return n.toString();
}
export function required(value, label, max=180) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label}: escribe un texto de hasta ${max} caracteres.`);
  return value.trim();
}
export function validateLine(input, index=0) {
  const rawUnit=norm(input.unit).replace(/\s+/g,'');
  const unit = rawUnit === 'lt' ? 'l' : rawUnit === 'porción' ? 'porcion' : rawUnit;
  if (!Object.hasOwn(UNIT, unit)) throw new Error(`Renglón ${index+1}: selecciona g, kg, ml, l, pz o porción pendiente.`);
  return { id:input.id || crypto.randomUUID(), name:required(input.name, `Ingrediente ${index+1}`),
    quantity:number(input.quantity, `Cantidad ${index+1}`), unit,
    ingredientId:input.ingredientId ? required(input.ingredientId, 'Vínculo', 200) : null,
    // Defaults express no conversion/yield adjustment, never guessed equivalents.
    yieldFactor:number(input.yieldFactor ?? '1', 'Rendimiento', { max:100 }),
    gramsPerPiece:input.gramsPerPiece == null || input.gramsPerPiece === '' ? null : number(input.gramsPerPiece, 'Gramos por pieza'),
    conversionNote:String(input.conversionNote || '').trim().slice(0,500) };
}
export function validateRecipe(input) {
  const type = TYPES.find(t => t.id === input.type);
  if (!type) throw new Error('Selecciona un tipo de receta.');
  if (!Array.isArray(input.lines) || input.lines.length > 200) throw new Error('La receta admite hasta 200 ingredientes.');
  if (type.main && !input.lines.length) throw new Error('Un plato fuerte necesita ingredientes con cantidad y unidad.');
  const lines = input.lines.map(validateLine);
  const disposables = (input.disposables || []).map(validateLine);
  if (disposables.length > 50) throw new Error('Demasiados desechables.');
  if (new Set([...lines,...disposables].map(l => l.id)).size !== lines.length + disposables.length) throw new Error('Hay renglones con identidad repetida.');
  for (const line of [...lines,...disposables]) if ((line.gramsPerPiece || line.yieldFactor !== '1') && !line.conversionNote) throw new Error(`Documenta la equivalencia o rendimiento de ${line.name}.`);
  return { name:required(input.name, 'Nombre'), type:type.id, baseServings:number(input.baseServings, 'Porciones base', { max:99999 }),
    region:String(input.region || '').trim().slice(0,100), protein:type.main ? String(input.protein || '').trim().slice(0,100) : '',
    minutes:number(input.minutes ?? '60', 'Tiempo', { zero:true, max:10000 }),
    instructions:required(input.instructions || 'Sin procedimiento capturado.', 'Procedimiento', 50000),
    lines, disposables:type.id === 'grill' ? disposables : [],
    salePrice:type.id === 'grill' && input.salePrice !== '' && input.salePrice != null ? number(input.salePrice, 'Precio de venta', { zero:true }) : null,
    productionCost:type.id === 'grill' ? number(input.productionCost ?? '0','Producción', { zero:true }) : '0',
    status:['active','draft','archived'].includes(input.status) ? input.status : 'active',
    omitted:input.omitted === true, notes:String(input.notes || '').slice(0,4000) };
}

// Strict successor of FORX parsearRecetaEstructurada/separarBloques. No price or
// ingredient identity is inferred from a captured name; every entry is reviewed.
export function parseRecipeBatch(text) {
  if (typeof text !== 'string' || text.length > 2_000_000) throw new Error('Lote demasiado grande.');
  const blocks = text.replace(/\r\n?/g,'\n').split(/\n\s*(?:⸻+|[-_=]{3,})\s*\n|(?=^\s*NOMBRE:)/im).map(x=>x.trim()).filter(Boolean);
  if (blocks.length > 100) throw new Error('Procesa hasta 100 recetas por lote.');
  return blocks.map((block,index) => {
    try {
      const r = { name:'', type:'guisado', baseServings:'', lines:[], instructions:'', region:'', protein:'' };
      let section='';
      for (const raw of block.split('\n')) {
        const line=raw.trim(); if (!line) continue;
        const header=line.match(/^(NOMBRE|TIPO|REGI[ÓO]N|C[ÁA]RNICO|TIEMPO|PORCIONES[_ ]BASE|INGREDIENTES|PROCEDIMIENTO|PREPARACI[ÓO]N):\s*(.*)$/i);
        if (header) {
          const key=norm(header[1]), value=header[2]; section='';
          const fields={nombre:'name', tipo:'type', region:'region', carnico:'protein', tiempo:'minutes', porciones_base:'baseServings', 'porciones base':'baseServings'};
          if (fields[key]) r[fields[key]]=key==='tipo' ? norm(value) : value;
          else section=key==='ingredientes' ? 'lines' : 'instructions';
          continue;
        }
        if (section==='lines') {
          const m=line.replace(/^[*•-]\s*/,'').match(/^(.+?):\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|lt|l|pz|porci[oó]n)$/i);
          if (!m) throw new Error(`No se interpretó: ${line}. Usa Nombre: cantidad unidad.`);
          r.lines.push({ name:m[1], quantity:m[2], unit:norm(m[3]), ingredientId:null });
        } else if (section==='instructions') r.instructions += `${r.instructions ? '\n' : ''}${line}`;
        else throw new Error(`Campo no reconocido: ${line}`);
      }
      if (!r.baseServings && ['guarnicion','postre','agua'].includes(r.type) && !r.lines.length) r.baseServings='1';
      return { index, recipe:validateRecipe(r), error:null };
    } catch (error) { return { index, recipe:null, error:error.message }; }
  });
}
