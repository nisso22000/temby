import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import vm from 'node:vm';
import {MessagePort,MessageChannel} from 'node:worker_threads';
const root=new URL('./',import.meta.url),engines=[],rows=[];
for(const name of ['v23','v24','v24-with-v23-url-normalizer']){
 const base=new URL((name==='v23'?'v23':'v24')+'/',root),self={navigator:{},location:{origin:'http://localhost:3999'}};
 const context={self,URL,location:self.location,navigator:self.navigator,MessagePort,MessageChannel,WebSocket,EventTarget,Event,Headers,Request,Response,Blob,fetch,TextEncoder,TextDecoder,crypto,atob,btoa,encodeURIComponent,decodeURIComponent};vm.createContext(context);
 for(const path of ['node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.bundle.js','public/uv-url.js','public/uv-config.js'])vm.runInContext(await readFile(new URL(path,base),'utf8'),context);
 if(name.includes('with-v23'))vm.runInContext(await readFile(new URL('v23/public/uv-url.js',root),'utf8'),context);
 engines.push({name,self});
}
const html='<!doctype html><html><body>'+Array.from({length:500},(_,i)=>`<a href="/product-${i}.html"><img src="https://img.kwcdn.com/public-${i}.jpg">Product ${i}</a>`).join('')+'</body></html>';
for(let round=1;round<=5;round++)for(const e of round%2?engines:[...engines].reverse()){
 const uv=new e.self.Ultraviolet({prefix:'/uv-service/',encodeUrl:encodeURIComponent,decodeUrl:decodeURIComponent});uv.meta={origin:'http://localhost:3999',url:new URL('https://www.temu.com/'),base:new URL('https://www.temu.com/')};
 const start=performance.now();const output=uv.rewriteHtml(html);rows.push({round,version:e.name,ms:Math.round((performance.now()-start)*100)/100,outputLength:output.length});
}
for(const e of engines){const samples=rows.filter(r=>r.version===e.name).map(r=>r.ms).sort((a,b)=>a-b);console.log(e.name,JSON.stringify(samples),'median',samples[2]);}
await writeFile(new URL('url-profile.json',root),JSON.stringify({scope:'Owned synthetic 500-link HTML; v24 normalizer replaced only inside an isolated VM. Not a production change.',rows},null,2));
