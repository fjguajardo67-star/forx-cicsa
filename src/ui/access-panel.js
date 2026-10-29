import { escapeHtml as e } from '../domain/kitchen-exports.js';
import './access-panel.css';

const roles={viewer:'Consulta',editor:'Edición',admin:'Administración'};
const roleHelp={viewer:'Consulta el catálogo, las recetas y los menús, sin guardar cambios.',editor:'Puede editar datos culinarios. No administra usuarios.',admin:'Puede editar datos, administrar usuarios y descargar respaldos completos.'};
const validUid=uid=>/^[A-Za-z0-9_-]{1,128}$/.test(uid);
const errorText=error=>({400:'La cuenta no está disponible para este cambio. Para activar acceso necesita correo verificado e identidad Google habilitada.',401:'La sesión venció. Vuelve a entrar con Google.',403:'Ya no tienes permiso para administrar usuarios. No se muestran las cuentas.',404:'No se encontró esa cuenta. Pide que entre con Google y copie su UID desde la pantalla de acceso.',409:'El acceso cambió o el cambio dejaría a FORX sin administrador. Actualiza las cuentas y revisa de nuevo.',429:'Se alcanzó un límite temporal. Espera un minuto antes de actualizar.'}[error.status] || 'No se pudo confirmar la respuesta. Actualiza las cuentas antes de intentar otro cambio.');

