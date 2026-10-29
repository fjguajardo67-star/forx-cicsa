import {test,expect} from '@playwright/test';
import {e2eOrigin} from './test-origin.js';
test.use({launchOptions:{...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),args:['--disable-gpu']}});

test('Consulta usa el catálogo permitido; navegación y temas sin acceso privado',async({browser})=>{
  for(const [width,height,theme] of [[1440,1050,'dark'],[390,844,'light']]){
    const page=await browser.newPage({viewport:{width,height}});
    await page.route('**/*',route=>new URL(route.request().url()).origin===e2eOrigin&&route.request().method()==='GET'?route.continue():route.abort());
    await page.addInitScript(theme=>localStorage.setItem('forx-v2-theme',theme),theme);
    await page.goto('/?authPreview=1&previewRole=viewer#/despensa/producto/privado');
    await page.getByRole('button',{name:'Continuar con Google'}).click();
    await expect(page).toHaveURL(/#\/forx\/precios$/);
    await expect(page.getByRole('heading',{name:/Precios de Ingredientes/})).toBeVisible();
    await expect(page.locator('#precios .infobox')).toContainText('requieren una cuenta con edición');
    await expect(page.getByRole('button',{name:'Agregar receta',exact:true})).toBeHidden();
    await expect(page.getByRole('button',{name:'Generar receta',exact:true})).toBeHidden();
    await page.getByRole('button',{name:'MiDespensa',exact:true}).click();
    await expect(page).toHaveURL(/#\/forx\/precios$/);
    for(const route of ['agregar','generar','recuperar']){
      await page.evaluate(route=>{location.hash='/forx/'+route;},route);
      await expect(page).toHaveURL(/#\/forx\/precios$/);
    }
    await page.getByRole('button',{name:'Menú',exact:true}).click();
    await expect(page.getByRole('button',{name:/Regenerar/})).toBeHidden();
    await expect(page.getByRole('spinbutton',{name:'Comensales',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'MiDespensa',exact:true}).click();
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));window.scrollTo(0,0);});
    await page.screenshot({animations:'disabled'});
    await page.screenshot({path:`.impeccable/review/audit-viewer-${theme}-${width}.png`,fullPage:true,animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
    await page.close();
  }
});
