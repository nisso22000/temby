// One authorized local worker update and cart refresh. No login, challenge,
// checkout or cart mutation. Keep the existing browser and server session.
import {mkdir,writeFile} from 'node:fs/promises';
const browse=process.argv.includes('--browse');
const tabs=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const tab=tabs.find(t=>t.type==='page'&&/^http:\/\/localhost:3001\/uv-service\//.test(t.url)&&new URL(decodeURIComponent(new URL(t.url).pathname.slice(12))).pathname==='/shopping_cart.html');
if(!tab)throw Error('No visible cart target; no refresh performed');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
let sequence=0;const pending=new Map(),workerErrors=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Debugger timeout: '+method));},25000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
socket.onmessage=e=>{const v=JSON.parse(e.data);if(v.method==='ServiceWorker.workerErrorReported'){const d=v.params.errorMessage;if(d?.sourceURL?.includes('/uv/'))workerErrors.push({message:d.errorMessage?.slice(0,300),line:d.lineNumber,column:d.columnNumber});}const p=pending.get(v.id);if(!p)return;clearTimeout(p.timer);pending.delete(v.id);v.error?p.reject(Error(v.error.message)):p.resolve(v.result);};
const snapshot=async()=>{const v=await send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const h=document.getElementById('temby-companion'),r=h?.shadowRoot;return {path:globalThis.__uv?.meta?.url?.pathname,visibility:document.visibilityState,source:h?.getAttribute('data-price-source'),updating:h?.getAttribute('data-updating'),issue:h?.getAttribute('data-cart-issue'),amount:r?.getElementById('amount')?.textContent,count:r?.getElementById('count')?.textContent,merchantNet:r?.getElementById('temuNet')?.textContent,bubbleBottom:h?.getBoundingClientRect().bottom,viewportHeight:innerHeight};})()`});return v.result?.value;};
const result={startedAt:new Date().toISOString(),scope:'One local worker update and ordinary cart refresh; no merchant interaction beyond loading that cart document',snapshots:[],workerErrors};
const waitForCart=async(expected)=>{let last;for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,1000));try{last=await snapshot();}catch{continue;}result.snapshots.push(last);if(last?.path===expected&&last?.source==='response'&&last?.updating==='false'||/login|verification/.test(last?.path||''))break;}return last;};
try{
 result.before=await snapshot();if(result.before?.visibility!=='visible')throw Error('Cart tab not visible; no refresh performed');
 const product=browse?await send('Runtime.evaluate',{returnByValue:true,expression:`globalThis.rawData?.store?.apiStore?.cartModifyData?.result?.cartListInfo?.goodsSkuList?.find(item=>item.isSelected===1)?.baseGoodsInfo?.linkUrl`}):null;
 await send('ServiceWorker.enable');
 const tree=await send('Page.getFrameTree');const world=await send('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:'temby-worker-update'});
 const local=await send('Runtime.evaluate',{contextId:world.executionContextId,awaitPromise:true,returnByValue:true,expression:`fetch('/uv/sw.js?v=41',{cache:'no-store'}).then(async r=>({status:r.status,length:(await r.text()).length})).catch(e=>({error:e.message}))`});result.localAsset=local.result?.value;
 await send('ServiceWorker.updateRegistration',{scopeURL:'http://localhost:3001/uv-service/'});
 const update=await send('Runtime.evaluate',{contextId:world.executionContextId,awaitPromise:true,returnByValue:true,expression:`(async()=>{const r=await navigator.serviceWorker.getRegistration();if(!r)throw Error('No current worker registration');await r.update();const w=r.installing||r.waiting;if(w&&w.state!=='activated')await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Activation timeout')),15000);w.addEventListener('statechange',()=>{if(w.state==='activated'){clearTimeout(t);resolve();}else if(w.state==='redundant'){clearTimeout(t);reject(Error('Worker redundant'));}});});await new Promise(resolve=>setTimeout(resolve,200));return {active:!!r.active,state:r.active?.state};})()`});
 if(update.exceptionDetails)throw Error(update.exceptionDetails.exception?.description?.slice(0,300)||'Worker update evaluation failed');
 result.update=update.result?.value;if(!result.update?.active||result.update?.state!=='activated')throw Error('Updated worker not activated; no refresh performed');
 await send('Page.reload');result.refreshedAt=new Date().toISOString();
 const cart=await waitForCart('/shopping_cart.html');
 if(browse&&cart?.source==='response'&&cart?.path==='/shopping_cart.html'){
  result.scope='Authorized cart refresh, homepage, existing product and product reload; no login/challenge handling or cart mutations';
  result.browsing=[];
  const navigate=async(url,label)=>{await send('Page.navigate',{url:'http://localhost:3001/uv-service/'+encodeURIComponent(url.href)});const state=await waitForCart(url.pathname);result.browsing.push({label,...state});return state?.path===url.pathname&&state?.source==='response';};
  if(await navigate(new URL('https://www.temu.com/'),'homepage')){
   if(typeof product?.result?.value==='string'){
    const address=new URL(product.result.value,'https://www.temu.com/');
    if(address.origin==='https://www.temu.com'&&await navigate(address,'existing-product')){await send('Page.reload');result.browsing.push({label:'product-reload',...await waitForCart(address.pathname)});}
   }
  }
 }
}catch(error){result.error=error.message;}finally{socket.close();}
result.finishedAt=new Date().toISOString();const out=new URL(browse?'../artifacts/improvements-v42/':'../artifacts/improvements-v41/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('physical-phone-cart.json',out),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));

