import {test,expect} from '@playwright/test';
import {e2eOrigin} from './test-origin.js';
test.use({launchOptions:{...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),args:['--disable-gpu']}});
async function open(page,role='admin',theme='dark') {
  await page.route('**/*',route=>new URL(route.request().url()).origin===e2eOrigin&&route.request().method()==='GET'?route.continue():route.abort());
  await page.addInitScript(theme=>localStorage.setItem('forx-v2-theme',theme),theme);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(`${e2eOrigin}/?authPreview=1&previewRole=${role}#/despensa`);
  await page.getByRole('button',{name:'Continuar con Google'}).click();
  await page.getByRole('button',{name:'Administración',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Usuarios y roles'})).toBeVisible();
  if(role==='admin')await expect(page.locator('.users-table tbody tr')).toHaveCount(3);
}
async function capture(page,name){
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));document.querySelector('#workspace')?.scrollTo(0,0);window.scrollTo(0,0);});
  // Prime the macOS headless compositor before the evidence capture. Otherwise
  // some full-page captures omit already-visible text/SVG in the fixed sidebar.
  await page.screenshot({animations:'disabled'});
  await page.waitForTimeout(200);await page.screenshot({path:`.impeccable/review/${name}.png`,fullPage:true,animations:'disabled'});
}
test('administración ficticia: alta comprobada, edición, desactivación, reactivación y último administrador',async({page})=>{
  await open(page);
  await page.getByRole('button',{name:'Editar permisos de cuenta.ficticia@example.invalid'}).click();
  await page.getByRole('combobox',{name:'Rol',exact:true}).selectOption('viewer');await page.getByRole('button',{name:'Revisar cambio'}).click();
  await expect(page.locator('.users-status')).toContainText('no puede quedarse sin administrador');await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Autorizar cuenta',exact:true}).click();
  await page.getByLabel('UID de la cuenta',{exact:true}).fill('preview-new');await page.getByRole('button',{name:'Comprobar UID'}).click();
  await expect(page.locator('.users-editor')).toContainText('nueva.cuenta@example.invalid');await expect(page.locator('.users-table tbody tr')).toHaveCount(3);
  await page.getByRole('combobox',{name:'Rol',exact:true}).selectOption('editor');await page.getByRole('button',{name:'Revisar cambio'}).click();
  await page.getByRole('button',{name:'Confirmar cambio',exact:true}).click();await expect(page.locator('.users-table tbody tr')).toHaveCount(4);
  for(const value of ['false','true']){
    await page.getByRole('button',{name:'Editar permisos de nueva.cuenta@example.invalid'}).click();
    await page.getByRole('combobox',{name:'Acceso',exact:true}).selectOption(value);await page.getByRole('button',{name:'Revisar cambio'}).click();await page.getByRole('button',{name:'Confirmar cambio',exact:true}).click();
    await expect(page.locator('.users-table tr').filter({hasText:'nueva.cuenta@example.invalid'})).toContainText(value==='true'?'Activo':'Desactivado');
  }
  expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
});
test('edición no muestra cuentas ni acciones administrativas',async({page})=>{
  await open(page,'editor');await expect(page.locator('.users-panel')).toContainText('Solo una cuenta con administración');await expect(page.locator('.users-table')).toHaveCount(0);await expect(page.getByRole('button',{name:'Autorizar cuenta'})).toHaveCount(0);
});
test('matriz visual de Usuarios y roles: ambos temas, escritorio, tablet, móvil y confirmación',async({browser})=>{
  for(const [width,height,theme,name] of [[1440,1050,'dark','users-dark-desktop'],[1440,1050,'light','users-light-desktop'],[1952,1269,'dark','users-user-1952'],[1024,1000,'dark','users-tablet'],[390,844,'dark','users-dark-mobile'],[390,844,'light','users-light-mobile']]){
    const page=await browser.newPage({viewport:{width,height}});await open(page,'admin',theme);await capture(page,name);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(name==='users-light-mobile'){
      await page.getByRole('button',{name:'Editar permisos de edicion.ficticia@example.invalid'}).click();await page.getByRole('combobox',{name:'Acceso',exact:true}).selectOption('false');await page.getByRole('button',{name:'Revisar cambio'}).click();
      await capture(page,'users-confirm-mobile');await expect(page.getByRole('button',{name:'Confirmar cambio'})).toBeVisible();
    }
    await page.close();
  }
});
test('cerrar sesión desde Administración en móvil no se superpone a la barra',async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  await expect(page.locator('.sidebar .session-account')).toBeHidden();
  const account=page.locator('.admin-session');await expect(account).toBeVisible();
  const [accountBox,barBox]=await Promise.all([account.boundingBox(),page.locator('.topbar').boundingBox()]);expect(accountBox.y).toBeGreaterThanOrEqual(barBox.y+barBox.height);
  page.on('dialog',dialog=>dialog.accept());await account.getByRole('button',{name:'Cerrar sesión'}).click();await expect(page.getByRole('heading',{name:'Acceder a FORX'})).toBeVisible();
});
