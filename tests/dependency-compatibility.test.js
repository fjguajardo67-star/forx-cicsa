import {test,expect} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

const require=createRequire(import.meta.url);
const cli=createRequire(require.resolve('firebase-tools/package.json'));

test('árbol fijado: parches transitivos y ausencia de braces',async()=>{
  const lock=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url),'utf8'));
  expect(Object.keys(lock.packages).some(path=>path.endsWith('/braces'))).toBe(false);
  const firestore=createRequire(require.resolve('@firebase/firestore/package.json'));
  expect(firestore('@grpc/grpc-js/package.json').version).toBe('1.14.5');
  expect(lock.packages['node_modules/chokidar'].version).toBe('4.0.3');
  expect(cli('@google-cloud/pubsub/package.json').version).toBe('6.1.0');
});

test('gaxios conserva UUID v4 CommonJS; FTP conserva su interfaz utilizada por get-uri',()=>{
  const gaxios=createRequire(cli.resolve('gaxios'));
  const uuid=gaxios('uuid');
  expect(uuid.validate(uuid.v4())).toBe(true);
  const uri=createRequire(cli.resolve('get-uri'));
  const ftp=uri('basic-ftp'),client=new ftp.Client();
  try {
    for(const name of ['access','lastMod','list','downloadTo','close'])expect(typeof client[name]).toBe('function');
    expect(ftp.parseList('-rw-r--r-- 1 owner group 12 Oct 05 2026 example.xml\r\n')[0].name).toBe('example.xml');
  }finally{client.close();}
});

test('cliente Pub/Sub transitivo conserva la API que carga el CLI, sin llamadas cloud',async()=>{
  const {PubSub}=cli('@google-cloud/pubsub');
  const client=new PubSub({projectId:'demo-forx-v2'});
  try {
    expect(typeof client.createTopic).toBe('function');
    expect(typeof client.topic('test').publishMessage).toBe('function');
    expect(()=>cli('firebase-tools/lib/emulator/pubsubEmulator.js')).not.toThrow();
  }finally{await client.close();}
});

test('Chokidar del CLI detecta cambios de reglas en rutas literales (sin globs)',async()=>{
  const root=await mkdtemp(join(tmpdir(),'forx-dependency-watch-'));
  const filename=join(root,'firestore{literal}.rules');
  let watcher;
  try {
    await writeFile(filename,'rules_version = "2";');
    watcher=cli('chokidar').watch(filename,{persistent:false,ignoreInitial:true,usePolling:true,interval:20});
    await once(watcher,'ready');
    const changed=once(watcher,'change');
    await writeFile(filename,'rules_version = "2"; // synthetic update');
    expect((await changed)[0]).toBe(filename);
  }finally{await watcher?.close();await rm(root,{recursive:true,force:true});}
},5000);
