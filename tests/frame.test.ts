import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {MessageChannel,MessagePort} from 'node:worker_threads';

test('UV frame probing preserves native cross-origin getter behavior',async()=>{
  let installed:any;
  const channel=()=>({emit(){}});
  const client:any={workers:channel(),fetch:channel(),xhr:channel(),navigator:channel(),element:{emit(){},hookProperty(_classes:any,_key:any,options:any){installed=options;},setAttribute(){}}};
  const context={self:{} as any,Set,URL};vm.runInNewContext(await readFile(new URL('../public/uv-network.js',import.meta.url),'utf8'),context);
  context.self.__tembyConfigureClientNetwork(client,{});
  const denied=()=>{throw new DOMException('Cross-origin frame','SecurityError');};
  client.element.hookProperty(null,'contentDocument',{get:denied});assert.equal(installed.get(()=>null,{}),null);
  const windowProxy={ownedSentinel:true};client.element.hookProperty(null,'contentWindow',{get:denied});assert.equal(installed.get(()=>windowProxy,{}),windowProxy);
  client.element.hookProperty(null,'contentDocument',{get(){throw new TypeError('owned error');}});assert.throws(()=>installed.get(()=>null,{}),/owned error/);
  client.element.hookProperty(null,'contentDocument',{get:denied});assert.throws(()=>installed.get(()=>{throw new DOMException('native denial','SecurityError');},{}),/native denial/);
});

test('real UV rewrite preserves permitted cross-origin postMessage without probing helper properties on the Window',async()=>{
  const self:any={navigator:{},location:{origin:'http://localhost:3001'}};
  const context:any={self,URL,location:self.location,navigator:self.navigator,MessagePort,MessageChannel,WebSocket,EventTarget,Event,Headers,Request,Response,Blob,fetch,TextEncoder,TextDecoder,crypto,atob,btoa,encodeURIComponent,decodeURIComponent};vm.createContext(context);
  vm.runInContext(await readFile(new URL('../node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.bundle.js',import.meta.url),'utf8'),context);
  const config={prefix:'/uv-service/',encodeUrl:encodeURIComponent,decodeUrl:decodeURIComponent};
  const original=new self.Ultraviolet(config);original.meta={origin:self.location.origin,url:new URL('https://www.temu.com/'),base:new URL('https://www.temu.com/')};
  let messages=0;let target:any;
  target=new Proxy({}, {get(_object,key){
    if(key==='window'||key==='top'||key==='parent')return target;
    if(key==='postMessage')return function(this:any,message:any,origin:string){assert.equal(this,target);assert.equal(message.kind,'test');assert.equal(origin,'https://frame.test');messages++;};
    throw new DOMException('Cross-origin Window access denied','SecurityError');
  }});
  context.target=target;context.frame={contentWindow:target};context.__uv=original;
  const source='frame.contentWindow.postMessage({kind:"test"},"https://frame.test");';
  assert.throws(()=>vm.runInContext(original.rewriteJS(source),context),{name:'SecurityError'},'reproduce UV helper lookup failure');
  vm.runInContext(await readFile(new URL('../public/uv-network.js',import.meta.url),'utf8'),context);
  vm.runInContext(await readFile(new URL('../public/uv-config.js',import.meta.url),'utf8'),context);
  const uv=new self.Ultraviolet(config);uv.meta=original.meta;context.__uv=uv;
  const rewritten=uv.rewriteJS(source);vm.runInContext(rewritten,context);assert.equal(messages,1);
  assert.throws(()=>vm.runInContext(uv.rewriteJS('target.location.href'),context),{name:'SecurityError'},'native forbidden access remains forbidden');
  let evaluated=0;context.getFrame=()=>{evaluated++;return {contentWindow:target};};vm.runInContext(uv.rewriteJS('getFrame().contentWindow.postMessage({kind:"test"},"https://frame.test")'),context);assert.equal(evaluated,1,'object expressions run once');
});
