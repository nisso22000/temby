import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('virtual blob workers use their native URL and register before construction',async()=>{
  const order:string[]=[];const channel=()=>({emit(){}});
  const client:any={workers:channel(),fetch:channel(),xhr:channel(),navigator:channel(),element:{emit(){},hookProperty(){},setAttribute(){}}};
  const virtual='blob:https://fixture.temby.invalid/owned';const native='blob:http://localhost:3001/owned';
  const page={__uv:{blobUrls:new Map([[virtual,native]]),sourceUrl:(s:string)=>s},navigator:{serviceWorker:{controller:{postMessage(message:any){assert.equal(message.tembyWorkerContext.url,native);order.push('register');}}}}};
  const context={self:{} as any,URL,Set};vm.runInNewContext(await readFile(new URL('../public/uv-network.js',import.meta.url),'utf8'),context);
  context.self.__tembyConfigureClientNetwork(client,page);
  client.workers.emit('worker',{data:{url:virtual,options:{}},target:class {constructor(url:string){assert.equal(url,native);order.push('construct');}},respondWith(){}});
  assert.deepEqual(order,['register','construct']);assert.equal(context.self.__tembyNetworkURL(page.__uv,virtual),native);
});

test('Request clones bypass URL stringification and retain POST bytes',async()=>{
  let fallback=0;const channel=()=>({emit(){}});
  const client:any={workers:channel(),fetch:{Request,emit(){fallback++;}},xhr:channel(),navigator:channel(),element:{emit(){},hookProperty(){},setAttribute(){}}};
  const context={self:{} as any,URL,Set};vm.runInNewContext(await readFile(new URL('../public/uv-network.js',import.meta.url),'utf8'),context);context.self.__tembyConfigureClientNetwork(client,{});
  const original=new Request('https://fixture.temby.invalid/api/page',{method:'POST',body:'owned-page',headers:{'x-owned':'unchanged'}});
  let result:Request|undefined;client.fetch.emit('request',{data:{input:original,options:{}},target:Request,respondWith(value:Request){result=value;}});
  assert.equal(fallback,0);assert.equal(result!.url,original.url);assert.equal(result!.method,'POST');assert.equal(result!.headers.get('x-owned'),'unchanged');assert.equal(await result!.text(),'owned-page');assert.equal(original.bodyUsed,true,'retain native Request body-transfer semantics');
});
