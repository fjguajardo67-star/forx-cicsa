// @vitest-environment jsdom
import {test,expect,vi,afterEach} from 'vitest';
import {createAccessPanel} from '../src/ui/access-panel.js';
let panel;afterEach(()=>{panel?.dispose();vi.restoreAllMocks();});
const admin={uid:'admin',email:'admin@example.invalid',role:'admin',active:true,revision:1};
const other={uid:'other',email:'other@example.invalid',role:'viewer',active:true,revision:3};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function setup(options={}){
  document.body.innerHTML='<div id="root"></div>';const root=document.querySelector('#root');
  const access={list:vi.fn(async()=>[admin,other]),lookup:vi.fn(async uid=>({uid,email:'new@example.invalid',membership:null})),update:vi.fn(async input=>({...input,email:'new@example.invalid',revision:1})),...options.access};
  const signOut=vi.fn(async()=>{});panel=createAccessPanel({access:options.local?null:access,actor:{...admin,...options.actor},signOut});panel.attach(root);
  if(!options.local&&(!options.actor||options.actor.role==='admin')&&!options.pending)await vi.waitFor(()=>expect(root.querySelectorAll('[data-users-edit]')).toHaveLength(2));
  return {root,access,signOut};
}
function click(action){document.querySelector(`[data-users="${action}"]`).click();}
function choose(name,value){const el=document.querySelector(`[name="${name}"]`);el.value=value;el.dispatchEvent(new Event(name==='uid'?'input':'change',{bubbles:true}));}
function submit(name){document.querySelector(`[data-users-form="${name}"]`).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}
async function newAccount(){click('new');choose('uid','new-account');submit('lookup');await vi.waitFor(()=>expect(document.querySelector('[name="role"]')).not.toBeNull());}
function edit(uid){document.querySelector(`[data-users-edit="${uid}"]`).click();}
test.each(['viewer','editor'])('rol %s no consulta ni muestra cuentas',async role=>{
  const {root,access}=await setup({actor:{role}});expect(access.list).not.toHaveBeenCalled();expect(root.textContent).not.toContain(admin.email);expect(root.querySelector('[data-users="new"]')).toBeNull();
});
test('sesión local sin API no ofrece altas ficticias como si fueran reales',async()=>{
  const {root,access}=await setup({local:true});expect(access.list).not.toHaveBeenCalled();expect(root.textContent).toContain('requiere el servidor autenticado');
});
test('comprobar UID no autoriza; consulta por defecto y confirmación explícita sin doble envío',async()=>{
  const pending=deferred(),{access,root}=await setup({access:{update:vi.fn(()=>pending.promise)}});
  await newAccount();expect(access.update).not.toHaveBeenCalled();expect(root.querySelector('[name="role"]').value).toBe('viewer');
  submit('edit');expect(root.textContent).toContain('new@example.invalid');expect(root.textContent).toContain('new-account');expect(access.update).not.toHaveBeenCalled();
  click('save');click('save');expect(access.update).toHaveBeenCalledTimes(1);expect(access.update).toHaveBeenCalledWith({uid:'new-account',role:'viewer',active:true,expectedRevision:null});
  pending.resolve({uid:'new-account',email:'new@example.invalid',role:'viewer',active:true,revision:1});await vi.waitFor(()=>expect(root.textContent).toContain('Permisos guardados'));
});
test('desactivar conserva datos y permite volver sin escribir; payload incluye revisión',async()=>{
  const {root,access}=await setup();edit('other');choose('active','false');submit('edit');expect(root.textContent).toContain('Sus compras, recetas y decisiones se conservarán');
  click('back');expect(access.update).not.toHaveBeenCalled();submit('edit');click('save');await vi.waitFor(()=>expect(access.update).toHaveBeenCalledWith({uid:'other',role:'viewer',active:false,expectedRevision:3}));
});
test('último administrador bloqueado antes de confirmar',async()=>{
  const {root,access}=await setup();edit('admin');choose('role','editor');submit('edit');expect(root.textContent).toContain('FORX no puede quedarse sin administrador');expect(root.querySelector('[data-users="save"]')).toBeNull();expect(access.update).not.toHaveBeenCalled();
});
test.each([409,0])('conflicto o red %s conserva incertidumbre, exige actualizar y nunca reintenta',async status=>{
  const {root,access}=await setup({access:{update:vi.fn(async()=>{throw {status};})}});edit('other');choose('role','editor');submit('edit');click('save');
  await vi.waitFor(()=>expect(root.querySelector('[data-users="refresh"]').disabled).toBe(false));expect(root.querySelector('[data-users="save"]').disabled).toBe(true);
  click('save');expect(access.update).toHaveBeenCalledTimes(1);click('refresh');await vi.waitFor(()=>expect(access.list).toHaveBeenCalledTimes(2));expect(root.querySelector('[data-users="save"]')).toBeNull();
});
test('revocación 403 retira datos privados y borrador',async()=>{
  const {root,access}=await setup();access.list.mockRejectedValueOnce({status:403});click('refresh');await vi.waitFor(()=>expect(root.textContent).toContain('Ya no tienes permiso'));expect(root.textContent).not.toContain(other.email);expect(root.querySelector('[data-users="new"]')).toBeNull();
});
test('fallo de revocación se advierte como guardado, no invita a duplicar',async()=>{
  const {root}=await setup({access:{update:vi.fn(async input=>({...other,...input,revision:4,sessionRevocationPending:true}))}});edit('other');choose('active','false');submit('edit');click('save');await vi.waitFor(()=>expect(root.textContent).toContain('Quedó pendiente invalidar'));expect(root.querySelector('[data-users="save"]')).toBeNull();
});
test('cambio propio con segundo administrador avisa y cierra sesión',async()=>{
  const {root,signOut}=await setup({access:{list:vi.fn(async()=>[admin,{...other,role:'admin'}])}});edit('admin');choose('role','viewer');submit('edit');expect(root.textContent).toContain('se cerrará tu sesión');click('save');await vi.waitFor(()=>expect(signOut).toHaveBeenCalledTimes(1));
});
test('cuentas y errores se escapan; respuesta tardía al desmontar no reaparece',async()=>{
  const pending=deferred(),{root}=await setup({pending:true,access:{list:vi.fn(()=>pending.promise)}});panel.attach(null);root.textContent='Otra pantalla';pending.resolve([admin,{...other,email:'<script>secret</script>'}]);await Promise.resolve();expect(root.textContent).toBe('Otra pantalla');
  panel.dispose();await setup({access:{list:vi.fn(async()=>[admin,{...other,email:'<script>secret</script>'}])}});expect(document.querySelector('script')).toBeNull();expect(document.body.textContent).toContain('<script>secret</script>');
});
