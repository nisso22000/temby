import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createServers} from '../src/server.js';
import type {Transport} from '../src/transport.js';
import {createServer} from 'node:http';
import {streamBinary} from '../src/relay-stream.js';

const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};};

test('image relay delivers bytes before upstream completion, caches only complete public bodies and aborts abandoned reads',async()=>{
  let calls=0;const tail=deferred();const cancelled=deferred();
  const transport:Transport=async(url,_method,_headers,_body,signal)=>{
    calls++;
    if(url.pathname.includes('cancel')){
      signal!.addEventListener('abort',()=>cancelled.resolve(),{once:true});
      return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([7]));},cancel(){}}),{headers:{'content-type':'image/png','cache-control':'private'}}) as any;
    }
    return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([0,128]));void tail.promise.then(()=>{controller.enqueue(new Uint8Array([255,1]));controller.close();});}}),{headers:{'content-type':'image/png','cache-control':'public, max-age=60'}}) as any;
  };
  const {app,merchant}=createServers(3950,3951,transport);app.listen(3950,'127.0.0.1');merchant.listen(3951,'127.0.0.1');await Promise.all([once(app,'listening'),once(merchant,'listening')]);
  const origin='http://localhost:3951';
  const self:any={location:{origin},Ultraviolet:{},fetch:(url:string,options:any)=>fetch(url,{...options,headers:{...options.headers,origin}})};
  vm.runInNewContext(await readFile(new URL('../public/uv-transport.js',import.meta.url),'utf8'),{self,URL,Response,ReadableStream,Uint8Array,DataView,TextDecoder,atob,btoa});
  const client=new self.Ultraviolet.BareClient();
  try{
    const response=await client.fetch('https://img.kwcdn.com/stream-owned.png',{headers:{'x-temby-request-destination':'image'}});
    const reader=response.body.getReader();const first=await reader.read();assert.deepEqual(Array.from(first.value),[0,128],'first bytes arrive while tail remains gated');
    tail.resolve();const chunks=[Buffer.from(first.value)];for(;;){const next=await reader.read();if(next.done)break;chunks.push(Buffer.from(next.value));}
    assert.deepEqual(Buffer.concat(chunks),Buffer.from([0,128,255,1]));
    const cached=await client.fetch('https://img.kwcdn.com/stream-owned.png',{headers:{'x-temby-request-destination':'image'}});assert.deepEqual(Buffer.from(await cached.arrayBuffer()),Buffer.from([0,128,255,1]));assert.equal(calls,1);
    const abort=new AbortController();const abandoned=await client.fetch('https://img.kwcdn.com/cancel-owned.png',{signal:abort.signal,headers:{'x-temby-request-destination':'image'}});
    const abandonedReader=abandoned.body.getReader();assert.deepEqual(Array.from((await abandonedReader.read()).value),[7]);abort.abort();
    await assert.rejects(abandonedReader.read());
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([cancelled.promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Upstream abort was not propagated')),3000);})]);}finally{clearTimeout(timer);}
  }finally{tail.resolve();app.closeAllConnections();merchant.closeAllConnections();app.close();merchant.close();}
});

test('streaming limit cancels oversized bodies and never returns a complete cache value',async()=>{
  const tail=deferred();const failed=deferred();let cancelled=false,completed=false;
  const server=createServer(async(_request,response)=>{
    const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2,3]));void tail.promise.then(()=>{controller.enqueue(new Uint8Array([4]));});},cancel(){cancelled=true;}});
    try{await streamBinary(response,new Response(body),{},new AbortController().signal,true,3);completed=true;}catch{failed.resolve();}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}`);const reader=response.body!.getReader();assert.equal((await reader.read()).done,false);
    tail.resolve();await assert.rejects(async()=>{for(;;){if((await reader.read()).done)break;}});await failed.promise;
    assert.equal(completed,false);assert.equal(cancelled,true);
  }finally{tail.resolve();server.closeAllConnections();server.close();}
});
