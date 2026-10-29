import { test, expect } from 'vitest';
import { withOperationDeadline, assertOperationActive } from '../src/server/operation-deadline.js';
import { createProductionServer } from '../src/server/production-http.js';

test('un plazo vencido conserva el cupo hasta terminar el trabajo real', async () => {
  let finish, signal, released=0;
  const waiting = new Promise(resolve=>{finish=resolve;});
  const operation=withOperationDeadline(async value=>{signal=value;await waiting;return 'done';},
    {timeoutMs:10,onSettled:()=>{released++;}});
  await expect(operation).rejects.toMatchObject({status:503});
  expect(signal.aborted).toBe(true);
  expect(()=>assertOperationActive(signal)).toThrow();
  expect(released).toBe(0);
  finish();
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(released).toBe(1);
});

test('la API corta una autenticación lenta y no ejecuta escrituras después del plazo', async () => {
  let releaseAuth, authenticateStarted;
  const entered = new Promise(resolve=>{authenticateStarted=resolve;});
  const pending = new Promise(resolve=>{releaseAuth=resolve;});
  let reservations=0;
  const runtime={config:{environment:'staging',origins:['https://deadline.invalid'],limits:{globalMinute:100,concurrentPerProcess:1}},db:{},
    access:{authenticate:async()=>{authenticateStarted();await pending;return {uid:'test',actor:{role:'viewer'}};}},assertReady:async()=>{}};
  const server=createProductionServer(runtime,{operationTimeoutMs:30,log:()=>{},limits:{reserve:async()=>{reservations++;}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/identity`;
  const post=()=>fetch(url,{method:'POST',headers:{Origin:'https://deadline.invalid','Content-Type':'application/json',Authorization:'Bearer test'},body:'{}'});
  try {
    const request=post();await entered;
    const response=await request;
    expect(response.status).toBe(503);expect(await response.json()).toMatchObject({outcomeUncertain:true});
    const blocked=await post();expect(blocked.status).toBe(429);await blocked.text();
    expect(reservations).toBe(0);
    releaseAuth();
    await new Promise(resolve=>setTimeout(resolve,0));
    const next=await post();expect(next.status).toBe(200);await next.text();
    expect(reservations).toBe(1);
  } finally {releaseAuth();await new Promise(resolve=>server.close(resolve));}
});
