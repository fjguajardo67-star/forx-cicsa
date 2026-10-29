// @vitest-environment jsdom
import { test,expect,vi } from 'vitest';
import { mountRecipeGenerator } from '../src/ui/forx/recipe-generator.js';
const capabilities={enabled:true,mode:'simulated',limits:{userDaily:10,projectMonthly:100}};
function mount(service={}) {
  document.body.innerHTML='<main id="generator"></main>';const root=document.querySelector('main'),editor=vi.fn();
  const controller=mountRecipeGenerator(root,service,()=>({catalog:[],generation:capabilities}),editor);
  const $=selector=>root.querySelector(selector);
  $('[name="idea"]').value='Idea que debe conservarse';
  return {$,controller,editor,submit:()=>$('#generator-form').dispatchEvent(new Event('submit',{cancelable:true}))};
}
test('UI: bloquea doble envío, conserva captura y consulta el mismo ID sin generar otra',async()=>{
  let reject;const service={generateRecipeProposal:vi.fn(()=>new Promise((_,r)=>reject=r)),recipeProposalStatus:vi.fn(async()=>({status:'uncertain',error:'Reserva conservada.'}))};
  const {$,submit,controller}=mount(service);submit();submit();
  expect(service.generateRecipeProposal).toHaveBeenCalledTimes(1);expect($('.generator-fields').disabled).toBe(true);expect($('#generator-progress').textContent).toContain('Preparando');
  reject(new Error('Conexión interrumpida'));await vi.waitFor(()=>expect($('#generator-error').textContent).toContain('Conexión interrumpida'));
  expect($('[name="idea"]').value).toBe('Idea que debe conservarse');
  $('#proposal-status').click();await vi.waitFor(()=>expect(service.recipeProposalStatus).toHaveBeenCalledTimes(1));
  expect(service.recipeProposalStatus).toHaveBeenCalledWith({requestId:service.generateRecipeProposal.mock.calls[0][0].requestId});
  expect(service.generateRecipeProposal).toHaveBeenCalledTimes(1);expect($('#generator-error').textContent).toBe('Reserva conservada.');controller.dispose();
});
test('UI: texto del proveedor escapado; abrir editor no guarda, vincula ni activa',async()=>{
  const recipe={name:'<img src=x onerror=alert(1)>',type:'guisado',baseServings:'10',minutes:'10',lines:[{id:'one',name:'<script>bad</script>',quantity:'100',unit:'g',ingredientId:null}],instructions:'<b>sin HTML</b>',status:'draft'};
  const response={status:'completed',generationRequestId:'gen_test',proposal:{recipe,adaptations:[],warnings:['<img onerror=bad>']},suggestions:[]};
  const service={generateRecipeProposal:vi.fn(async()=>response)},{$,submit,editor,controller}=mount(service);submit();
  await vi.waitFor(()=>expect($('#review-proposal')).not.toBeNull());expect($('#proposal-result img')).toBeNull();expect($('#proposal-result script')).toBeNull();expect($('#proposal-title').textContent).toBe(recipe.name);
  $('#review-proposal').click();expect(editor).toHaveBeenCalledWith({...recipe,generationRequestId:'gen_test'});
  expect(controller.isDirty()).toBe(true);controller.saved('gen_test');expect(controller.isDirty()).toBe(false);expect($('#review-proposal')).toBeNull();controller.dispose();
});
test('UI: modo OpenAI identifica datos enviados y no llama simulada a la propuesta',async()=>{
  const root=document.createElement('main');document.body.replaceChildren(root);
  const generation={enabled:true,mode:'openai',limits:{userDaily:10,projectMonthly:100}};
  const service={generateRecipeProposal:vi.fn(async()=>({status:'uncertain',mode:'openai',error:'Consumo aún sin confirmar.'}))};
  const controller=mountRecipeGenerator(root,service,()=>({catalog:[],generation}),vi.fn());
  expect(root.querySelector('#generator-mode').textContent).toContain('Generación con OpenAI');
  expect(root.querySelector('#generator-privacy').textContent).toContain('se enviarán a OpenAI');
  expect(root.querySelector('#generate-proposal').textContent).toBe('Generar propuesta con OpenAI');
  root.querySelector('[name="idea"]').value='Sopa de verduras';
  root.querySelector('#generator-form').dispatchEvent(new Event('submit',{cancelable:true}));
  await vi.waitFor(()=>expect(root.querySelector('#generator-error').textContent).toContain('Consumo aún sin confirmar'));
  expect(service.generateRecipeProposal).toHaveBeenCalledTimes(1);controller.dispose();
});
test('UI: desmontar durante la espera no presenta resultados ni guarda datos',async()=>{
  let resolve;const service={generateRecipeProposal:vi.fn(()=>new Promise(r=>resolve=r))};const {$,submit,controller,editor}=mount(service);
  submit();controller.dispose();resolve({status:'completed',proposal:{}});await Promise.resolve();await Promise.resolve();
  expect($('#proposal-result').hidden).toBe(true);expect(editor).not.toHaveBeenCalled();
});
