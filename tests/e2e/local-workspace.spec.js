import {test,expect} from '@playwright/test';

test('sesión local existente: recetas, precios y MiDespensa sin escrituras',async({page})=>{
  test.skip(!process.env.FORX_E2E_READONLY_PORT,'Requiere servidor existente; nunca crea fixtures en él.');
  const commands=[],denied=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname!=='127.0.0.1'){denied.push('external');return route.abort();}
    if(url.pathname==='/commands'){
      const command=request.postDataJSON().command;
      if(!['kitchenSnapshot','snapshot'].includes(command)){denied.push(command);return route.abort();}
      commands.push(command);
    }else if(request.method()!=='GET'&&url.pathname!=='/session'){denied.push('write');return route.abort();}
    return route.continue();
  });
  const response=page.waitForResponse(r=>r.url().endsWith('/commands')&&r.request().postDataJSON().command==='kitchenSnapshot');
  await page.goto(`/?backend=emulator&serverPort=${process.env.FORX_E2E_READONLY_PORT}#/forx/precios`);
  const {result}=await (await response).json();
  await expect(page.locator('[data-price-ingredient]')).toHaveCount(result.catalog.length);
  await expect(page.locator('#stat-plat')).toHaveText(String(result.recipes.filter(r=>r.status!=='archived').length));
  if(!result.catalog.some(i=>i.currentPrice)){
    await expect(page.locator('#pst')).toHaveText('0');
    await expect(page.getByRole('button',{name:'Ver origen',exact:true})).toHaveCount(0);
  }
  await page.getByRole('button',{name:'Catálogo',exact:true}).click();
  await expect(page.locator('#cat.on')).toBeVisible();
  await page.getByRole('button',{name:'MiDespensa',exact:true}).click();
  await expect(page.getByRole('button',{name:'Importar XML',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Importar XML',exact:true}).click();
  await expect(page.locator('#import-policy')).toContainText('Se bloquean XML de meses anteriores');
  expect(commands).toContain('snapshot');
  expect(denied).toEqual([]);expect(errors).toEqual([]);
});
