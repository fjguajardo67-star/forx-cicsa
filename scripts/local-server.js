import { createEmulatorRuntime } from '../src/server/emulator-runtime.js';
import { createLocalCommandServer } from '../src/server/local-http.js';
import { createSimulatedRecipeProvider } from '../src/domain/simulated-recipe-provider.js';

// Only a synthetic emulator account. No credentials, tokens or original XML are
// written to disk or logs. This server has no production start mode.
const port=Number(process.env.FORX_LOCAL_PORT || 8787);
if(!Number.isInteger(port) || port<1024 || port>65535)throw new Error('Puerto local inválido.');
const generationMode=process.env.FORX_RECIPE_PROVIDER || 'disabled';
if(!['disabled','simulated'].includes(generationMode))throw new Error('Solo se permite generación desactivada o simulada. OpenAI real no está habilitado.');
const runtime=await createEmulatorRuntime();
const uid=port===8787?'local-demo-admin':`local-demo-admin-${port}`,email=port===8787?'demo@forx.invalid':`${uid}@forx.invalid`,password=crypto.randomUUID();
try{await runtime.auth.getUser(uid);await runtime.auth.updateUser(uid,{password});}
catch(error){if(error.code!=='auth/user-not-found')throw error;await runtime.auth.createUser({uid,email,password});}
await runtime.auth.setCustomUserClaims(uid,{forxActive:true,forxRole:'admin'});
const server=createLocalCommandServer(runtime,{generationProvider:generationMode==='simulated'?createSimulatedRecipeProvider():null,demoSession:async()=>{
  const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
  const value=await response.json();if(!response.ok)throw new Error('No se pudo abrir la sesión de emulador.');
  return {token:value.idToken,actor:{uid,name:'Administrador de pruebas',role:'admin'}};
}});
server.listen(port,'127.0.0.1',()=>console.log(`FORX: comandos locales en 127.0.0.1:${port}. Solo demo-forx-v2.`));
async function stop(){server.close();await runtime.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
