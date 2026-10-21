// Verify cart initialization on the existing homepage, without a cart-page
// visit. Clear only TEMBY's derived cart copy, preserving merchant/login data.
import {mkdir,writeFile} from 'node:fs/promises';
const list=async()=>await(await fetch('http://127.0.0.1:9223/json/list')).json();
const connect=async tab=>{const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const v=JSON.parse(e.data),p=pending.get(v.id);if(!p)return;clearTimeout(p.timer);pending.delete(v.id);v.error?p.reject(Error(v.error.message)):p.resolve(v.result);};return {socket,send:(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Debugger timeout'));},25000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));})};};
let targets=await list();
const home=targets.find(t=>{try{return t.type==='page'&&new URL(t.url).origin==='http://localhost:3001'&&new URL(decodeURIComponent(new URL(t.url).pathname.slice(12))).pathname==='/';}catch{return false;}});
if(!home)throw Error('No existing homepage; no navigation performed');
const page=await connect(home),result={startedAt:new Date().toISOString(),scope:'Update local worker, clear TEMBY derived snapshot only, reload existing homepage once; no cart-page visit, mutation, login or challenge action',snapshots:[]};
const snapshot=async()=>{const r=await page.send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const h=document.getElementById('temby-companion'),r=h?.shadowRoot;return {path:globalThis.__uv?.meta?.url?.pathname,visibility:document.visibilityState,source:h?.getAttribute('data-price-source'),issue:h?.getAttribute('data-cart-issue'),amount:r?.getElementById('amount')?.textContent,count:r?.getElementById('count')?.textContent,merchantNet:r?.getElementById('temuNet')?.textContent};})()`});return r.result?.value;};
try{
 await page.send('Page.bringToFront');result.before=await snapshot();
 await page.send('ServiceWorker.enable');await page.send('ServiceWorker.updateRegistration',{scopeURL:'http://localhost:3001/uv-service/'});await page.send('ServiceWorker.startWorker',{scopeURL:'http://localhost:3001/uv-service/'});
 await new Promise(r=>setTimeout(r,500));targets=await list();
 const target=targets.find(t=>t.type==='service_worker'&&t.url.includes('localhost:3001/uv/sw.js'));if(!target)throw Error('Updated worker unavailable');
 const worker=await connect(target);
 try{const r=await worker.send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{if(typeof readCurrentCart!=='function')return {updated:false};await cartState.clear('https://www.temu.com',Date.now());return {updated:true,derivedCopyCleared:true};})()`});result.update=r.result?.value;if(!result.update?.updated)throw Error('New initializer not active');}finally{worker.socket.close();}
 await page.send('Page.reload');
 for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,1000));try{const state=await snapshot();result.snapshots.push(state);if(state?.path==='/'&&state?.source==='response'&&state?.count)break;if(/login|verification/.test(state?.path||''))break;}catch{}}
}catch(e){result.error=e.message;}finally{page.socket.close();}
result.finishedAt=new Date().toISOString();const out=new URL('../artifacts/improvements-v43/',import.meta.url);await mkdir(out,{recursive:true});const body=JSON.stringify(result,null,2);await writeFile(new URL('physical-homepage-startup-'+result.startedAt.replace(/[:.]/g,'-')+'.json',out),body);await writeFile(new URL('physical-homepage-startup.json',out),body);console.log(body);
