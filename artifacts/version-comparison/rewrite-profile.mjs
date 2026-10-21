import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import vm from 'node:vm';
import {MessagePort,MessageChannel} from 'node:worker_threads';
const root=new URL('./',import.meta.url),rows=[];
const vendorURL='https://static.kwcdn.com/m-assets/assets/modernjs/vendors_622f0f2c8be3ec52b96f.js';
const response=await fetch(vendorURL,{signal:AbortSignal.timeout(25000)});
if(!response.ok)throw new Error('Public script fetch failed: '+response.status);
const script=await response.text();
if(script.length<100000)throw new Error('Unexpected vendor response size');
const engines=[];
for(const version of ['v23','v24']){
 const base=new URL(version+'/',root),self={navigator:{},location:{origin:'http://localhost:3999'}};
 const context={self,URL,location:self.location,navigator:self.navigator,MessagePort,MessageChannel,WebSocket,EventTarget,Event,Headers,Request,Response,Blob,fetch,TextEncoder,TextDecoder,crypto,atob,btoa,encodeURIComponent,decodeURIComponent};vm.createContext(context);
 vm.runInContext(await readFile(new URL('node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.bundle.js',base),'utf8'),context);
 vm.runInContext(await readFile(new URL('public/uv-url.js',base),'utf8'),context);
 vm.runInContext(await readFile(new URL('public/uv-config.js',base),'utf8'),context);
 self.__tembyInlineHelpers={};for(const [key,path]of [['/uv/bundle.js','uv.bundle.js'],['/uv/client.js','uv.client.js'],['/uv/handler.js','uv.handler.js']])self.__tembyInlineHelpers[key]=await readFile(new URL('node_modules/@titaniumnetwork-dev/ultraviolet/dist/'+path,base),'utf8');
 self.__tembyInlineHelpers['/uv/config.js']=await readFile(new URL('public/uv-config.js',base),'utf8');
 engines.push({version,self});
}
const html='<!doctype html><html><head><title>Owned CPU workload</title></head><body>'+Array.from({length:100},(_,i)=>`<article><a href="/product-${i}.html"><img src="https://img.kwcdn.com/public-${i}.jpg">Product ${i}</a></article>`).join('')+'</body></html>';
for(let round=1;round<=5;round++)for(const e of round%2?engines:[...engines].reverse())for(const workload of ['vendor-js','html-100-cards','helper-injection']){
 const uv=new e.self.Ultraviolet({prefix:'/uv-service/',encodeUrl:encodeURIComponent,decodeUrl:decodeURIComponent});uv.meta={origin:'http://localhost:3999',url:new URL('https://www.temu.com/'),base:new URL('https://www.temu.com/')};
 const start=performance.now();let output;
 if(workload==='vendor-js')output=uv.rewriteJS(script);
 if(workload==='html-100-cards')output=uv.rewriteHtml(html);
 if(workload==='helper-injection')output=uv.createHtmlInject('/uv/handler.js','/uv/bundle.js','/uv/client.js','/uv/config.js','','');
 rows.push({round,version:e.version,workload,ms:Math.round((performance.now()-start)*100)/100,outputSize:typeof output==='string'?output.length:JSON.stringify(output,(k,v)=>k==='parentNode'?undefined:v).length});
 console.log(JSON.stringify(rows.at(-1)));
}
await writeFile(new URL('rewrite-profile.json',root),JSON.stringify({scope:'Node VM CPU microbenchmark; actual public vendor source parsed, never executed. HTML workload synthetic. Not a page-load benchmark.',vendorBytes:Buffer.byteLength(script),rows},null,2));
