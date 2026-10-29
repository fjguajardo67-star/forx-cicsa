import '@fontsource-variable/ibm-plex-sans/wght.css';
import './styles.css';
import './ui/midespensa-integration.css';
import './ui/midespensa-light.css';
import { IndexedDbEntityRepository } from './data/entity-repository.js';
import { PantryService } from './domain/pantry-service.js';
import { KitchenService } from './domain/kitchen-service.js';
import { createRemoteServices, commandServices } from './data/remote-services.js';
import { browserMode, clientConfig } from './data/client-config.js';
import { createAuthenticatedApi } from './data/authenticated-api.js';
import { createAccessClient } from './data/access-client.js';
import { mountWorkspace } from './ui/workspace.js';
import { mountSession } from './ui/session.js';
import { renderSession } from './ui/session-view.js';
import './ui/session.css';
import { RECOVERY_NAME } from './data/local-recovery.js';
import { initializeTheme } from './ui/theme.js';
import { createSimulatedRecipeProvider } from './domain/simulated-recipe-provider.js';

initializeTheme();
const root = document.querySelector('#app');
const mode=browserMode({dev:import.meta.env.DEV,hostname:location.hostname,search:location.search});
try {
  if (mode==='authenticated') {
    const config=clientConfig(import.meta.env.VITE_FORX_PUBLIC_CONFIG,location);
    const { createGoogleAuth }=await import('./data/google-auth.js');
    const auth=createGoogleAuth(config);
    mountSession(root,{auth,mount:mountWorkspace,connect:async({user,expire,signOut})=>{
      const api=createAuthenticatedApi({endpoint:config.apiOrigin,auth,user,onUnauthorized:expire});
      try {
        const actor=await api.request('/identity');
        const services=commandServices({actor,mode:config.environment==='production'?'FORX · acceso autorizado':'FORX · entorno de pruebas',
          session:{signOut},call:(command,input={})=>api.request('/commands',{command,input})});
        services.pantry.access=createAccessClient(api);
        return {services,actor,identity:()=>api.request('/identity'),close:()=>api.close()};
      } catch(error) {api.close();throw error;}
    }});
  } else if (import.meta.env.DEV && mode==='auth-preview') {
    const {createAuthPreview}=await import('./dev/auth-preview.js');
    mountSession(root,{...createAuthPreview(),mount:mountWorkspace,preview:true});
  } else {
  let service, kitchen;
  if (mode === 'emulator') {
    ({pantry:service,kitchen} = await createRemoteServices());
  } else {
    const recovery = new URLSearchParams(location.search).get('recovery');
    if (recovery && !RECOVERY_NAME.test(recovery)) throw new Error('Referencia de recuperación inválida.');
    const simulate=import.meta.env.DEV && new URLSearchParams(location.search).get('recipeGenerator')==='simulated';
    if(simulate&&recovery)throw new Error('El simulador utiliza su propia base; no se activa sobre una copia recuperada.');
    const repository = await IndexedDbEntityRepository.open(recovery || (simulate?'forx-v2-simulation':undefined));
    if (recovery && !await repository.get('settings', 'local_recovery')) { repository.close(); throw new Error('La copia recuperada no existe en este navegador.'); }
    service = new PantryService(repository);
    await service.initialize();
    await service.expireLocalOriginals();
    kitchen = new KitchenService(repository,{generationProvider:simulate?createSimulatedRecipeProvider():null});
    if(simulate)service.mode=kitchen.mode='Simulador aislado · datos de prueba · sin OpenAI ni consumo';
    await kitchen.initialize();
    if (recovery) service.mode = kitchen.mode = 'Copia local recuperada · guarda un nuevo respaldo al terminar';
  }
  mountWorkspace(root,{pantry:service,kitchen},error=>{root.textContent=error.message;});
  }
} catch (error) {
  if(mode==='authenticated') {
    renderSession(root,{stage:'disabled',message:'El acceso de FORX todavía no está configurado. Contacta a administración.'});
  } else {
  root.replaceChildren();
  const message = document.createElement('p');
  message.className = 'startup-error';
  message.textContent = `No se pudo abrir FORX. ${error.message}`;
  root.append(message);
  }
}
