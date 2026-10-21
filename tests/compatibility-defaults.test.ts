import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer as portProbe} from 'node:net';
import {createServers} from '../src/server.js';
import type {Transport} from '../src/transport.js';

test('default routing preserves merchant telemetry, leaves provider UI alone and keeps external login hosts denied',async()=>{
 let calls=0;
 const transport:Transport=async()=>{calls++;return Response.json({received:true}) as any;};
 const probes=[portProbe(),portProbe()];
 await Promise.all(probes.map(async server=>{server.listen(0,'127.0.0.1');await once(server,'listening');}));
 const [appPort,merchantPort]=probes.map(server=>(server.address() as any).port as number);
 await Promise.all(probes.map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));
 const servers=createServers(appPort,merchantPort,transport);
 servers.app.listen(appPort,'127.0.0.1');servers.merchant.listen(merchantPort,'127.0.0.1');
 await Promise.all([once(servers.app,'listening'),once(servers.merchant,'listening')]);
 const origin='http://localhost:'+merchantPort;
 try{
  const start=await fetch(origin+'/uv/');const cookie=start.headers.get('set-cookie')!.split(';')[0];await start.text();
  const worker=await(await fetch(origin+'/uv/sw.js',{headers:{cookie}})).text();
  assert.match(worker,/"directAssets":false,"blockTelemetry":false/);
  const config=await(await fetch(origin+'/uv/config.js',{headers:{cookie}})).text();
  assert.ok(!config.includes('__tembyConfigureSignin'));
  assert.ok(!config.includes('temby-email-signin-note'));
  const relay=async(url:string)=>{
   const r=await fetch(origin+'/_relay',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({url,method:'POST',headers:{},destination:'empty',engine:'ultraviolet'})});return r.json();
  };
  for(const url of ['https://eu.pftk.temu.com/report','https://eu.thtk.temu.com/report','https://www.temu.com/api/adx/event']){
   const response=await relay(url);assert.equal(response.status,200);assert.deepEqual(JSON.parse(Buffer.from(response.body,'base64').toString()),{received:true});
  }
  assert.equal(calls,3);
  for(const host of ['accounts.google.com','connect.facebook.net','appleid.cdn-apple.com'])assert.equal((await relay('https://'+host+'/')).status,403);
  assert.equal(calls,3,'external login requests never reach transport');
 }finally{for(const server of [servers.app,servers.merchant]){server.closeAllConnections();server.close();}}
});
