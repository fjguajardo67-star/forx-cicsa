import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {e2eOrigin} from './test-origin.js';

// Software rendering avoids stale SVG layers in macOS headless resize captures.
test.use({launchOptions:{...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),args:['--disable-gpu']}});

async function isolate(page) {
  await page.route('**/*',route=>new URL(route.request().url()).origin===e2eOrigin&&route.request().method()==='GET'?route.continue():route.abort());
  await page.emulateMedia({reducedMotion:'reduce'});
}
async function capture(page,name) {
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));window.scrollTo(0,0);});
  // Allow a real compositor frame after viewport/theme changes (headless Chrome).
  await page.waitForTimeout(200);
  await page.screenshot({path:`.impeccable/review/${name}.png`,fullPage:true,animations:'disabled'});
}
test('acceso ficticio aislado, ambos módulos, salida y recarga sin persistir datos',async({page})=>{
  await isolate(page);await page.goto('/?authPreview=1#/forx/precios');
  await expect(page.getByRole('heading',{name:'Acceder a FORX'})).toBeVisible();
  await page.getByRole('button',{name:'Continuar con Google'}).click();
  await expect(page.locator('#forx-module')).toBeVisible();
  await expect(page.locator('.session-account')).toContainText('cuenta.ficticia@example.invalid');
  await capture(page,'access-forx-account-desktop');
  await page.getByRole('button',{name:'MiDespensa',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Cola de revisión'})).toBeVisible();
  await expect(page.locator('.session-account')).toContainText('cuenta.ficticia@example.invalid');
  await capture(page,'access-pantry-account-desktop');
  page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Acceder a FORX'})).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
  expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
  await page.getByRole('button',{name:'Continuar con Google'}).click();
  await page.getByRole('button',{name:'Menú y recetas FORX',exact:true}).click();
  await expect(page.locator('#forx-module')).toBeVisible();
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Acceder a FORX'})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Acceder a FORX'})).toBeVisible();
});
test('capturas de acceso: claro/oscuro, teclado, móvil y estados sin autorización',async({page,browser})=>{
  await isolate(page);await mkdir('.impeccable/review',{recursive:true});
  await page.goto('/?authPreview=1');await expect(page.getByRole('heading',{name:'Acceder a FORX'})).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  for(const theme of ['dark','light']) {
    await page.evaluate(async theme=>{const {currentTheme,toggleTheme}=await import('/src/ui/theme.js');if(currentTheme()!==theme)toggleTheme();},theme);
    for(const [width,height,label] of [[1440,1000,'desktop'],[1952,1269,'user-1952'],[390,844,'mobile']]){
      const shot=await browser.newPage({viewport:{width,height}});await isolate(shot);
      await shot.addInitScript(theme=>localStorage.setItem('forx-v2-theme',theme),theme);
      await shot.goto(`${e2eOrigin}/?authPreview=1`);
      await expect(shot.getByRole('heading',{name:'Acceder a FORX'})).toBeVisible();
      await capture(shot,`access-${theme}-${label}`);
      expect(await shot.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await expect(shot.getByRole('button',{name:'Continuar con Google'})).toBeVisible();
      await shot.close();
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(async()=>{
    const {renderSession}=await import('/src/ui/session-view.js');renderSession(document.querySelector('#app'),{stage:'denied',user:{uid:'google-test-reference',email:'cuenta.ficticia@example.invalid'},preview:true});
  });
  await capture(page,'access-denied-mobile');
  await expect(page.getByRole('heading',{name:'Tu cuenta necesita autorización'})).toBeVisible();
  const recovery=page.getByRole('link',{name:/Recuperar mi cuenta/});await expect(recovery).toHaveAttribute('href','https://accounts.google.com/signin/recovery');
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Revisar acceso'})).toBeFocused();
});
