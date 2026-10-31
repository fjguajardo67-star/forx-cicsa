import {describe,test,expect} from 'vitest';
import {previewLegacyBackup,LEGACY_BACKUP_MAX_BYTES} from '../src/domain/legacy-recipe-preview.js';
import {legacyBackup,legacyRecipe} from './fixtures/legacy-recipes.js';

const preview=(data=legacyBackup(),existingRecipes=[])=>previewLegacyBackup(JSON.stringify(data),{existingRecipes});
describe('vista previa de respaldo anterior: solo lectura',()=>{
  test('separa copias coincidentes; conserva cantidades por porción y referencias de comensales',()=>{
    const data=legacyBackup(),before=structuredClone(data),report=preview(data);
    expect(data).toEqual(before);expect(report.defaultSource).toBe('local');
    expect(report.sources.local.summary).toMatchObject({menu:9,grill:1,total:10,omitted:1,deleted:1});
    expect(report.comparisons.every(c=>c.equal)).toBe(true);
    expect(report.sources.local.rows[0]).toMatchObject({originalServings:'50',destinationServings:'500',lines:[{name:'Jitomate de prueba',quantity:'150',unit:'g'}]});
    expect(report.sources.local.hasConfig).toBe(true);expect(report.sources.nube.hasConfig).toBe(false);
  });
  test('nunca devuelve precios antiguos, credenciales, configuración aplicable ni vínculos inventados',()=>{
    const data=legacyBackup();data.local.recetas[0].ingredientes[0].ingredientId='untrusted-link';
    data.local.recetas[0].secret='not-for-preview';data.local.config.apiKey='secret-setting';
    const output=JSON.stringify(preview(data));
    expect(output).not.toMatch(/98765|precio_kg|precio_venta|precio_unidad|ingredientId|private-synthetic|untrusted-link|secret-setting|not-for-preview/);
    expect(preview(data).sources.local.configFields).not.toContain('apiKey');
  });
  test('marca duplicados por acento y no descarta recetas con el mismo ID',()=>{
    const rows=preview().sources.local.rows;
    expect(rows.filter(r=>r.issues.some(i=>i.code==='duplicate_name'))).toHaveLength(2);
    expect(rows.filter(r=>r.issues.some(i=>i.code==='duplicate_id'))).toHaveLength(2);
    expect(new Set(rows.map(r=>r.key)).size).toBe(rows.length);
  });
  test('conserva porción, omisiones, borrador y eliminación sin corregirlos',()=>{
    const source=preview().sources.local;
    const salad=source.rows.find(r=>r.collection==='grill');
    expect(salad).toMatchObject({status:'borrador',lines:[{quantity:'1',unit:'porcion'}],disposables:[{quantity:'1',unit:'pz'}]});
    expect(salad.issues.map(i=>i.code)).toContain('portion');
    expect(salad.issues.map(i=>i.code)).not.toContain('unit');
    expect(source.rows.find(r=>r.deleted).issues.map(i=>i.code)).toContain('deleted');
    expect(source.deleted).toHaveLength(2);
  });
  test('advierte procedimiento faltante y cantidades uniformes sin validar calidad culinaria',()=>{
    const row=preview().sources.local.rows.find(r=>r.name==='Sopes de prueba');
    expect(row.issues.map(i=>i.code)).toEqual(expect.arrayContaining(['procedure','uniform_quantities']));
    expect(row.lines.every(l=>l.quantity==='25')).toBe(true);
  });
  test('detecta coincidencias con catálogo activo o archivado sin tocarlo',()=>{
    const existing=[{name:'PIPIAN DE PRUEBA',code:'G-001',status:'archived'}],before=structuredClone(existing);
    expect(preview(legacyBackup(),existing).sources.local.rows.filter(r=>r.issues.some(i=>i.code==='existing'))).toHaveLength(2);
    expect(existing).toEqual(before);
  });
  test('hace visibles diferencias entre nube y local, no las fusiona',()=>{
    const data=legacyBackup();data.nube.recetas[0].ingredientes[0].cantidad=900;
    const report=preview(data);expect(report.comparisons.find(c=>c.label==='Recetas').equal).toBe(false);
    expect(report.sources.local.rows[0].lines[0].quantity).toBe('150');
    expect(report.sources.nube.rows[0].lines[0].quantity).toBe('900');
    expect(report.sources.local.rows[0].issues.map(i=>i.code)).toContain('copy_difference');
  });
  test('admite solo una copia, BOM y respaldo vacío',()=>{
    const data=legacyBackup();delete data.local;expect(preview(data).defaultSource).toBe('nube');
    expect(previewLegacyBackup('\uFEFF'+JSON.stringify(data)).sources.nube.summary.total).toBe(10);
    expect(preview({local:{recetas:[],alacarta:[]}}).sources.local.summary.total).toBe(0);
  });
  test('rechaza archivos ajenos, malformados, listas rotas, tamaño y cantidad excesivos',()=>{
    for(const value of ['', '{}','[]','null','{"schema":2,"recipes":[]}'])expect(()=>previewLegacyBackup(value)).toThrow();
    expect(()=>previewLegacyBackup('x'.repeat(LEGACY_BACKUP_MAX_BYTES+1))).toThrow(/10 MB/);
    expect(()=>preview({local:{recetas:[],alacarta:{}}})).toThrow(/listas/);
    expect(()=>preview({local:{recetas:[],alacarta:[],borradas:[{}]}})).toThrow(/borradas/);
    expect(()=>preview({local:{recetas:Array(5001).fill({}),alacarta:[]}})).toThrow(/5,000/);
  });
  test('los registros inválidos permanecen visibles con advertencias; no se omiten silenciosamente',()=>{
    const data={local:{recetas:[null,legacyRecipe({ingredientes:[{nombre:'',cantidad:0,unidad:'taza'}]})],alacarta:[]}};
    const report=preview(data);expect(report.sources.local.rows).toHaveLength(2);
    expect(report.sources.local.rows[0].issues.map(i=>i.code)).toContain('invalid_record');
    expect(report.sources.local.rows[1].issues.map(i=>i.code)).toEqual(expect.arrayContaining(['quantity','line_name','unit']));
  });
});
