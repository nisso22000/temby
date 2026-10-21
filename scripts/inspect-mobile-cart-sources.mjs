// Inspect structured mobile runtime state. No visible prices, credentials,
// account fields, product names/IDs or raw state are retained.
import {mkdir,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:9223';
const list=async()=>await(await fetch(base+'/json/list',{signal:AbortSignal.timeout(4000)})).json();
async function connect(target){
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.close();reject(Error('Connection timeout'));},4000);socket.onopen=()=>{clearTimeout(timer);resolve();};socket.onerror=()=>{clearTimeout(timer);reject(Error('Debugger unavailable'));};});let id=0;const pending=new Map();
 socket.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);};
 return {socket,send:(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Debugger timeout'));},10000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));})};
}
let targets=await list(),created=null;
if(process.argv.includes('--new-home-tab')||process.argv.includes('--new-product-tab')){
 const source=targets.find(t=>t.type==='page'&&t.url.startsWith('http://localhost:3001/uv-service/'));if(!source)throw Error('No proxy page');
 const c=await connect(source);try{const info=await c.send('Target.getTargetInfo',{targetId:source.id});let address='https://www.temu.com/';
  if(process.argv.includes('--new-product-tab')){const cart=targets.find(t=>{try{return t.type==='page'&&new URL(decodeURIComponent(new URL(t.url).pathname.slice(12))).pathname==='/shopping_cart.html';}catch{return false;}});if(!cart)throw Error('No existing cart product reference');const cc=await connect(cart);try{const value=await cc.send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const s=globalThis.__INITIAL_PROPS__?.store;const item=s?.goodsSkuList?.find(i=>i.isSelected===1);return item?.baseGoodsInfo?.linkUrl||null;})()`});if(!value.result?.value)throw Error('No current product reference');address=new URL(value.result.value,'https://www.temu.com/').href;}finally{cc.socket.close();}if(new URL(address).origin!=='https://www.temu.com')throw Error('Unexpected product origin');}
  const next=await c.send('Target.createTarget',{url:'http://localhost:3001/uv-service/'+encodeURIComponent(address),browserContextId:info.targetInfo.browserContextId,background:true});created=next.targetId;}finally{c.socket.close();}
 await new Promise(r=>setTimeout(r,5000));targets=await list();
}
const expression=`(()=>{
 const own=(o,k)=>{try{return Object.getOwnPropertyDescriptor(o,k)?.value;}catch{return undefined;}};
 const keys=o=>o&&typeof o==='object'?Object.keys(o).filter(k=>/^[a-z_$][a-z0-9_$]{0,65}$/i.test(k)&&!/^__uv|token|password|cookie|email|account|user|address/i.test(k)).slice(0,80):[];
 const names=Object.getOwnPropertyNames(globalThis).filter(k=>/store|cart|state|props|rawdata|next_data|webpack/i.test(k)&&!/^__uv|^__temby/i.test(k)).slice(0,60);
 const roots=[];for(const name of names){const value=own(globalThis,name);if(value&&typeof value==='object'&&!Array.isArray(value))roots.push({path:name,value});}
 const initial=globalThis.__INITIAL_PROPS__?.store;const raw=globalThis.rawData?.store;
 const storeShapes=[];for(const [path,value]of [['__INITIAL_PROPS__.stores',globalThis.__INITIAL_PROPS__?.stores],['__INITIAL_PROPS__.stores.store',globalThis.__INITIAL_PROPS__?.stores?.store],['rawData.stores',globalThis.rawData?.stores]]){
  if(!value||typeof value!=='object')continue;storeShapes.push({path,keys:keys(value),cartRelatedKeys:Object.keys(value).filter(k=>/store|cart|sku|api|checkout|float|amount|price/i.test(k)).slice(0,80)});
  for(const key of keys(value).filter(k=>/store|cart|sku|api|checkout|float/i.test(k))){try{const child=value[key];if(child&&typeof child==='object')storeShapes.push({path:path+'.'+key,keys:keys(child)});}catch{}}
 }
 if(initial)roots.push({path:'__INITIAL_PROPS__.store',value:initial});if(raw)roots.push({path:'rawData.store',value:raw});
 const elements=[document.documentElement,document.body,...document.querySelectorAll('body > div')].filter(Boolean).slice(0,16);
 for(const element of elements)for(const key of Object.keys(element).filter(k=>/^__reactFiber|^__reactContainer/.test(k)))roots.push({path:'ReactRoot',value:own(element,key)});
 const storage=[];for(const [name,store]of [['localStorage',localStorage],['sessionStorage',sessionStorage]]){for(let i=0;i<Math.min(store.length,200);i++){const key=store.key(i);if(!key||!/cart|scdb/i.test(key)||/token|auth|password|account|email/i.test(key))continue;storage.push({store:name,key});const text=store.getItem(key);if(text?.length<1000000)try{roots.push({path:name+'.'+key,value:JSON.parse(text)});}catch{}}}
 const queue=roots.slice(),seen=new WeakSet(),candidates=[],services=[];let scanned=0;
 while(queue.length&&scanned<25000){const {path,value,depth=0}=queue.shift();if(!value||typeof value!=='object'||seen.has(value)||depth>18)continue;seen.add(value);scanned++;
  const result=own(value,'result');const cart=own(result,'cartListInfo')||own(result,'cart_list_info');
  if(cart){const transfer=own(result,'cartTransferMap')||own(result,'cart_transfer_map'),goods=own(cart,'goodsSkuList')||own(cart,'goods_sku_list');candidates.push({path,kind:'full-cart-envelope',success:own(value,'success'),lines:Array.isArray(goods)?goods.length:null,total:own(transfer,'orderAmount')||own(transfer,'order_amount'),currency:own(transfer,'currency'),resultKeys:keys(result)});}
  const ks=Array.isArray(value)?Object.keys(value).slice(0,100):keys(value);for(const key of ks){let next=own(value,key);if(next===undefined&&/^(?:apiStore|cartModifyData|cartListInfo|cartData|cartStore|cartTransferMap)$/.test(key))try{next=value[key];}catch{}
   if(typeof next==='function'&&/cartModify|postRisk|queryFull|queryIndex|fetchCart/i.test(key))services.push({path:path+'.'+key,kind:'function'});
   if(next&&typeof next==='object'&&!/^(window|document|parent|top|ownerDocument|stateNode|return|alternate|debug)/i.test(key))queue.push({path:path+'.'+key,value:next,depth:/^(child|sibling)$/.test(key)?depth:depth+1});}
 }
 const path=globalThis.__uv?.meta?.url?.pathname||'';
 return {visible:document.visibilityState==='visible',pageKind:path==='/shopping_cart.html'?'cart':/login|verification|captcha/.test(path)?'authentication':'shopping',globalNames:names,storeShapes,storage,rootShapes:roots.slice(0,14).map(r=>({path:r.path,keys:keys(r.value)})),scanned,candidates:candidates.slice(0,15),services:services.slice(0,30),databaseAPI:typeof indexedDB?.databases};
})()`;
const result={capturedAt:new Date().toISOString(),scope:'Structured API/runtime source discovery only; no visible prices, secrets or product identifiers.',createdDiagnosticTab:created,targets:[]};
for(const target of targets.filter(t=>t.type==='page'&&t.url.startsWith('http://localhost:3001/uv-service/'))){const c=await connect(target);try{const r=await c.send('Runtime.evaluate',{expression,returnByValue:true});result.targets.push({target:target.id,...r.result?.value,error:r.exceptionDetails?'Runtime inspection failed':undefined});}finally{c.socket.close();}}
const out=new URL('../artifacts/mobile-session-investigation/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('runtime-cart-sources-'+Date.now()+'.json',out),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
