// Passive, temporary action/network observation in an isolated debugger world.
// No clicks, navigation, cart writes, login, or challenge interaction.
import {mkdir,writeFile} from 'node:fs/promises';
const cartRead=process.argv.includes('--cart-read');
const tabs=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const tab=tabs.find(t=>t.type==='page'&&/^http:\/\/localhost:3001\/uv-service\//.test(t.url));if(!tab)throw Error('No proxy tab on phone');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
let id=0;const pending=new Map();const requests=new Map();
let stopRequested=false;process.once('SIGINT',()=>{stopRequested=true;});
const result={startedAt:new Date().toISOString(),scope:'Passive physical-phone user action capture. No agent interaction and no raw request/response bodies, credentials, product names or query values saved.',actions:[],responses:[],failures:[],navigations:[]};
const out=new URL('../artifacts/mobile-session-investigation/',import.meta.url);await mkdir(out,{recursive:true});
const save=()=>writeFile(new URL(cartRead?'phone-verification-cart.json':'phone-action-relay-aware.json',out),JSON.stringify(result,null,2));
function address(value){try{let u=new URL(value);if(u.pathname.startsWith('/uv-service/'))u=new URL(decodeURIComponent(u.pathname.slice(12)));return {host:u.hostname,route:u.pathname.startsWith('/api/')?u.pathname.split('/').map(p=>/^[a-z_-]{1,40}$/i.test(p)?p:p?'[value]':'').join('/'):/^\/(?:login|shopping_cart|index|bgt_order_checkout|bgn_verification)\.html$/.test(u.pathname)||u.pathname==='/'?u.pathname:'[resource]'};}catch{return {host:'invalid',route:'[resource]'};}}
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Debugger timeout: '+method));},8000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});
socket.onmessage=event=>{
 const e=JSON.parse(event.data);
 if(e.id){const p=pending.get(e.id);if(!p)return;clearTimeout(p.timer);pending.delete(e.id);e.error?p.reject(Error(e.error.message)):p.resolve(e.result);return;}
 if(e.method==='Runtime.bindingCalled'&&e.params.name==='__tembyPassiveAction'){
  try{const a=JSON.parse(e.params.payload);if(['add-cart','search','product-link','other-control'].includes(a.kind)&&Number.isSafeInteger(a.time)&&result.actions.length<40)result.actions.push({kind:a.kind,time:a.time});}catch{}
 }
 if(e.method==='Page.frameNavigated'&&!e.params.frame.parentId)result.navigations.push({...address(e.params.frame.url),observedAt:new Date().toISOString()});
 if(e.method==='Network.requestWillBeSent'){
  const r=e.params.request;let info=address(r.url),method=r.method,isRelay=false;
  if(new URL(r.url).pathname==='/_relay'&&r.postData){try{const operation=JSON.parse(r.postData);info=address(operation.url);method=operation.method;isRelay=true;}catch{}}
  if(info.route.startsWith('/api/'))requests.set(e.params.requestId,{...info,method,isRelay,observedAt:Math.round(e.params.wallTime*1000),initiator:e.params.initiator?.type});
 }
 if(e.method==='Network.responseReceived'){
  const r=e.params.response,request=requests.get(e.params.requestId),info=request||address(r.url);
  if(result.responses.length<400&&(info.route.startsWith('/api/')||r.status>=400)){
   const entry={...info,...request,status:request?.isRelay?null:r.status,transportStatus:r.status,fromWorker:r.fromServiceWorker===true,responseAt:Date.now()};result.responses.push(entry);
   if(info.route.startsWith('/api/'))entry.inspectBody=true;
  }
 }
 if(e.method==='Network.loadingFinished'){
  const request=requests.get(e.params.requestId);if(!request)return;
  const entry=result.responses.findLast(x=>x.inspectBody&&x.observedAt===request.observedAt&&x.route===request.route);if(!entry)return;delete entry.inspectBody;
  if(e.params.encodedDataLength>2*1024*1024)return;
  void send('Network.getResponseBody',{requestId:e.params.requestId}).then(body=>{
   let bytes=body.base64Encoded?Buffer.from(body.body,'base64'):Buffer.from(body.body);if(bytes.length>2*1024*1024)return;
   if(entry.isRelay){try{if(bytes[0]===123){const wire=JSON.parse(bytes.toString());entry.status=wire.status;bytes=Buffer.from(wire.body||'','base64');}else{const length=bytes.readUInt32BE(0);if(length>1024*1024)return;entry.status=JSON.parse(bytes.subarray(4,4+length).toString()).status;bytes=bytes.subarray(4+length);}}catch{return;}}
   const text=bytes.toString();
   try{const value=JSON.parse(text);entry.application={success:typeof value.success==='boolean'?value.success:null,errorCode:Number.isSafeInteger(value.error_code??value.errorCode)?value.error_code??value.errorCode:null,hasCartList:!!value.result?.cartListInfo};
    if(/\/cart_modify(?:\/|$)|\/cart_modify_page(?:\/|$)/.test(entry.route)){
     const safeKeys=o=>o&&typeof o==='object'?Object.keys(o).filter(k=>/^[a-zA-Z_$][a-zA-Z0-9_$]{0,60}$/.test(k)&&!/^__uv|token|password|cookie|email|account/i.test(k)).slice(0,100):[];
     const shape=(o,depth=0)=>Array.isArray(o)?{arrayLength:o.length,first:depth<4?shape(o[0],depth+1):undefined}:o&&typeof o==='object'?{keys:safeKeys(o),children:depth<4?Object.fromEntries(safeKeys(o).filter(k=>o[k]&&typeof o[k]==='object').slice(0,25).map(k=>[k,shape(o[k],depth+1)])):undefined}:typeof o;
     entry.application.shape=shape(value);
    }
   }catch{}
  }).catch(()=>{});
 }
 if(e.method==='Network.loadingFailed'){
  const r=requests.get(e.params.requestId);if(r&&result.failures.length<50)result.failures.push({...r,canceled:!!e.params.canceled,blockedReason:e.params.blockedReason});
 }
};
const source=`(()=>{const emit=event=>{const target=event.target,control=target?.closest?.('button,a,[role="button"],input');if(!control)return;const label=(control.getAttribute('aria-label')||control.textContent||'').trim();let kind='other-control';if(/add to cart|quick add|ajouter.*panier|أضف.*السلة|إضافة.*السلة|اضف.*السلة/i.test(label))kind='add-cart';else if(event.type==='keydown'&&event.key==='Enter'&&control.tagName==='INPUT')kind='search';else if(control.tagName==='A'&&/goods/.test(control.getAttribute('href')||''))kind='product-link';else if(event.type==='keydown')return;globalThis.__tembyPassiveAction(JSON.stringify({kind,time:Date.now()}));};document.addEventListener('click',emit,true);document.addEventListener('keydown',emit,true);globalThis.__tembyPassiveCleanup=()=>{document.removeEventListener('click',emit,true);document.removeEventListener('keydown',emit,true);};})()`;
let script;
try{
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Runtime.addBinding',{name:'__tembyPassiveAction',executionContextName:'temby-passive-action'});
 script=await send('Page.addScriptToEvaluateOnNewDocument',{source,worldName:'temby-passive-action'});
 const frames=await send('Page.getFrameTree');const world=await send('Page.createIsolatedWorld',{frameId:frames.frameTree.frame.id,worldName:'temby-passive-action'});
 await send('Runtime.evaluate',{expression:source,contextId:world.executionContextId});
 console.log(cartRead?'Passive phone capture active for up to 60 minutes.':'Passive phone capture active for up to 90 seconds.');await save();
 for(let i=0;!stopRequested&&i<(cartRead?720:18);i++){await new Promise(r=>setTimeout(r,5000));await save();if(!cartRead&&result.actions.some(a=>a.kind==='add-cart')&&result.responses.some(r=>r.application?.success===false||r.status>=400))break;}
}finally{
 if(script)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier}).catch(()=>{});
 const frames=await send('Page.getFrameTree').catch(()=>null);
 if(frames){const world=await send('Page.createIsolatedWorld',{frameId:frames.frameTree.frame.id,worldName:'temby-passive-action'}).catch(()=>null);if(world)await send('Runtime.evaluate',{expression:'globalThis.__tembyPassiveCleanup?.()',contextId:world.executionContextId}).catch(()=>{});}
 await send('Runtime.removeBinding',{name:'__tembyPassiveAction'}).catch(()=>{});await send('Network.disable').catch(()=>{});socket.close();
 result.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify(result,null,2));
}
