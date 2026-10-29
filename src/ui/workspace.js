import { mountMiDespensa } from './midespensa-app.js';
import { mountForx } from './forx/app.js';

export function mountWorkspace(root, {pantry,kitchen}, onError=()=>{}) {
  let dispose, generation=0, stopped=false;
  async function route() {
    const current=++generation;
    dispose?.(); dispose=null;
    // A detached previous mount may finish later; it never owns the new root.
    const slot=document.createElement('div'); root.replaceChildren(slot);
    if(location.hash.startsWith('#/despensa') && kitchen.actor?.role==='viewer') {
      // Consultation uses the already filtered FORX catalog, never a privileged
      // pantry snapshot. Replace history so Back does not reopen a denied mount.
      history.replaceState(null,'','#/forx/precios');
    }
    const isPantry=location.hash.startsWith('#/despensa');
    document.body.style.overflow=isPantry?'':'auto';
    try {
      const cleanup=await (isPantry?mountMiDespensa(slot,pantry):mountForx(slot,kitchen));
      if(stopped || current!==generation) cleanup?.(); else dispose=cleanup;
    } catch(error) {if(!stopped && current===generation)onError(error);}
  }
  const navigate=()=>{void route();};
  window.addEventListener('hashchange',navigate); navigate();
  return ()=>{stopped=true;generation++;dispose?.();window.removeEventListener('hashchange',navigate);root.replaceChildren();};
}
