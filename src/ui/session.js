import { renderSession } from './session-view.js';

const loginErrors = {
  'auth/popup-closed-by-user':'Cancelaste el acceso. Puedes volver a intentarlo.',
  'auth/cancelled-popup-request':'Ya hay una ventana de acceso abierta. Complétala antes de intentar de nuevo.',
  'auth/popup-blocked':'Tu navegador bloqueó la ventana de Google. Permite ventanas emergentes para FORX y vuelve a intentar.',
  'auth/network-request-failed':'No hay conexión con Google. Revisa tu conexión y vuelve a intentar.',
  'auth/unauthorized-domain':'Este dominio aún no está autorizado para el acceso. Avisa a administración.',
  'auth/operation-not-allowed':'El acceso con Google aún no está habilitado. Avisa a administración.'
};

// Owns the UI lifetime, not Firebase tokens. No server data is persisted here.
export function mountSession(root, {auth, connect, mount, preview=false, refreshMs=60000}) {
  let version=0, api=null, dispose=null, stopped=false, signedOut=false, stage='checking';
  const clear=()=>{version++;api?.close();api=null;dispose?.();dispose=null;root.replaceChildren();const live=document.querySelector('#live-region');if(live)live.textContent='';};
  function show(next,message='',user=auth.currentUser) {
    stage=next;
    renderSession(root,{stage,message,user,preview},{signin,signout,retry:()=>check(auth.currentUser)});
  }
  async function check(user) {
    if(stopped || signedOut&&user)return;
    clear();const current=version;
    if(!user){show('signed-out');return;}
    show('checking');
    let connection;
    try {
      connection=await connect({user,expire:()=>expire(),signOut:signout});
      if(stopped || current!==version){connection.close();return;}
      api=connection;
      stage='active';
      dispose=mount(root,connection.services,error=>{if(current===version){clear();show('unavailable',error.message);}});
    } catch(error) {
      connection?.close();
      if(stopped || current!==version)return;
      show(error.status===403?'denied':error.status===401?'signed-out':'unavailable',
        error.status===403?'':error.status===401?'Tu sesión venció. Vuelve a entrar con Google.':'No pudimos verificar el acceso. Revisa la conexión y vuelve a intentar.');
    }
  }
  async function signin() {
    if(stage==='signing-in' || stopped)return;
    signedOut=false;show('signing-in');
    try {await auth.signIn();} catch(error) {
      if(!stopped && stage==='signing-in')show('signed-out',loginErrors[error.code] || 'No se pudo iniciar sesión. Inténtalo de nuevo o avisa a administración.');
    }
  }
  async function signout() {
    signedOut=true;clear();show('closing');
    try {await auth.signOut();if(!stopped)show('signed-out');}
    catch {if(!stopped)show('unavailable','No se pudo cerrar la sesión. Reintenta antes de dejar este equipo.');}
  }
  function expire() {signedOut=true;clear();show('signed-out','Tu sesión venció o fue revocada. Vuelve a entrar con Google.');void auth.signOut().catch(()=>{});}
  // Revalidate on return to the tab and periodically while visible. Remove a
  // revoked account's view; a command rejection never retries the write.
  let validating=false;
  async function revalidate() {
    if(stopped || stage!=='active' || validating || document.visibilityState==='hidden')return;
    const current=version;validating=true;
    try {const actor=await api.identity();if(current===version && actor.role!==api.actor.role)await check(auth.currentUser);}
    catch(error) {if(current===version){clear();show(error.status===403?'denied':error.status===401?'signed-out':'unavailable',error.status===403?'':'No pudimos confirmar tu acceso. Vuelve a verificar la sesión.');}}
    finally {validating=false;}
  }
  show('checking');
  const unsubscribe=auth.subscribe(user=>{void check(user);});
  const timer=setInterval(()=>{void revalidate();},refreshMs);
  document.addEventListener('visibilitychange',revalidate);window.addEventListener('focus',revalidate);
  return ()=>{stopped=true;clear();unsubscribe();clearInterval(timer);document.removeEventListener('visibilitychange',revalidate);window.removeEventListener('focus',revalidate);};
}
