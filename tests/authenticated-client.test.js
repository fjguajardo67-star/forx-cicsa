import {test,expect,vi} from 'vitest';
import {clientConfig,browserMode} from '../src/data/client-config.js';
import {createAuthenticatedApi} from '../src/data/authenticated-api.js';
import {backendFixture,config} from './fixtures/backend.js';
import {AccessService} from '../src/server/access-service.js';

const configuration={enabled:true,environment:'staging',appOrigin:'https://forx.example.com',apiOrigin:'https://api.example.com',firebase:{projectId:'forx-v2-pruebas',authDomain:'forx-v2-pruebas.firebaseapp.com',apiKey:'AIza'+'x'.repeat(35),appId:'1:12345:web:abcde'}};
const location={origin:configuration.appOrigin,protocol:'https:'};
test('build público falla cerrado: URL y almacenamiento no habilitan modos locales',()=>{
  for(const search of ['', '?backend=emulator&authPreview=1','?backend=indexeddb'])expect(browserMode({dev:false,hostname:'127.0.0.1',search})).toBe('authenticated');
  expect(browserMode({dev:true,hostname:'forx.example.com',search:'?backend=emulator'})).toBe('authenticated');
  expect(browserMode({dev:true,hostname:'127.0.0.1',search:'?authPreview=1'})).toBe('auth-preview');
  expect(browserMode({dev:true,hostname:'127.0.0.1',search:'?backend=emulator'})).toBe('emulator');
});
test('configuración pública exige proyecto propio, HTTPS y origen exacto; ignora extras',()=>{
  const {enabled,...expected}=configuration;
  expect(clientConfig(JSON.stringify({...configuration,secret:'not forwarded'}),location)).toEqual(expected);
});
test('configuración incompleta, redireccionada o ajena no inicializa proveedor',()=>{
  for(const change of [{enabled:false},{firebase:{...configuration.firebase,projectId:'another-project'}},{apiOrigin:'http://localhost:8788'},{apiOrigin:'https://evil.example/path'},{appOrigin:'https://another.example.com'},{firebase:{...configuration.firebase,authDomain:'evil.example.com'}}])
    expect(()=>clientConfig(JSON.stringify({...configuration,...change}),location)).toThrow(/configurado/);
  expect(()=>clientConfig(undefined,location)).toThrow();
});
const setup=(fetchImpl)=>{
  const user={uid:'one',getIdToken:vi.fn(async()=>'secret-id-token')},auth={currentUser:user},expired=vi.fn();
  const api=createAuthenticatedApi({endpoint:'https://api.example.com',user,auth,fetchImpl,onUnauthorized:expired});return {user,auth,api,expired};
};
test('API usa token renovable del SDK; sin cookies, caché, redirects ni /session',async()=>{
  const fetchImpl=vi.fn(async()=>({ok:true,json:async()=>({result:{role:'editor'}})})),{api,user}=setup(fetchImpl);
  expect(await api.request('/identity')).toEqual({role:'editor'});
  expect(user.getIdToken).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/identity',expect.objectContaining({credentials:'omit',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer secret-id-token'}}));
  await expect(api.request('/session')).rejects.toThrow(/permitida/);api.close();
});
test('401 retira sesión; errores no imprimen respuesta cruda y nunca reintentan writes',async()=>{
  const fetchImpl=vi.fn(async()=>({status:401,ok:false,json:async()=>({error:'secret-internal-response'})})),{api,expired}=setup(fetchImpl);
  await expect(api.request('/commands',{command:'saveRecipe'})).rejects.toMatchObject({status:401});
  expect(expired).toHaveBeenCalledTimes(1);expect(fetchImpl).toHaveBeenCalledTimes(1);api.close();
});
test('cierre y cambio de cuenta descartan respuestas tardías y bloquean llamadas nuevas',async()=>{
  let resolve;const fetchImpl=vi.fn(()=>new Promise(r=>resolve=r)),{api,auth}=setup(fetchImpl);
  const pending=api.request('/commands');const assertion=expect(pending).rejects.toMatchObject({status:401});
  await vi.waitFor(()=>expect(fetchImpl).toHaveBeenCalled());api.close();auth.currentUser={uid:'two'};
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  resolve({ok:true,json:async()=>({result:'private-one'})});await assertion;
  await expect(api.request('/identity')).rejects.toMatchObject({status:401});
});
test('timeout/red devuelve incertidumbre sin duplicar el comando',async()=>{
  const fetchImpl=vi.fn(async()=>{throw new Error('secret-network-details');}),{api}=setup(fetchImpl);
  await expect(api.request('/commands')).rejects.toThrow(/Actualiza los datos/);
  expect(fetchImpl).toHaveBeenCalledTimes(1);api.close();
});
test('Google no concede membresía; password y cuentas no verificadas se rechazan',async()=>{
  const f=backendFixture({...config,signInProvider:'google.com'});f.user('known');
  await expect(f.runtime.access.authenticate('known')).rejects.toMatchObject({status:403});
  await f.runtime.access.bootstrap('known');expect((await f.runtime.access.authenticate('known')).actor.role).toBe('admin');
  const wrong=new AccessService({db:f.runtime.db,auth:f.runtime.auth,provider:'password'});
  await expect(wrong.authenticate('known')).rejects.toMatchObject({status:403});
  f.users.get('known').emailVerified=false;await expect(f.runtime.access.authenticate('known')).rejects.toMatchObject({status:403});
});
