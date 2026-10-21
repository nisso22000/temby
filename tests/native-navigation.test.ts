import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('native navigation wraps GET and new windows while preserving POST and history traversal',async()=>{
  let listener:(event:any)=>void=()=>{};
  const calls:any[]=[];
  const local='http://localhost:3001';
  const page={setTimeout:(fn:()=>void)=>fn(),location:{origin:local,assign:(url:string)=>calls.push(['assign',url]),replace:(url:string)=>calls.push(['replace',url])},navigation:{addEventListener:(_:string,fn:any)=>listener=fn},open:(...args:any[])=>calls.push(['open',...args]),__uv:{rewriteUrl:(url:string)=>local+'/uv-service/'+encodeURIComponent(url)}};
  const context={self:{} as any,URL};vm.runInNewContext(await readFile(new URL('../public/uv-navigation.js',import.meta.url),'utf8'),context);
  context.self.__tembyConfigureNavigation(page);
  let prevented=0;
  const event={cancelable:true,defaultPrevented:false,formData:null,downloadRequest:null,navigationType:'push',destination:{url:'https://www.temu.com/search_result.html?q=owned'},preventDefault(){prevented++;}};
  listener(event);assert.equal(prevented,1);assert.deepEqual(calls.pop(),['assign',local+'/uv-service/'+encodeURIComponent(event.destination.url)]);
  listener({...event,navigationType:'replace'});assert.equal(calls.pop()[0],'replace');
  for(const change of [{formData:{}},{cancelable:false},{navigationType:'traverse'},{downloadRequest:'file'},{destination:{url:local+'/uv-service/already-encoded'}},{destination:{url:'https://unrelated.test/'}}]){const n=calls.length;listener({...event,...change});assert.equal(calls.length,n);}
  const intent='intent://com.einnovation.temu/search_result.html?q=owned#Intent;scheme=temu;package=com.einnovation.temu;end';
  listener({...event,destination:{url:local+'/uv-service/'+encodeURIComponent(intent)}});
  assert.deepEqual(calls.pop(),['assign',local+'/uv-service/'+encodeURIComponent('https://www.temu.com/search_result.html?q=owned')]);
  page.open('https://www.temu.com/product.html','_blank');assert.deepEqual(calls.pop(),['open',local+'/uv-service/'+encodeURIComponent('https://www.temu.com/product.html'),'_blank']);
});
