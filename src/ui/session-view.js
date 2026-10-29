import { escapeHtml as e } from '../domain/kitchen-exports.js';
import { syncThemeControl, toggleTheme } from './theme.js';

export function renderSession(root, {stage='signed-out', message='', user=null, preview=false}, actions={}) {
  document.body.style.overflow='auto';
  const title = {checking:'Verificando acceso',denied:'Tu cuenta necesita autorización',unavailable:'No pudimos abrir FORX',disabled:'Acceso todavía no habilitado',closing:'Cerrando sesión'}[stage] || 'Acceder a FORX';
  const checking=['checking','closing'].includes(stage);
  root.innerHTML=`<div class="access-page"><header class="access-header"><img src="/forx/forx-logo-dark.svg" alt="FORX"><button class="button" type="button" data-theme-toggle><span data-theme-label></span></button></header>
    ${preview?'<div class="access-preview">Prueba de acceso · cuenta ficticia · sin Google ni datos compartidos</div>':''}
    <main class="access-main" id="workspace" tabindex="-1" aria-labelledby="access-title"><h1 id="access-title" tabindex="-1">${title}</h1>
    <p class="access-intro">${stage==='denied'?'Google confirmó tu identidad, pero esta cuenta no tiene acceso activo a FORX. Pide a administración que revise tu correo y esta referencia.':'Menús y recetas FORX, con ingredientes y precios de MiDespensa. Solo las cuentas autorizadas pueden entrar.'}</p>
    ${stage==='denied'&&user?`<dl class="access-reference"><dt>Cuenta de Google</dt><dd>${e(user.email || 'Sin correo disponible')}</dd><dt>Referencia para administración (UID)</dt><dd>${e(user.uid)}</dd></dl>`:''}
    <div class="access-actions">${['signed-out','signing-in'].includes(stage)?`<button class="google-signin" type="button" data-access="signin" ${stage==='signing-in'?'disabled':''}><img src="/google-g.svg" alt="">Continuar con Google</button>`:''}
    ${['denied','unavailable'].includes(stage)&&user?'<button class="button primary" type="button" data-access="retry">Revisar acceso</button><button class="button" type="button" data-access="signout">Cambiar de cuenta</button>':''}
    ${stage==='unavailable'&&!user?'<button class="button" type="button" data-access="retry">Reintentar</button>':''}</div>
    <p class="access-status" role="${message&&!checking?'alert':'status'}" aria-live="polite">${e(message || (stage==='checking'?'Comprobando tu cuenta y permisos…':stage==='closing'?'Retirando la sesión de esta pestaña…':stage==='signing-in'?'Completa el acceso en la ventana de Google.':''))}</p>
    <div class="access-help"><p>Tu contraseña se administra en Google. FORX no la guarda ni crea una copia.</p><a href="https://accounts.google.com/signin/recovery" target="_blank" rel="noopener noreferrer">Recuperar mi cuenta de Google (abre otra pestaña)</a><p class="access-note">${preview?'Esta prueba no abre Google. Al salir, se descartan sus datos de ejemplo.':'En un equipo compartido, cierra sesión al terminar. Salir de FORX no cierra tu cuenta de Google.'}</p></div></main></div>`;
  const theme=root.querySelector('[data-theme-toggle]');syncThemeControl(theme);theme.addEventListener('click',toggleTheme);
  for(const node of root.querySelectorAll('[data-access]')) node.addEventListener('click',()=>actions[node.dataset.access]?.());
  root.querySelector('h1').focus({preventScroll:true});
}
