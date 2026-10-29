import { test,expect,vi,afterEach } from 'vitest';
import { createRemoteServices } from '../src/data/remote-services.js';
afterEach(()=>vi.unstubAllGlobals());
const response=result=>({ok:true,status:200,json:async()=>result});
test('cliente nuevo bloquea importación contra un servidor antiguo sin política mensual',async()=>{
  vi.stubGlobal('location',{hostname:'127.0.0.1',search:'?backend=emulator&serverPort=8788'});
  const fetch=vi.fn().mockResolvedValueOnce(response({token:'synthetic',actor:{role:'admin'}})).mockResolvedValueOnce(response({result:{}}));
  vi.stubGlobal('fetch',fetch);
  const {pantry}=await createRemoteServices();
  await expect(pantry.importFiles([{name:'test.xml'}],{period:'2026-10'})).rejects.toThrow(/todavía no confirma el bloqueo de periodos/);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.slice(1).map(([,options])=>JSON.parse(options.body).command)).toEqual(['snapshot']);
});
test('servidor actualizado recibe el XML; el cliente no decide ni desactiva el corte',async()=>{
  vi.stubGlobal('location',{hostname:'127.0.0.1',search:'?backend=emulator&serverPort=8788'});
  const fetch=vi.fn().mockResolvedValueOnce(response({token:'synthetic',actor:{role:'admin'}}))
    .mockResolvedValueOnce(response({result:{importPolicy:{mode:'block_older_months',latestAcceptedPeriod:'2026-09'}}}))
    .mockResolvedValueOnce(response({result:{processed:1,counts:{blocked:1}}}));
  vi.stubGlobal('fetch',fetch);
  const {pantry}=await createRemoteServices();
  await expect(pantry.importFiles([{name:'test.xml',size:4,arrayBuffer:async()=>new TextEncoder().encode('<x/>')}],{period:'2026-08'})).resolves.toMatchObject({counts:{blocked:1}});
  const request=JSON.parse(fetch.mock.calls[2][1].body);expect(request.command).toBe('importXML');expect(Object.keys(request.input)).toEqual(['period','files']);
});
