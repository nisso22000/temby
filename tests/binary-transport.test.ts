import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {once} from 'node:events';
import {createServers} from '../src/server.js';
import type {Transport} from '../src/transport.js';

test('binary client handles split metadata, byte bodies, cookies, errors and legacy servers',async()=>{
  const code=await readFile(new URL('../public/uv-transport.js',import.meta.url),'utf8');
  for(const legacy of [false,true])for(const status of [200,204,403,429]){
    const bytes=Buffer.from([0,127,128,255]);const headers={'content-type':'application/octet-stream','set-cookie':['owned=unchanged; HttpOnly'],'x-owned':'café'};
    const metadata={status,statusText:'',headers};const meta=Buffer.from(JSON.stringify(metadata));const prefix=Buffer.alloc(4);prefix.writeUInt32BE(meta.length);
    const payload=Buffer.concat([prefix,meta,status===204?Buffer.alloc(0):bytes]);let offset=0;
    const self:any={location:{origin:'http://localhost:3001'},Ultraviolet:{},fetch:async(_url:string,options:any)=>{
      assert.equal(options.headers['x-temby-wire'],'binary-v1');
      if(legacy)return Response.json({...metadata,body:(status===204?Buffer.alloc(0):bytes).toString('base64')});
      return new Response(new ReadableStream({pull(controller){if(offset===payload.length){controller.close();return;}const end=Math.min(offset+3,payload.length);controller.enqueue(payload.subarray(offset,end));offset=end;}}),{headers:{'content-type':'application/x-temby-binary'}});
    }};
    vm.runInNewContext(code,{self,URL,Response,ReadableStream,Uint8Array,DataView,TextDecoder,atob,btoa});
    const result=await new self.Ultraviolet.BareClient().fetch('https://fixture.temby.invalid/owned');
    assert.equal(result.status,status);assert.deepEqual(Buffer.from(await result.arrayBuffer()),status===204?Buffer.alloc(0):bytes);
    assert.deepEqual(Array.from(result.rawHeaders['set-cookie']),headers['set-cookie']);assert.equal(result.rawHeaders['x-owned'],'café');assert.equal(result.headers.has('set-cookie'),false);
  }
});

test('binary relay returns original bytes and only reuses explicitly public CDN resources',async()=>{
  let calls=0;const bytes=Buffer.from([0,1,128,255]);
  const transport:Transport=async()=>{calls++;return new Response(bytes,{headers:{'content-type':'image/png','cache-control':'public, max-age=60'}}) as any;};
  const {app,merchant}=createServers(3930,3931,transport);app.listen(3930,'127.0.0.1');merchant.listen(3931,'127.0.0.1');await Promise.all([once(app,'listening'),once(merchant,'listening')]);
  const origin='http://localhost:3931';
  const request=async(url:string,destination='image')=>{
    const response=await fetch(origin+'/_relay',{method:'POST',headers:{origin,'content-type':'application/json','x-temby-wire':'binary-v1'},body:JSON.stringify({url,method:'GET',headers:{},destination,engine:'ultraviolet'})});
    assert.equal(response.headers.get('content-type'),'application/x-temby-binary');
    const payload=Buffer.from(await response.arrayBuffer());const length=payload.readUInt32BE(0);
    return {metadata:JSON.parse(payload.subarray(4,4+length).toString()),body:payload.subarray(4+length)};
  };
  try{
    const first=await request('https://img.kwcdn.com/owned-binary.png');assert.equal(first.metadata.status,200);assert.deepEqual(first.body,bytes);
    await request('https://img.kwcdn.com/owned-binary.png');assert.equal(calls,1);
    await request('https://img.kwcdn.com/owned-binary.png','empty');assert.equal(calls,2);
    await request('https://www.temu.com/api/cart','empty');await request('https://www.temu.com/api/cart','empty');assert.equal(calls,4);
    const denied=await request('https://127.0.0.1/');assert.equal(denied.metadata.status,403);assert.equal(calls,4);
  }finally{app.closeAllConnections();merchant.closeAllConnections();app.close();merchant.close();}
});
