// Read-only CDP inspection of the connected phone. No navigation, challenge,
// login, cookie read, storage write, or remote-browser close is performed.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const tabs=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const target=tabs.find(t=>t.type==='page'&&/^http:\/\/localhost:3001\/uv-service\//.test(t.url));
if(!target){console.log('No proxied merchant tab on connected phone.');process.exit(0);}
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{const timer=setTimeout(()=>{socket.close();j(Error('Android debugger connection timed out'));},8000);socket.onopen=()=>{clearTimeout(timer);r();};socket.onerror=e=>{clearTimeout(timer);j(e);};});
let sequence=0;const pending=new Map();
socket.onmessage=e=>{const v=JSON.parse(e.data);if(!v.id)return;const waiter=pending.get(v.id);if(!waiter)return;clearTimeout(waiter.timer);pending.delete(v.id);v.error?waiter.reject(Error(v.error.message)):waiter.resolve(v.result);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Android debugger timed out: '+method));},8000);pending.set(id,{resolve,reject,timer});console.log('Android read: '+method);socket.send(JSON.stringify({id,method,params}));});
const proposed=await readFile(new URL('../public/companion-cart.js',import.meta.url),'utf8');
const result={scope:'Read-only physical Android tab and normalized database summaries. No credentials, item names, IDs, or raw merchant bodies saved.',databases:[]};
try{
 const state=await send('Runtime.evaluate',{expression:`JSON.stringify((()=>{const host=document.getElementById('temby-companion'),root=host?.shadowRoot;return {companion:!!host,source:host?.getAttribute('data-price-source'),issue:host?.getAttribute('data-cart-issue'),updating:host?.getAttribute('data-updating'),cache:host?.getAttribute('data-cart-cache'),amount:root?.getElementById('amount')?.textContent,warning:root?.getElementById('cartWarning')?.textContent,button:root?.getElementById('primary')?.textContent,workerRevision:/[?&]v=(\\d+)/.exec(navigator.serviceWorker?.controller?.scriptURL||'')?.[1],visibility:document.visibilityState,readyState:document.readyState,mobile:matchMedia('(max-width:600px)').matches,hasTouch:navigator.maxTouchPoints>0};})())`,returnByValue:true});
 if(state.result?.value)result.page=JSON.parse(state.result.value);
 const securityOrigin=new URL(target.url).origin;
 const frames=await send('Page.getFrameTree');
 const isolated=await send('Page.createIsolatedWorld',{frameId:frames.frameTree.frame.id,worldName:'temby-readonly-diagnostic'});
 const pureExpression=`(()=>{const self={};${proposed}
 const api=self.__tembyCart;const summary=c=>{const selected=api.select([c],Date.now());return {time:c.time,merchantRequestTime:c.merchantRequestTime,ageMs:Date.now()-c.time,currency:c.currency,totalMinor:c.minor,items:c.items.length,quantity:selected?.quantity,invalidLines:c.invalid,selectedInvalid:selected?.selectedInvalid,unselectedInvalid:selected?.unselectedInvalid,accepted:!!selected};};
const now=Date.now();const sample={k:String(now),d:{success:true,result:{cartListInfo:{checkoutExtendMap:{ckCartCcy:'EUR'},invalidGoodsLines:1,goodsSkuList:Array.from({length:7},(_,i)=>({isSelected:i===5?0:1,baseGoodsInfo:{goodsId:601000000+i},skuInfo:{skuId:175000000+i,amount:i===5?0:1},...i===5?{invalidDescVo:{invalidType:'SKU_SOLD_OUT'}}:{}}))},cartTransferMap:{currency:'EUR',orderAmount:'2699',lastRequestTime:String(now)},discountInfo:{orderAmountDto:{orderAmount:2699}}}}};return summary(api.normalize(sample)[0]);})()`;
 const pure=await send('Runtime.evaluate',{expression:pureExpression,contextId:isolated.executionContextId,returnByValue:true});
 if(pure.result?.value)result.ownedSevenLineParser=pure.result.value;
 const expression=`(async()=>{const self={};${proposed}
 const api=self.__tembyCart;const summary=c=>{const selected=api.select([c],Date.now());return {time:c.time,merchantRequestTime:c.merchantRequestTime,ageMs:Date.now()-c.time,currency:c.currency,totalMinor:c.minor,items:c.items.length,quantity:selected?.quantity,invalidLines:c.invalid,selectedInvalid:selected?.selectedInvalid,unselectedInvalid:selected?.unselectedInvalid,accepted:!!selected};};
 const read=async name=>{let database;try{database=await new Promise((resolve,reject)=>{let finished=false;const request=indexedDB.open(name);const timer=setTimeout(()=>{finished=true;reject(Error('open-timeout'));},1500);request.onupgradeneeded=()=>request.transaction.abort();request.onerror=()=>{clearTimeout(timer);reject(Error('absent-or-unavailable'));};request.onsuccess=()=>{clearTimeout(timer);if(finished)request.result.close();else resolve(request.result);};});
 if(!database.objectStoreNames.contains('entries'))return {scoped:name!=='scdb',stores:Array.from(database.objectStoreNames),carts:[]};
 const carts=[];let count=0;await new Promise((resolve,reject)=>{const tx=database.transaction('entries','readonly'),cursor=tx.objectStore('entries').openCursor();const timer=setTimeout(()=>{try{tx.abort();}catch{}reject(Error('read-timeout'));},2000);cursor.onsuccess=()=>{const item=cursor.result;if(!item||++count>800)return;carts.push(...api.normalize(item.value,item.key).filter(c=>c.canonical).slice(0,3).map(summary));item.continue();};tx.oncomplete=()=>{clearTimeout(timer);resolve();};tx.onerror=tx.onabort=()=>{clearTimeout(timer);reject(Error('read-unavailable'));};});return {scoped:name!=='scdb',records:count,carts:carts.slice(0,12)};
 }catch(e){return {scoped:name!=='scdb',error:e.message};}finally{database?.close();}};
 const now=Date.now();const sample={k:String(now),d:{success:true,result:{cartListInfo:{checkoutExtendMap:{ckCartCcy:'EUR'},invalidGoodsLines:1,goodsSkuList:Array.from({length:7},(_,i)=>({isSelected:i===5?0:1,baseGoodsInfo:{goodsId:601000000+i},skuInfo:{skuId:175000000+i,amount:i===5?0:1},...i===5?{invalidDescVo:{invalidType:'SKU_SOLD_OUT'}}:{}}))},cartTransferMap:{currency:'EUR',orderAmount:'2699',lastRequestTime:String(now)},discountInfo:{orderAmountDto:{orderAmount:2699}}}}};
 return {databases:[await read('https://www.temu.com@scdb'),await read('scdb')],ownedSevenLineParser:summary(api.normalize(sample)[0])};})()`;
 const inspected=await send('Runtime.evaluate',{expression,contextId:isolated.executionContextId,awaitPromise:true,returnByValue:true,timeout:6500});
 if(inspected.result?.value)Object.assign(result,inspected.result.value);
 else result.inspectionError=inspected.exceptionDetails?'Phone evaluation failed':'No summary returned';
}catch(error){result.inspectionError=error.message;}finally{socket.close();}
const out=new URL('../artifacts/improvements-v39/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('android-database-diagnosis.json',out),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
