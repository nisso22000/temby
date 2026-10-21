import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Agent,fetch} from 'undici';
import {browserMetadataDispatcher} from '../src/fetch-metadata.js';

test('real HTTP requests preserve browser navigation metadata despite fetch rewriting',async()=>{
  const received:any[]=[];
  const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const part of req)chunks.push(part);received.push({headers:req.headers,body:Buffer.concat(chunks).toString()});res.writeHead(302,{location:'/next','set-cookie':['first=one; Path=/','second=two; Path=/']});res.end('original');});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const agent=new Agent();const url='http://127.0.0.1:'+(server.address() as any).port+'/';
  try{
    // Reproduce the underlying mismatch before exercising the correction.
    const original=await fetch(url,{dispatcher:agent,headers:{'sec-fetch-mode':'navigate'},redirect:'manual'});await original.text();
    assert.equal(received[0].headers['sec-fetch-mode'],'cors');
    for(const mode of ['navigate','no-cors','same-origin','cors']){
      const headers={'sec-fetch-mode':mode,'sec-fetch-dest':mode==='navigate'?'document':'empty','sec-fetch-site':'same-origin','user-agent':'Owned browser fixture','cookie':'owned=value','origin':'https://fixture.temby.invalid'};
      const response=await fetch(url,{dispatcher:browserMetadataDispatcher(agent,mode),method:'POST',headers,body:'unchanged=body',redirect:'manual'});
      assert.equal(response.status,302);assert.deepEqual(response.headers.getSetCookie(),['first=one; Path=/','second=two; Path=/']);assert.equal(await response.text(),'original');
      const wire=received.at(-1);for(const [key,value]of Object.entries(headers))assert.equal(wire.headers[key],value);assert.equal(wire.body,'unchanged=body');
    }
    assert.equal(received.length,5,'redirects are not followed or retried');
    assert.equal(browserMetadataDispatcher(agent,undefined),agent,'missing metadata is not invented');
    assert.equal(browserMetadataDispatcher(agent,'invalid'),agent);
    assert.equal(browserMetadataDispatcher(agent,'navigate'),browserMetadataDispatcher(agent,'navigate'),'wrappers share the existing pool');
  }finally{await agent.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
