// @vitest-environment jsdom
import {test,expect,vi,afterEach} from 'vitest';
import {mountWorkspace} from '../src/ui/workspace.js';
import {MemoryEntityRepository} from '../src/data/entity-repository.js';
import {PantryService} from '../src/domain/pantry-service.js';
import {KitchenService} from '../src/domain/kitchen-service.js';
import {executePantryCommand} from '../src/server/pantry-commands.js';
import {commandServices} from '../src/data/remote-services.js';

let dispose;
afterEach(()=>{dispose?.();dispose=null;vi.restoreAllMocks();});
test('H05: consulta navega desde MiDespensa sin snapshot privado y no puede editar recetas',async()=>{
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  Element.prototype.scrollIntoView=()=>{};
  HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  HTMLDialogElement.prototype.close=function(){this.open=false;};
  const confirm=vi.spyOn(window,'confirm');
  const repository=new MemoryEntityRepository();
  await new PantryService(repository).initialize();
  const kitchen=new KitchenService(repository);await kitchen.initialize();
  await kitchen.saveRecipe({name:'Receta de consulta',type:'guisado',baseServings:'1',minutes:'10',status:'active',
    instructions:'Cocinar.',lines:[{id:'"><img src=x onerror=alert(1)>',name:'Papa',quantity:'100',unit:'g'}]});
  const actor={uid:'viewer',role:'viewer'},call=vi.fn((command,input)=>executePantryCommand(repository,
    {uid:actor.uid,token:{forxActive:true,forxRole:'viewer'}},{command,input}));
  const services=commandServices({actor,call});
  const before=await repository.exportSnapshot();
  history.replaceState(null,'','#/despensa/producto/privado');
  document.body.innerHTML='<main></main>';const root=document.querySelector('main'),onError=vi.fn();
  dispose=mountWorkspace(root,services,onError);
  await vi.waitFor(()=>expect(root.querySelector('#forx-module')?.shadowRoot.querySelector('#precios.on')).toBeTruthy());
  expect(location.hash).toBe('#/forx/precios');expect(onError).not.toHaveBeenCalled();
  expect(call.mock.calls.map(([command])=>command)).toEqual(['kitchenSnapshot']);
  const shadow=root.querySelector('#forx-module').shadowRoot;
  shadow.querySelector('[data-param="cat"]').click();
  await vi.waitFor(()=>expect(shadow.querySelector('[data-action="edit"]')?.textContent).toBe('Ver receta'));
  shadow.querySelector('[data-action="edit"]').click();
  await vi.waitFor(()=>expect(shadow.querySelector('#recipe-form input')?.disabled).toBe(true));
  expect(shadow.querySelector('#recipe-form img')).toBeNull();
  expect(shadow.querySelector('[data-line]').dataset.lineId).toBe('"><img src=x onerror=alert(1)>');
  expect(shadow.querySelector('#editor-summary').textContent).toContain('Subtotal conocido');
  expect(shadow.querySelector('#recipe-form [type="submit"]').hidden).toBe(true);
  shadow.querySelector('#recipe-form').dispatchEvent(new Event('submit',{cancelable:true}));
  shadow.querySelector('[data-action="close"]').click();
  await vi.waitFor(()=>expect(shadow.querySelector('dialog').open).toBe(false));
  expect(confirm).not.toHaveBeenCalled();
  expect(call.mock.calls.map(([command])=>command)).toEqual(['kitchenSnapshot']);
  expect(await repository.exportSnapshot()).toEqual(before);
});
