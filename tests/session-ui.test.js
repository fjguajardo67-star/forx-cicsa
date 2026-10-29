// @vitest-environment jsdom
import {test,expect,vi,afterEach} from 'vitest';
import {mountSession} from '../src/ui/session.js';
import {renderSession} from '../src/ui/session-view.js';
let cleanup=()=>{};afterEach(()=>{cleanup();vi.restoreAllMocks();});
const user={uid:'google-test',email:'persona@example.invalid'};
function setup({connection,signIn}={}) {
  document.body.innerHTML='<div id="app"></div>';const root=document.querySelector('#app');let current=null,callback;
  const auth={get currentUser(){return current;},subscribe(fn){callback=fn;fn(null);return()=>{};},signIn:signIn || vi.fn(async()=>emit(user)),signOut:vi.fn(async()=>emit(null))};
  function emit(value){current=value;callback(value);}
  const closed=vi.fn(),disposed=vi.fn(),identity=vi.fn(async()=>({role:'admin'}));
  const mount=vi.fn((node,services)=>{node.textContent='Datos privados de la cuenta';const button=document.createElement('button');button.textContent='Salir';button.onclick=services.signOut;node.append(button);return disposed;});
  const connect=vi.fn(connection || (async({signOut})=>({services:{signOut},actor:{role:'admin'},identity,close:closed})));
  cleanup=mountSession(root,{auth,connect,mount,refreshMs:999999});return {root,auth,emit,mount,closed,disposed,connect,identity};
}
test('no hay contraseña local; recuperación oficial; popup cancelado o bloqueado permite reintentar',async()=>{
  const {root}=setup({signIn:vi.fn(async()=>{throw {code:'auth/popup-blocked'};})});
  expect(root.querySelector('input')).toBeNull();expect(root.querySelector('a').href).toBe('https://accounts.google.com/signin/recovery');
  root.querySelector('[data-access="signin"]').click();
  await vi.waitFor(()=>expect(root.textContent).toContain('Permite ventanas emergentes'));
  expect(root.querySelector('[data-access="signin"]').disabled).toBe(false);
});
test('cuenta Google sin permiso muestra UID escapado y nunca monta catálogo',async()=>{
  const {root,emit,mount}=setup({connection:async()=>{throw {status:403};}});emit({...user,email:'<script>bad</script>'});
  await vi.waitFor(()=>expect(root.textContent).toContain('necesita autorización'));
  expect(root.textContent).toContain(user.uid);expect(root.querySelector('script')).toBeNull();expect(mount).not.toHaveBeenCalled();
});
test('salir limpia contenido y cancela conexión antes de esperar al SDK',async()=>{
  const {root,emit,closed,disposed,auth}=setup();emit(user);await vi.waitFor(()=>expect(root.textContent).toContain('Datos privados'));
  auth.signOut=vi.fn(()=>new Promise(()=>{}));root.querySelector('button').click();
  expect(root.textContent).not.toContain('Datos privados');expect(closed).toHaveBeenCalled();expect(disposed).toHaveBeenCalled();
});
test('autorización tardía después de salir no vuelve a mostrar datos',async()=>{
  let resolve;const close=vi.fn();const {emit,mount}=setup({connection:()=>new Promise(r=>resolve=r)});emit(user);emit(null);
  resolve({services:{},close});await vi.waitFor(()=>expect(close).toHaveBeenCalled());expect(mount).not.toHaveBeenCalled();
});
test('revocación detectada al volver a la ventana retira los datos; sin fallback local',async()=>{
  const {root,emit,identity,closed}=setup();emit(user);await vi.waitFor(()=>expect(root.textContent).toContain('Datos privados'));
  identity.mockRejectedValueOnce({status:403});window.dispatchEvent(new Event('focus'));
  await vi.waitFor(()=>expect(root.textContent).toContain('necesita autorización'));expect(root.textContent).not.toContain('Datos privados');expect(closed).toHaveBeenCalled();
});
test('configuración deshabilitada no ofrece login ni enlace a datos de demo',()=>{
  document.body.innerHTML='<div id="app"></div>';const root=document.querySelector('#app');renderSession(root,{stage:'disabled'});
  expect(root.querySelector('[data-access="signin"]')).toBeNull();expect(root.textContent).toContain('Acceso todavía no habilitado');
});
