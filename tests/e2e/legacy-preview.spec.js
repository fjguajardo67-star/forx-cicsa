import {test,expect} from '@playwright/test';
import {legacyBackup,legacyRecipe} from '../fixtures/legacy-recipes.js';

const upload=(page,data)=>page.getByLabel('Respaldo anterior de FORX (JSON)').setInputFiles({name:'respaldo-sintetico.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
async function storedData(page){return page.evaluate(async()=>{
  const result={};
  for(const info of await indexedDB.databases()) {
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(info.name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    result[info.name]={};
    for(const store of db.objectStoreNames)result[info.name][store]=await new Promise((resolve,reject)=>{const r=db.transaction(store,'readonly').objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    db.close();
  }return result;
});}

test('vista previa: detalle, filtros, copias, XSS, errores y cero escrituras',async({page})=>{
  const errors=[],external=[],commands=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){external.push(url.toString());return route.abort();}if(url.pathname==='/commands')commands.push(route.request().postDataJSON());return route.continue();});
  await page.goto('/#/forx/cat');
  await page.getByRole('button',{name:'Revisar respaldo anterior',exact:true}).click();
  const before=await storedData(page);
  const data=legacyBackup();data.nube.recetas[0].ingredientes[0].cantidad=900;
  await upload(page,data);
  await expect(page.locator('#legacy-read-status')).toContainText('No se guardaron datos');
  await expect(page.locator('#legacy-report')).toContainText('9 recetas y 1 platillo');
  await expect(page.locator('#legacy-report')).toContainText('hay diferencias entre copias');
  await page.getByRole('button',{name:'Ver detalle de Guisado de prueba',exact:true}).click();
  await expect(page.locator('#legacy-detail')).toContainText('150');
  await page.getByLabel('Copia que estás revisando').selectOption('nube');
  await page.getByRole('button',{name:'Ver detalle de Guisado de prueba',exact:true}).click();
  await expect(page.locator('#legacy-detail')).toContainText('900');
  await page.getByLabel('Copia que estás revisando').selectOption('local');
  await page.getByLabel('Mostrar registros').selectOption('duplicate');
  await expect(page.locator('[data-preview-row]')).toHaveCount(4);
  await page.getByLabel('Mostrar registros').selectOption('grill');
  await page.getByRole('button',{name:'Ver detalle de Ensalada de prueba',exact:true}).click();
  await expect(page.locator('#legacy-detail')).toContainText('se conserva como porción pendiente');
  await expect(page.locator('#legacy-detail')).toContainText('confirma gramos antes de vincular y costear');
  await expect(page.locator('#legacy-detail')).toContainText('Contenedor');
  await page.getByLabel('Mostrar registros').selectOption('all');
  await page.getByLabel('Buscar en el respaldo').fill('<img');
  await page.getByRole('button',{name:'Ver detalle de <img src=x onerror=alert(1)>',exact:true}).click();
  await expect(page.locator('#legacy-detail')).toContainText('<script>alert(1)</script>');
  await expect(page.locator('#legacy-preview-host img, #legacy-preview-host script')).toHaveCount(0);
  await expect(page.locator('#legacy-preview-host')).not.toContainText('98765');
  await expect(page.locator('#legacy-preview-host button').filter({hasText:/Importar|Guardar|Reemplazar/})).toHaveCount(0);
  expect(await storedData(page)).toEqual(before);
  await upload(page,{schema:2,recipes:[]});
  await expect(page.locator('#legacy-read-error')).toContainText('no es un respaldo anterior');
  await expect(page.locator('#legacy-report')).toBeHidden();
  await upload(page,legacyBackup());
  await page.getByRole('button',{name:'Limpiar vista previa'}).click();
  await expect(page.locator('#legacy-report')).toBeHidden();
  await upload(page,legacyBackup());await page.reload();
  await expect(page.locator('#legacy-report')).toBeHidden();
  expect(await storedData(page)).toEqual(before);expect(errors).toEqual([]);expect(external).toEqual([]);expect(commands).toEqual([]);
});

test('paginación, navegación por teclado y capturas de revisión',async({page})=>{
  await page.goto('/#/forx/recuperar');
  const data=legacyBackup();for(let i=10;i<45;i++)data.local.recetas.push(legacyRecipe({id:i,nombre:`Receta sintética ${i}`}));
  data.nube={...structuredClone(data.local),config:null};await upload(page,data);
  await expect(page.locator('[data-preview-row]')).toHaveCount(30);
  await page.getByRole('button',{name:'Ver detalle de Sopes de prueba',exact:true}).click();
  await expect(page.locator('#legacy-detail-title')).toContainText('Sopes de prueba');
  await page.getByRole('button',{name:'Siguientes',exact:true}).click();
  await expect(page.locator('[data-preview-row]')).toHaveCount(15);
  await expect(page.locator('#legacy-detail-title')).toHaveCount(0);
  await expect(page.locator('#legacy-results button').first()).toBeFocused();
  await page.getByRole('button',{name:'Anteriores',exact:true}).click();
  await page.getByLabel('Mostrar registros').selectOption('review');
  await page.getByRole('button',{name:'Ver detalle de Sopes de prueba',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.locator('#legacy-detail-title')).toBeFocused();
  await page.getByRole('button',{name:'Volver a resultados',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ver detalle de Sopes de prueba',exact:true})).toBeFocused();
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const [name,width,height] of [['desktop',1440,1050],['user-1952',1952,1269],['tablet',1024,768],['mobile',390,844]]){
    await page.setViewportSize({width,height});await page.evaluate(async()=>{document.activeElement?.blur();window.scrollTo(0,0);await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    await page.screenshot({path:`.impeccable/review/legacy-preview-${name}.png`,fullPage:true,animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:1440,height:1050});await page.getByRole('button',{name:'Cambiar a tema claro'}).click();
  await page.screenshot({path:'.impeccable/review/legacy-preview-light.png',fullPage:true,animations:'disabled'});
});

test('respaldo real opt-in: solo vista previa contra servidor local, nunca guarda',async({page})=>{
  test.skip(!process.env.FORX_LEGACY_BACKUP || !process.env.FORX_E2E_READONLY_PORT,'Requiere archivo privado y servidor existente; no se versiona el respaldo.');
  const commands=[];
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();
    if(url.pathname==='/commands'){
      const command=route.request().postDataJSON().command;
      if(!['kitchenSnapshot','snapshot'].includes(command))throw new Error('La vista previa intentó escribir: '+command);
      commands.push(command);
    }return route.continue();
  });
  await page.goto(`/?backend=emulator&serverPort=${process.env.FORX_E2E_READONLY_PORT}#/forx/recuperar`);
  await expect(page.getByLabel('Respaldo anterior de FORX (JSON)')).toBeVisible();
  const before=commands.length;
  await page.getByLabel('Respaldo anterior de FORX (JSON)').setInputFiles(process.env.FORX_LEGACY_BACKUP);
  await expect(page.locator('#legacy-report')).toContainText('323 recetas y 7 platillos de Grill Express');
  await page.getByLabel('Mostrar registros').selectOption('review');
  await page.getByRole('button',{name:'Ver detalle de Sopes de Chicharrón',exact:true}).click();
  await expect(page.locator('#legacy-detail')).toContainText('Todos los ingredientes tienen la misma cantidad');
  expect(commands.length).toBe(before);
});
