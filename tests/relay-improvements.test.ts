import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServers} from '../src/server.js';
import type {Transport} from '../src/transport.js';

test('equivalent anonymous public reads coalesce, operation-specific 429s stay separate and telemetry is local',async()=>{
 let imageCalls=0,postCalls=0,otherCalls=0;
 const transport:Transport=async(url,_method,_headers,body)=>{
  if(url.pathname==='/public.png'){imageCalls++;await new Promise(resolve=>setTimeout(resolve,60));return new Response('public',{headers:{'content-type':'image/png','content-length':'6','cache-control':'public, max-age=60'}}) as any;}
  if(url.pathname==='/limited'){postCalls++;return new Response(JSON.stringify({received:body?.toString()}),{status:429,headers:{'content-type':'application/json','retry-after':'60'}}) as any;}
  otherCalls++;return new Response('unexpected') as any;
 };
 const {app,merchant}=createServers(4080,4081,transport,{filterMode:'balanced'});app.listen(4080,'127.0.0.1');merchant.listen(4081,'127.0.0.1');await Promise.all([once(app,'listening'),once(merchant,'listening')]);
 const origin='http://localhost:4081';
 try{
  const start=await fetch(origin+'/uv/');const cookie=start.headers.get('set-cookie')!.split(';')[0];await start.text();
  const relay=async(url:string,destination='image',body?:string)=>{
   const response=await fetch(origin+'/_relay',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({url,method:body?'POST':'GET',body:body?Buffer.from(body).toString('base64'):undefined,destination,headers:{},engine:'ultraviolet'})});return response.json();
  };
  const replies=await Promise.all(Array.from({length:20},()=>relay('https://img.kwcdn.com/public.png')));
  assert.equal(imageCalls,1);assert.ok(replies.every(r=>r.status===200&&Buffer.from(r.body,'base64').toString()==='public'));
  const a=await relay('https://www.temu.com/limited','empty','one'),b=await relay('https://www.temu.com/limited','empty','two'),again=await relay('https://www.temu.com/limited','empty','one');
  assert.equal(postCalls,2);assert.notEqual(a.body,b.body);assert.equal(again.body,a.body);
  assert.equal((await relay('https://eu.pftk.temu.com/report','empty','event')).status,204);assert.equal(otherCalls,0);
  assert.equal((await relay('https://accounts.google.com/','document')).status,403);assert.equal(otherCalls,0);
  const state=await(await fetch(origin+'/_state',{headers:{cookie}})).json();assert.ok(state.events.some((e:any)=>e.outcome.includes('cooldown replay')));assert.ok(state.events.some((e:any)=>e.outcome.includes('Coalesced')));
  const health=await(await fetch('http://localhost:4080/api/health',{headers:{cookie}})).json();assert.ok(health.failures.length>0);
  const stranger=await(await fetch('http://localhost:4080/api/health')).json();assert.deepEqual(stranger.failures,[],'failure diagnostics never reveal another session');
  const metrics=await(await fetch('http://localhost:4080/api/metrics',{headers:{cookie}})).json();assert.equal(metrics.counts.cooldown,1);assert.equal((metrics.counts.coalesced||0)+(metrics.counts.cache||0),19);assert.equal(metrics.counts.blocked,1);
 }finally{app.closeAllConnections();merchant.closeAllConnections();app.close();merchant.close();}
});

test('canceling a public cache-fill owner does not fail a waiting reader or cache a partial body',async()=>{
 let calls=0;let canceled!:()=>void;const ownerCanceled=new Promise<void>(resolve=>{canceled=resolve;});
 const transport:Transport=async(_url,_method,_headers,_body,signal)=>{
  calls++;if(calls>1)return new Response('good',{headers:{'content-type':'image/png','content-length':'4','cache-control':'public, max-age=60'}}) as any;
  signal!.addEventListener('abort',()=>canceled(),{once:true});
  return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2]));},cancel(){}}),{headers:{'content-type':'image/png','content-length':'4','cache-control':'public, max-age=60'}}) as any;
 };
 const {app,merchant}=createServers(4092,4093,transport);app.listen(4092,'127.0.0.1');merchant.listen(4093,'127.0.0.1');await Promise.all([once(app,'listening'),once(merchant,'listening')]);
 const origin='http://localhost:4093';
 try{
  const start=await fetch(origin+'/uv/');const cookie=start.headers.get('set-cookie')!.split(';')[0];await start.text();
  const abort=new AbortController();const request=(signal?:AbortSignal)=>fetch(origin+'/_relay',{method:'POST',signal,headers:{origin,cookie,'content-type':'application/json','x-temby-wire':'binary-v1'},body:JSON.stringify({url:'https://img.kwcdn.com/cancel-owner.png',method:'GET',destination:'image',headers:{},engine:'ultraviolet'})});
  const owner=await request(abort.signal);const reader=owner.body!.getReader();await reader.read();
  const follower=request();await new Promise(resolve=>setTimeout(resolve,20));abort.abort();
  await ownerCanceled;const response=await follower;const data=Buffer.from(await response.arrayBuffer());const length=data.readUInt32BE(0);assert.equal(data.subarray(4+length).toString(),'good');assert.equal(calls,2);
 }finally{app.closeAllConnections();merchant.closeAllConnections();app.close();merchant.close();}
});
