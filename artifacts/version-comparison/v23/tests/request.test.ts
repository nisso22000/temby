import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('blob worker context inherits a validated owner and expires without guessing',async()=>{
  const context={self:{} as any,Request,URL};vm.runInNewContext(await readFile(new URL('../public/uv-request.js',import.meta.url),'utf8'),context);
  let time=0;const origin='http://localhost:3001';const owner=origin+'/uv-service/'+encodeURIComponent('https://fixture.temby.invalid/product');
  const contexts=context.self.__tembyWorkerContexts(origin,()=>time);
  assert.equal(contexts.resolve(owner),owner);
  assert.equal(contexts.register(owner,'blob:'+origin+'/owned-worker'),true);
  assert.equal(contexts.resolve('blob:'+origin+'/owned-worker'),owner);
  assert.equal(contexts.register('blob:'+origin+'/owned-worker','blob:'+origin+'/nested'),true);
  assert.equal(contexts.resolve('blob:'+origin+'/nested'),owner);
  assert.equal(contexts.register('https://unrelated.test/uv-service/https%3A%2F%2Ffixture.temby.invalid','blob:'+origin+'/bad'),false);
  assert.equal(contexts.register(owner,'blob:https://unrelated.test/bad'),false);
  assert.equal(contexts.resolve('about:blank'),null);
  time=1800001;assert.equal(contexts.resolve('blob:'+origin+'/owned-worker'),null);
});

test('remapping keepalive POST preserves bytes and options without a streaming body',async()=>{
  const context={self:{} as any,Request};vm.runInNewContext(await readFile(new URL('../public/uv-request.js',import.meta.url),'utf8'),context);
  const bytes=new Uint8Array([0,1,127,128,255]);
  const original=new Request('https://fixture.temby.invalid/beacon',{method:'POST',body:bytes,keepalive:true,headers:{'content-type':'application/octet-stream'},credentials:'include',redirect:'manual'});
  assert.throws(()=>new Request('http://localhost:3001/mapped',original),/keepalive/i,'reproduce the original failure');
  const mapped=await context.self.__tembyMapRequest(original,'http://localhost:3001/mapped');
  assert.deepEqual(new Uint8Array(await mapped.arrayBuffer()),bytes);
  assert.equal(mapped.keepalive,true);assert.equal(mapped.method,'POST');assert.equal(mapped.credentials,'include');assert.equal(mapped.redirect,'manual');assert.equal(mapped.headers.get('content-type'),'application/octet-stream');assert.equal(original.bodyUsed,false);
  const get=await context.self.__tembyMapRequest(new Request('https://fixture.temby.invalid/'),'http://localhost:3001/mapped');assert.equal(get.body,null);
  const source='http://localhost:3001/uv-service/'+encodeURIComponent('https://fixture.temby.invalid/infinite-check');
  const restored=await context.self.__tembyMapRequest(new Request('https://fixture.temby.invalid/api/pages',{referrer:'http://localhost:3001/'}),'http://localhost:3001/mapped',source);
  assert.equal(restored.referrer,source,'use the controlled document URL after physical cross-origin referrer reduction');
});
