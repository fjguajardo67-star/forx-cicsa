import { describe,it,expect } from 'vitest';
import { SaxesParser } from 'saxes';
import { csv,xlsx,shoppingList,printRecipes,printMenu,menuRows } from '../src/domain/kitchen-exports.js';
import { costRecipe,costMenuDay } from '../src/domain/costing.js';
import { defaultKitchenSettings } from '../src/domain/kitchen-service.js';
import { validateRecipe } from '../src/domain/recipes.js';
import { MAIN_SLOTS } from '../src/domain/menus.js';

describe('documentos FORX y cantidades de compra',()=>{
  it('XLSX es ZIP OOXML con texto, sin fórmulas ni XML ejecutable',()=>{
    const data=Buffer.from(xlsx([['Ingrediente','Costo'],['=HYPERLINK("bad")','A&B <pollo>'],['Árroz','No verificable']]));
    const files=new Map();let offset=0;
    while(data.readUInt32LE(offset)===0x04034b50){
      expect(data.readUInt16LE(offset+8)).toBe(0);
      const size=data.readUInt32LE(offset+18),n=data.readUInt16LE(offset+26),extra=data.readUInt16LE(offset+28);
      const name=data.subarray(offset+30,offset+30+n).toString();
      const start=offset+30+n+extra,xml=data.subarray(start,start+size).toString();
      new SaxesParser({xmlns:true}).write(xml).close();files.set(name,xml);offset=start+size;
    }
    expect(data.readUInt32LE(offset)).toBe(0x02014b50);
    expect(data.readUInt32LE(data.length-22)).toBe(0x06054b50);
    expect(files.size).toBe(5);const sheet=files.get('xl/worksheets/sheet1.xml');
    expect(sheet).not.toContain('<f>');expect(sheet).toContain('t="inlineStr"');expect(sheet).toContain('A&amp;B &lt;pollo&gt;');expect(sheet).toContain('No verificable');
    expect(csv([['=2+3','+cmd','@a','-1','a"b']])).toBe('\uFEFF"\'=2+3","\'+cmd","\'@a","\'-1","a""b"');
  });
  it('compras escala por base, calcula merma una vez y conserva advertencias al imprimir',()=>{
    const catalog=[{id:'i',canonicalName:'Tomate',status:'active',baseUnit:'kg',wastePct:'20',currentPrice:{id:'p',normalizedPrice:'50'}}];
    const recipe={id:'r',code:'G-001',...validateRecipe({name:'<script>prueba</script>',type:'guisado',baseServings:'2',lines:[{name:'Tomate',ingredientId:'i',quantity:'400',unit:'g'},{name:'Faltante',quantity:'10',unit:'pz'}],instructions:'<img src=x onerror=alert(1)>'})};
    const settings={...defaultKitchenSettings(),confirmed:true,complements:[]};
    const menu={id:'m',name:'Prueba',diners:'10',days:[{date:'2026-10-05',label:'Lunes',contractLineId:'comida-completa',slots:MAIN_SLOTS.map((s,i)=>({...s,charged:true,recipeId:i===0?'r':null})),warnings:[]}]};
    const state={catalog,recipes:[recipe],settings,recipeCosts:{r:costRecipe(recipe,catalog,settings)},menuCosts:{m:[costMenuDay(menu.days[0],[recipe],catalog,settings)]}};
    const rows=shoppingList(menu,state);expect(rows.find(r=>r.ingredientId==='i')).toMatchObject({quantity:'2',buyQuantity:'2.5',amount:'100'});
    expect(rows.find(r=>r.name==='Faltante')).toMatchObject({amount:null,buyQuantity:null});
    const book=printRecipes([recipe],state,10);expect(book).toContain('2000 g');expect(book).toContain('Costo no verificable');expect(book).not.toContain('<script>');expect(book).toContain('&lt;img');
    expect(printMenu(menu,state)).toContain('Falta receta disponible');expect(menuRows(menu,state.menuCosts.m)[1][6]).toBe('No verificable');
  });
});
