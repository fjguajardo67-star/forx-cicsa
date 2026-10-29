import { MemoryEntityRepository } from '../data/entity-repository.js';
import { PantryService } from '../domain/pantry-service.js';
import { KitchenService } from '../domain/kitchen-service.js';
import { createAccessPreview } from './access-preview.js';
import { commandServices } from '../data/remote-services.js';
import { executePantryCommand } from '../server/pantry-commands.js';

// Explicit DEV-only preview, never part of a production build. No network,
// IndexedDB or shared emulator; signing out discards the synthetic workspace.
export function createAuthPreview() {
  if(!import.meta.env.DEV || !['127.0.0.1','localhost'].includes(location.hostname)) throw new Error('Prueba solo local.');
  let user=null, listener=()=>{};
  const auth={get currentUser(){return user;},subscribe(callback){listener=callback;queueMicrotask(()=>callback(user));return()=>{listener=()=>{};};},
    async signIn(){user={uid:'preview-account',email:'cuenta.ficticia@example.invalid'};listener(user);},
    async signOut(){user=null;listener(null);}};
  return {auth,connect:async({signOut})=>{
    const requestedRole=new URLSearchParams(location.search).get('previewRole');
    const actor={uid:user.uid,email:user.email,name:'Cuenta ficticia',role:['viewer','editor'].includes(requestedRole)?requestedRole:'admin'};
    const repository=new MemoryEntityRepository();
    const seed={actor:{uid:'preview-seed',name:'Inicialización ficticia',role:'admin'}};
    await new PantryService(repository,seed).initialize();await new KitchenService(repository,seed).initialize();
    // Exercise the same command allowlist as production, not direct services
    // that accidentally let a viewer load the complete private pantry snapshot.
    const {pantry,kitchen}=commandServices({actor,mode:'Prueba de acceso · datos ficticios en memoria · sin Google ni servidor',session:{signOut},
      call:(command,input)=>executePantryCommand(repository,{uid:actor.uid,token:{forxActive:true,forxRole:actor.role,name:actor.name}},{command,input})});
    pantry.access=createAccessPreview(actor);
    return {actor,services:{pantry,kitchen},identity:async()=>actor,close:()=>repository.records.clear()};
  }};
}
