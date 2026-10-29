import { test,expect } from '@playwright/test';

// Opt-in read-only smoke against an already running demo. Never seeds or clears
// its emulator data; independent fixture tests live in prices.spec.js.
test('Precios servidor: origen y salto a MiDespensa sin escribir registros',async({page})=>{
  test.skip(!process.env.FORX_E2E_READONLY_PORT,'Requiere servidor demo existente; solo lectura.');
  const commands=[],errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname!=='127.0.0.1'){external.push(url.toString());return route.abort();}
    if(url.pathname==='/commands'){
      const command=request.postDataJSON()?.command;
      if(!['kitchenSnapshot','priceEvidence','snapshot'].includes(command)){external.push(`comando no permitido: ${command}`);return route.abort();}
      commands.push(command);
    }else if(request.method()!=='GET' && url.pathname!=='/session'){
      external.push(`método no permitido: ${request.method()} ${url.pathname}`);return route.abort();
    }
    return route.continue();
  });
  await page.goto(`/?backend=emulator&serverPort=${process.env.FORX_E2E_READONLY_PORT}#/forx/precios`);
  const row=page.locator('[data-price-ingredient]').filter({has:page.getByRole('button',{name:'Ver origen',exact:true})}).first();
  await expect(row).toBeVisible();
  const response=page.waitForResponse(r=>r.url().endsWith('/commands')&&r.request().postDataJSON().command==='priceEvidence');
  await row.getByRole('button',{name:'Ver origen',exact:true}).click();
  const proof=(await (await response).json()).result;
  const origin=page.getByRole('region',{name:'Origen del precio'});
  await expect(origin).toContainText(proof.purchase.cfdiUuid);
  await expect(origin).toContainText(proof.source.supplierSku || 'Sin SKU en XML');
  await expect(origin).toContainText(proof.validation.observationId);
  await origin.getByRole('button',{name:'Abrir producto y compra en MiDespensa'}).click();
  await expect(page.locator('[data-price-reference]')).toContainText(proof.validation.observationId);
  await expect(page.locator('[data-price-reference]')).toContainText(proof.purchase.cfdiUuid);
  expect(commands.length).toBeGreaterThan(2);
  expect(external).toEqual([]);expect(errors).toEqual([]);
});