// Independent controller: no accounts enter the pantry snapshot or local DB.
// Detach invalidates late responses; it never retries an uncertain write.
export function createAccessPanel({access,actor,signOut}) {
  let root=null,disposed=false,generation=0;
  const fresh=()=>({rows:null,busy:false,draft:null,confirmation:null,lookup:false,uid:'',error:'',message:'',warning:false,needsRefresh:false,denied:false});
  let state=fresh();
  const allowed=()=>Boolean(access)&&actor?.role==='admin';
  const lastAdmin=row=>row?.active&&row.role==='admin'&&state.rows?.filter(r=>r.active&&r.role==='admin').length===1;
  function draw(focus) {
    if(!root||disposed)return;
    const {rows,busy,draft,confirmation,lookup,error,message,needsRefresh,denied}=state;
    const locked=busy?'disabled':'';
    root.innerHTML=`<section class="section users-panel" aria-labelledby="users-heading" aria-busy="${busy}">
      <div class="section-head"><div><h2 id="users-heading" tabindex="-1">Usuarios y roles</h2><p>Permisos de toda la aplicación FORX, incluidos MiDespensa, recetas y menús.</p></div>
      ${allowed()?`<div class="users-actions"><button type="button" class="button" data-users="refresh" ${locked}>Actualizar cuentas</button>${!denied?`<button type="button" class="button primary" data-users="new" ${busy||needsRefresh||!rows?'disabled':''}>Autorizar cuenta</button>`:''}</div>`:''}</div>
      ${!access?'<p>La gestión de usuarios requiere el servidor autenticado. No está habilitada en esta sesión local de datos.</p>':actor.role!=='admin'?'<p>Solo una cuenta con administración puede consultar o cambiar permisos.</p>':`
        <p class="users-help">Google identifica a la persona; este panel decide su acceso. Desactivar no borra su cuenta de Google ni los datos que haya capturado.</p>
        ${access.previewHint?`<p class="notice warning">${e(access.previewHint)}</p>`:''}
        <p class="users-status ${error?'error-message':''}" role="${error?'alert':'status'}" tabindex="-1">${e(error || (busy?'Comprobando con el servidor…':''))}</p>
        ${message?`<p class="notice ${state.warning?'warning':''}" role="status">${e(message)}</p>`:''}
        ${lookup&&!confirmation?`<form data-users-form="lookup" class="users-editor"><h3>Comprobar cuenta de Google</h3><p>Pide a la persona que intente entrar a FORX y te comparta el UID que aparece cuando solicita autorización.</p><label class="field">UID de la cuenta<input class="input" name="uid" value="${e(state.uid)}" maxlength="128" pattern="[A-Za-z0-9_-]{1,128}" autocomplete="off" spellcheck="false" required ${locked}></label><div class="users-actions"><button type="button" class="button" data-users="cancel" ${locked}>Cancelar</button><button class="button" type="submit" ${locked}>Comprobar UID</button></div></form>`:''}
        ${draft&&!confirmation?`<form data-users-form="edit" class="users-editor"><h3>${draft.revision?'Editar permisos':'Autorizar cuenta comprobada'}</h3><p class="users-identity"><strong>${e(draft.email)}</strong><span>UID: ${e(draft.uid)}${draft.uid===actor.uid?' · Tu cuenta':''}</span></p>
          <div class="form-grid"><label class="field">Rol<select class="input" name="role" ${locked}>${Object.entries(roles).map(([key,label])=>`<option value="${key}" ${draft.role===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="field">Acceso<select class="input" name="active" ${locked}><option value="true" ${draft.active?'selected':''}>Activo</option><option value="false" ${!draft.active?'selected':''} ${draft.revision?'':'disabled'}>Desactivado</option></select></label></div>
          <p class="users-role-help">${e(roleHelp[draft.role])}</p>${lastAdmin(draft)?'<p class="users-help">Esta es la última cuenta con administración activa. No puedes desactivarla ni retirarle ese rol.</p>':''}
          <div class="users-actions"><button type="button" class="button" data-users="cancel" ${locked}>Cancelar</button><button class="button primary" type="submit" ${busy||needsRefresh?'disabled':''}>Revisar cambio</button></div></form>`:''}
        ${confirmation?`<div class="users-editor"><h3 tabindex="-1" data-users-confirm-heading>Confirmar cambio de acceso</h3><p class="users-identity"><strong>${e(confirmation.email)}</strong><span>UID: ${e(confirmation.uid)}</span></p><dl class="field-grid"><dt>Rol actual</dt><dd>${confirmation.revision?e(roles[confirmation.previousRole]):'Sin membresía'}</dd><dt>Rol solicitado</dt><dd>${e(roles[confirmation.role])}</dd><dt>Acceso solicitado</dt><dd>${confirmation.active?'Activo':'Desactivado'}</dd></dl><p>${e(roleHelp[confirmation.role])}</p>
          ${!confirmation.active?'<p class="notice warning">Esta cuenta perderá acceso a FORX. Sus compras, recetas y decisiones se conservarán.</p>':''}
          ${confirmation.role==='admin'&&confirmation.active?'<p class="notice warning">Con administración podrá autorizar a otras personas y cambiar sus permisos.</p>':''}
          ${confirmation.uid===actor.uid?'<p class="notice warning">Estás cambiando tu propia cuenta. Al confirmar se cerrará tu sesión.</p>':''}
          <div class="users-actions"><button type="button" class="button" data-users="back" ${locked}>Volver a editar</button><button type="button" class="button ${confirmation.active?'primary':'danger'}" data-users="save" ${busy||needsRefresh?'disabled':''}>Confirmar cambio</button></div></div>`:''}
        ${rows&&!denied?`<table class="simple-table users-table"><caption class="sr-only">Cuentas autorizadas y desactivadas de FORX</caption><thead><tr><th scope="col">Cuenta / UID</th><th scope="col">Rol</th><th scope="col">Acceso</th><th scope="col">Acción</th></tr></thead><tbody>${[...rows].sort((a,b)=>a.email.localeCompare(b.email)).map(row=>`<tr><td class="users-identity"><strong>${e(row.email)}</strong><span>UID: ${e(row.uid)}${row.uid===actor.uid?' · Tu cuenta':''}</span></td><td><span class="users-mobile-label">Rol: </span>${e(roles[row.role])}</td><td><span class="chip ${row.active?'good':''}">${row.active?'Activo':'Desactivado'}</span></td><td><button type="button" class="button" data-users-edit="${e(row.uid)}" aria-label="Editar permisos de ${e(row.email)}" ${busy||needsRefresh?'disabled':''}>Editar</button></td></tr>`).join('')}</tbody></table>${!rows.length?'<p>No hay membresías para mostrar.</p>':''}`:''}
      `}</section>`;
    root.querySelectorAll('[data-users]').forEach(button=>button.addEventListener('click',()=>actions[button.dataset.users]?.()));
    root.querySelectorAll('[data-users-edit]').forEach(button=>button.addEventListener('click',()=>{
      if(state.busy||state.needsRefresh)return;
      state.draft={...state.rows.find(r=>r.uid===button.dataset.usersEdit)};state.lookup=false;state.confirmation=null;state.error='';state.message='';draw('[name="role"]');
    }));
    root.querySelector('[data-users-form="lookup"]')?.addEventListener('submit',event=>{event.preventDefault();void lookupUser();});
    root.querySelector('[name="uid"]')?.addEventListener('input',event=>{state.uid=event.target.value;});
    root.querySelector('[data-users-form="edit"]')?.addEventListener('submit',review);
    for(const name of ['role','active'])root.querySelector(`[name="${name}"]`)?.addEventListener('change',event=>{
      state.draft[name]=name==='active'?event.target.value==='true':event.target.value;
      if(name==='role')root.querySelector('.users-role-help').textContent=roleHelp[state.draft.role];
    });
    if(focus)root.querySelector(focus)?.focus();
  }
  function report(error) {
    state.error=errorText(error)+(error.requestId?` Referencia: ${error.requestId}`:'');
    if(error.status===401||error.status===403){state.rows=null;state.draft=null;state.confirmation=null;state.lookup=false;state.denied=true;}
  }
  async function load() {
    if(!allowed()||state.busy||disposed||!root)return;
    const current=generation;state.busy=true;state.error='';state.draft=null;state.confirmation=null;state.lookup=false;draw();
    try {const rows=await access.list();if(current!==generation||disposed)return;state.rows=rows;state.needsRefresh=false;state.denied=false;}
    catch(error){if(current!==generation||disposed)return;state.rows=null;state.needsRefresh=true;report(error);}
    finally {if(current===generation&&!disposed){state.busy=false;draw('#users-heading');}}
  }
  async function lookupUser() {
    if(state.busy||state.needsRefresh||!allowed())return;
    const uid=state.uid.trim();if(!validUid(uid)){state.error='Copia el UID completo: solo letras, números, guion y guion bajo.';draw('[name="uid"]');return;}
    const current=generation;state.busy=true;state.error='';draw();
    try {const account=await access.lookup(uid);if(current!==generation||disposed)return;
      state.rows=state.rows.filter(r=>r.uid!==account.uid);if(account.membership)state.rows.push(account.membership);
      state.draft=account.membership?{...account.membership,email:account.email}:{uid:account.uid,email:account.email,role:'viewer',active:true,revision:null};state.lookup=false;
    }catch(error){if(current!==generation||disposed)return;report(error);}
    finally {if(current===generation&&!disposed){state.busy=false;draw(state.draft?'[name="role"]':'.users-status');}}
  }
  function review(event) {
    event.preventDefault();if(state.busy||state.needsRefresh||!state.draft)return;
    const draft=state.draft,before=state.rows.find(r=>r.uid===draft.uid);
    state.error='';
    if(lastAdmin(before)&&(!draft.active||draft.role!=='admin'))state.error='Primero autoriza otra cuenta con administración. FORX no puede quedarse sin administrador.';
    else if(before&&before.role===draft.role&&before.active===draft.active)state.error='No hay cambios en el rol ni en el acceso.';
    else state.confirmation={...draft,previousRole:before?.role};
    draw(state.error?'.users-status':'[data-users-confirm-heading]');
  }
  async function save() {
    if(state.busy||state.needsRefresh||!allowed()||!state.confirmation)return;
    const change=state.confirmation,current=generation;state.busy=true;state.error='';draw();
    try {
      const result=await access.update({uid:change.uid,role:change.role,active:change.active,expectedRevision:change.revision});
      if(current!==generation||disposed)return;
      state.rows=[...state.rows.filter(r=>r.uid!==result.uid),result];state.draft=null;state.confirmation=null;
      state.warning=Boolean(result.sessionRevocationPending);
      state.message=state.warning?'Permisos guardados. Quedó pendiente invalidar la sesión del proveedor; el servidor ya aplica el permiso nuevo. No repitas el cambio.':'Permisos guardados. La cuenta deberá volver a entrar con Google.';
      if(change.uid===actor.uid){await signOut();return;}
    }catch(error){if(current!==generation||disposed)return;state.needsRefresh=true;report(error);}
    finally {if(current===generation&&!disposed){state.busy=false;draw('.users-status');}}
  }
  const actions={refresh:load,new:()=>{if(state.busy||state.needsRefresh)return;state.lookup=true;state.uid='';state.draft=null;state.confirmation=null;state.error='';state.message='';draw('[name="uid"]');},
    cancel:()=>{state.draft=null;state.lookup=false;state.confirmation=null;state.error='';draw('#users-heading');},back:()=>{state.confirmation=null;draw('[name="role"]');},save};
  return {
    attach(node) {if(disposed)return;if(!node){if(root){generation++;state=fresh();}root=null;return;}root=node;draw();if(allowed()&&!state.rows&&!state.busy&&!state.needsRefresh)void load();},
    dispose(){disposed=true;generation++;state=fresh();root?.replaceChildren();root=null;}
  };
}
