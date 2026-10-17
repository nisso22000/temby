import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

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
