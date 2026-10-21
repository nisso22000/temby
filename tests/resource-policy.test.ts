import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {NetworkFilter} from '../src/network-filter.js';
const code=await readFile(new URL('../public/resource-policy.js',import.meta.url),'utf8');
const resource=(url='https://static.kwcdn.com/public.css',destination='style',init:RequestInit={})=>{const request=new Request(url,init);Object.defineProperty(request,'destination',{value:destination});return request;};
test('explicit optional worker and server filters agree on boundaries and disabled defaults',()=>{
 const self:any={fetch:async()=>new Response('unused'),__tembyResourceOptions:{blockTelemetry:false}};
 vm.runInNewContext(code,{self,URL,Request,Headers,Date});
 const urls=['https://eu.pftk.temu.com/report','https://pftk.temu.com/','https://eu.thtk.temu.com/report','https://www.temu.com/api/adx/event','https://www.temu.com/api/adx','https://www.temu.com/api/adx_extra/event','https://pftk.temu.com.evil.test/','https://www.temu.com/api/passport/token/touch','https://static.kwcdn.com/app.js','http://pftk.temu.com/'];
 for(const enabled of [false,true]){
  self.__tembyResourceOptions.blockTelemetry=enabled;
  const server=new NetworkFilter(enabled?'balanced':'off');
  for(const url of urls)for(const destination of ['empty','script','image','document','iframe']){
   assert.equal(self.__tembyBlockedTelemetry({url,destination}),server.blocked(new URL(url),destination),enabled+' '+destination+' '+url);
  }
 }
});
test('native CDN delivery uses readable public responses and omits credentials while preserving bytes',async()=>{
 let calls=0;
 const self:any={__tembyResourceOptions:{directAssets:true},fetch:async(request:Request)=>{calls++;assert.equal(request.credentials,'omit');assert.equal(request.mode,'cors');assert.equal(request.headers.has('cookie'),false);assert.equal(request.headers.has('x-temby-private'),false);assert.equal(new URL(request.url).hostname,'static.kwcdn.com');return new Response('body{color:red}',{headers:{'content-type':'text/css','cache-control':'public, max-age=3600'}});}};
 vm.runInNewContext(code,{self,URL,Request,Headers,Date});
 const response=await self.__tembyTryDirect(resource());assert.equal(await response.text(),'body{color:red}');assert.equal(calls,1);
 const encoded=resource('http://localhost:3001/uv-service/owned','style',{headers:{cookie:'temby_sid=private','x-temby-private':'private'}});
 assert.equal((await self.__tembyTryDirect(encoded,'https://static.kwcdn.com/public.css')).status,200);
 for(const request of [resource('https://www.temu.com/api/cart','empty'),resource('https://static.kwcdn.com/app.js','script'),resource('https://static.kwcdn.com/x.css?token=private'),resource('https://static.kwcdn.com/x.css','style',{method:'POST'}),resource('https://static.kwcdn.com/x.css','style',{headers:{authorization:'private'}}),resource('https://static.kwcdn.com.evil.test/x.css')])assert.equal(self.__tembyDirectCandidate(request),false);
 self.__tembyResourceOptions.directAssets=false;assert.equal(await self.__tembyTryDirect(resource()),null);
});
test('direct failures fall back once per host/category cooldown, and canceled reads never retry',async()=>{
 let calls=0;const self:any={__tembyResourceOptions:{directAssets:true},fetch:async()=>{calls++;throw Error('CORS refused');}};
 vm.runInNewContext(code,{self,URL,Request,Headers,Date});
 assert.equal(await self.__tembyTryDirect(resource()),null);assert.equal(await self.__tembyTryDirect(resource('https://static.kwcdn.com/another.css')),null);assert.equal(calls,1);
 const abort=new AbortController();abort.abort();
 const other=resource('https://img.kwcdn.com/image.png','image',{signal:abort.signal});
 await assert.rejects(self.__tembyTryDirect(other));assert.equal(calls,2);
});
test('private and incorrect MIME CDN responses remain on the relay path',async()=>{
 for(const headers of [{'content-type':'text/css','cache-control':'private, max-age=60'},{'content-type':'text/html','cache-control':'max-age=60'}]){
  const self:any={__tembyResourceOptions:{directAssets:true},fetch:async()=>new Response('private',{headers})};vm.runInNewContext(code,{self,URL,Request,Headers,Date});
  assert.equal(await self.__tembyTryDirect(resource()),null);
 }
});
test('partial media must expose range metadata before using direct delivery',async()=>{
 for(const expose of [false,true]){
  const self:any={__tembyResourceOptions:{directAssets:true},fetch:async()=>new Response('part',{status:206,headers:{'content-type':'video/mp4','cache-control':'max-age=60',...expose?{'content-range':'bytes 0-3/100'}:{}}})};
  vm.runInNewContext(code,{self,URL,Request,Headers,Date});
  const response=await self.__tembyTryDirect(resource('https://static.kwcdn.com/movie.mp4','video',{headers:{range:'bytes=0-3'}}));
  assert.equal(!!response,expose);
 }
});
test('readable CDN rate limits and server errors pass through without a relay retry',async()=>{
 for(const status of [429,503]){
  let calls=0;const self:any={__tembyResourceOptions:{directAssets:true},fetch:async()=>{calls++;return new Response('original refusal',{status,headers:{'retry-after':'120'}});}};
  vm.runInNewContext(code,{self,URL,Request,Headers,Date});const response=await self.__tembyTryDirect(resource());
  assert.equal(response.status,status);assert.equal(response.headers.get('retry-after'),'120');assert.equal(await response.text(),'original refusal');assert.equal(calls,1);
 }
});
test('only integrity-protected scripts qualify for untouched direct delivery',async()=>{
 const integrity='sha256-'+Buffer.alloc(32).toString('base64');
 const self:any={__tembyResourceOptions:{directAssets:true},fetch:async(request:Request)=>{assert.equal(request.integrity,integrity);return new Response('owned',{headers:{'content-type':'text/javascript','cache-control':'max-age=60'}});}};
 vm.runInNewContext(code,{self,URL,Request,Headers,Date});
 assert.equal(self.__tembyDirectCandidate(resource('https://static.kwcdn.com/app.js','script')),false);
 const response=await self.__tembyTryDirect(resource('https://static.kwcdn.com/app.js','script',{integrity}));assert.equal(await response.text(),'owned');
});
test('declared integrity metadata is bounded, survives restart and treats conflicting declarations conservatively',async()=>{
 const entries=new Map<string,Response>();const cache={keys:async()=>[...entries.keys()],delete:async(key:string)=>entries.delete(key),put:async(key:string,value:Response)=>entries.set(key,value.clone()),match:async(key:string)=>entries.get(key)?.clone()};
 const make=()=>{const self:any={location:{origin:'http://localhost:3001'},fetch:async()=>new Response('owned')};vm.runInNewContext(code,{self,URL,Request,Headers,Response,Date,caches:{open:async()=>cache}});return self;};
 const owner='https://www.temu.com/cart.html',resourceURL='https://static.kwcdn.com/app.js';const first=make();first.__tembyBeginIntegrityDocument(owner);first.__tembyRegisterIntegrity(owner,resourceURL,'sha256-owned');await first.__tembyFlushIntegrity();
 const restarted=make();await restarted.__tembyLoadIntegrity('http://localhost:3001/uv-service/'+encodeURIComponent(owner));assert.equal(restarted.__tembyIntegrityFor(owner,resourceURL),'sha256-owned');
 restarted.__tembyRegisterIntegrity(owner,resourceURL,'sha256-other');assert.equal(restarted.__tembyIntegrityFor(owner,resourceURL),'');assert.equal(restarted.__tembyIsIntegrityResource(owner,resourceURL),true,'conflicting metadata preserves bytes without choosing a hash for direct fetch');
 for(let i=0;i<40;i++){restarted.__tembyBeginIntegrityDocument(owner+'?owned='+i);restarted.__tembyRegisterIntegrity(owner+'?owned='+i,resourceURL,'sha256-owned');await restarted.__tembyFlushIntegrity();}
 assert.ok(entries.size<=32);
});
