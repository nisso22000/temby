import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('worker requests stay on the relay; unresolved clients fail locally and 429 stays unchanged',async()=>{
  const listeners:Record<string,Function>={};let nativeFetches=0;let relayed:Request|undefined;
  const origin='http://localhost:3001';const owner=origin+'/uv-service/'+encodeURIComponent('https://fixture.temby.invalid/product');
  const clients=new Map([['page',{url:owner}],['blob',{url:'blob:'+origin+'/owned'}],['opaque',{url:'about:blank'}]]);
  const records=new Map<string,Response>();
  const cache={match:async(key:string)=>records.get(key)?.clone(),put:async(key:string,value:Response)=>{records.set(key,value);},keys:async()=>[...records.keys()],delete:async(key:string)=>records.delete(key)};
  const self:any={clients:{get:async(id:string)=>clients.get(id)},addEventListener:(type:string,callback:Function)=>{listeners[type]=callback;}};
  class Engine {
    on(){} route(){return false;}
    fetch(event:{request:Request}){relayed=event.request;return new Response('Original upstream limit',{status:429});}
  }
  const context={self,Request,Response,URL,caches:{open:async()=>cache},location:{origin},UVServiceWorker:Engine,__uv$config:{},importScripts(){},fetch:async()=>{nativeFetches++;return new Response('');},encodeURIComponent};
  vm.runInNewContext(await readFile(new URL('../public/uv-request.js',import.meta.url),'utf8'),context);
  vm.runInNewContext(await readFile(new URL('../public/uv-sw.js',import.meta.url),'utf8'),context);
  const request=()=>new Request('https://fixture.temby.invalid/api/cart');
  const run=(id:string)=>{let response:Promise<Response>;listeners.fetch({request:request(),clientId:id,respondWith(value:Promise<Response>){response=value;}});return response!;};
  assert.equal((await run('opaque')).status,502);assert.equal((await run('missing')).status,502);assert.equal(nativeFetches,0,'no direct upstream fetch fallback');
  let registration:Promise<void>|undefined;listeners.message({data:{tembyWorkerContext:{url:'blob:'+origin+'/owned'}},source:{id:'page'},waitUntil(value:Promise<void>){registration=value;}});await registration;
  const response=await run('blob');assert.equal(response.status,429);assert.equal(await response.text(),'Original upstream limit');
  assert.equal(relayed!.url,origin+'/uv-service/'+encodeURIComponent(request().url));assert.equal(relayed!.referrer,owner);
  assert.equal(nativeFetches,4,'only local helper assets were fetched');
  const restarted={...context,self:{...self}};
  vm.runInNewContext(await readFile(new URL('../public/uv-request.js',import.meta.url),'utf8'),restarted);
  vm.runInNewContext(await readFile(new URL('../public/uv-sw.js',import.meta.url),'utf8'),restarted);
  assert.equal((await run('blob')).status,429,'context survives service-worker termination without a new page registration');
  assert.equal(nativeFetches,8,'restart fetches local helpers, never the remote API directly');
});
