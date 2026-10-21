// Passive Android capture across tab/worker creation and navigation. No merchant
// requests, input, storage changes, credentials or raw payloads are recorded.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
const adapter={self:{},URL};vm.runInNewContext(await readFile(new URL('../public/companion-cart.js',import.meta.url),'utf8'),adapter);
const root=new URL('../artifacts/mobile-session-investigation/',import.meta.url);await mkdir(root,{recursive:true});
const name='cart-lifecycle-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
const result={startedAt:new Date().toISOString(),scope:'Passive Samsung capture; no raw payloads, cookie values, tokens, account details or product identifiers retained.',connections:[],events:[],snapshots:[]};
const sockets=new Map();let stop=false;process.once('SIGINT',()=>stop=true);
const save=()=>writeFile(new URL(name,root),JSON.stringify(result,null,2));
const append=entry=>{if(result.events.length<1500)result.events.push(entry);};
const safeKeys=value=>value&&typeof value==='object'?Object.keys(value).filter(k=>/^[a-z_][a-z0-9_]{0,59}$/i.test(k)&&!/^__uv|token|password|cookie|email|account/i.test(k)).slice(0,70):[];
function address(value){try{let u=new URL(value);if(u.pathname.startsWith('/uv-service/'))u=new URL(decodeURIComponent(u.pathname.slice(12)));return {host:u.hostname,route:u.pathname.split('/').map(p=>/^[a-z_-]{1,50}$/i.test(p)?p:p?'[value]':'').join('/')};}catch{return null;}}
const cartRoute=info=>info&&/(^|\.)temu\.com$/.test(info.host)&&/\/api\//.test(info.route)&&/cart|shopping_cart/.test(info.route);
async function connect(target){
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.close();reject(Error('Debugger connection timeout'));},3000);socket.onopen=()=>{clearTimeout(timer);resolve();};socket.onerror=()=>{clearTimeout(timer);reject(Error('Debugger connection unavailable'));};});
 let id=0;const pending=new Map(),requests=new Map();
 const connection={socket,type:target.type,send(method,params={}){return new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Debugger timeout'));},6000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});}};
 sockets.set(target.id,connection);result.connections.push({target:target.id,type:target.type,connectedAt:Date.now()});
 socket.onclose=()=>{sockets.delete(target.id);result.connections.push({target:target.id,disconnectedAt:Date.now()});for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Debugger disconnected'));}pending.clear();};
 socket.onmessage=event=>{
  const e=JSON.parse(event.data);if(e.id){const p=pending.get(e.id);if(!p)return;pending.delete(e.id);clearTimeout(p.timer);e.error?p.reject(Error(e.error.message)):p.resolve(e.result);return;}
  const send=connection.send;
  if(e.method==='Runtime.consoleAPICalled'&&e.params.args?.[0]?.value==='[TEMBY cart]'){
   const objectId=e.params.args[1]?.objectId;if(!objectId)return;
   void send('Runtime.getProperties',{objectId,ownProperties:true}).then(r=>{const trace={kind:'trace',target:target.id,observedAt:Date.now()};for(const p of r.result)if(['phase','route','source','reason','method','status','time','requestStartedAt','totalMinor','currency','items','selectedUnits'].includes(p.name)&&['string','number','boolean'].includes(p.value?.type))trace[p.name]=p.value.value;append(trace);}).catch(()=>{});
  }
  if(e.method==='Network.requestWillBeSent'){
   const req=e.params.request;let info=address(req.url),body=req.postData,relay=false,headers=req.headers;
   if(info?.route==='/_relay'&&body){try{const operation=JSON.parse(body);info=address(operation.url);headers=operation.headers;body=operation.body?Buffer.from(operation.body,'base64').toString():null;relay=true;}catch{return;}}
   if(!cartRoute(info))return;
   let operation=null,keys=[];try{const parsed=JSON.parse(body);operation=Number.isSafeInteger(parsed.cart_modify_type)?parsed.cart_modify_type:null;keys=safeKeys(parsed);}catch{}
   const entry={kind:'api',target:target.id,...info,requestAt:Date.now(),method:req.method,relay,operation,bodyKeys:keys,hasRiskHeader:Object.keys(headers||{}).some(k=>/^anti-content$/i.test(k))};requests.set(e.params.requestId,entry);append(entry);
  }
  if(e.method==='Network.responseReceived'){
   const entry=requests.get(e.params.requestId);if(entry){entry.status=e.params.response.status;entry.fromWorker=!!e.params.response.fromServiceWorker;}
  }
  if(e.method==='Network.loadingFailed'){const entry=requests.get(e.params.requestId);if(entry){entry.failed=true;entry.canceled=!!e.params.canceled;}}
  if(e.method==='Network.loadingFinished'){
   const entry=requests.get(e.params.requestId);if(!entry||e.params.encodedDataLength>2*1024*1024)return;
   void send('Network.getResponseBody',{requestId:e.params.requestId}).then(r=>{
    let bytes=Buffer.from(r.body,r.base64Encoded?'base64':'utf8');if(bytes.length>2*1024*1024)return;
    if(entry.relay){if(bytes[0]===123){const wire=JSON.parse(bytes.toString());entry.status=wire.status;bytes=Buffer.from(wire.body||'','base64');}else{const length=bytes.readUInt32BE(0);if(length>1024*1024)return;entry.status=JSON.parse(bytes.subarray(4,4+length).toString()).status;bytes=bytes.subarray(4+length);}}
    const packet=JSON.parse(bytes.toString());entry.success=typeof packet.success==='boolean'?packet.success:null;entry.operationSuccess=typeof packet.result?.success==='boolean'?packet.result.success:null;entry.errorCode=Number.isSafeInteger(packet.error_code??packet.errorCode)?packet.error_code??packet.errorCode:null;entry.resultKeys=safeKeys(packet.result);entry.hasCartList=!!(packet.result?.cart_list_info||packet.result?.cartListInfo);
    const facts=adapter.self.__tembyCart.responseFacts(packet,entry.requestAt);entry.acceptedSnapshot=!!facts;
    if(facts){const c=facts.carts[0];entry.cart={totalMinor:c.minor,currency:c.currency,time:c.time,observedAt:c.observedAt,items:c.items.length,quantity:c.items.reduce((n,i)=>n+(i.selection?i.quantity:0),0)};}
   }).catch(()=>{entry.bodyUnavailable=true;});
  }
 };
 await connection.send('Runtime.enable');await connection.send('Network.enable');
}
console.log('Passive cart capture started: '+name);await save();
try{
 for(let tick=0;!stop&&tick<1800;tick++){
  try{const targets=await(await fetch('http://127.0.0.1:9223/json/list',{signal:AbortSignal.timeout(3000)})).json();for(const t of targets.filter(t=>t.type==='service_worker'||t.type==='page'&&/^http:\/\/localhost:3001\//.test(t.url)))if(!sockets.has(t.id))await connect(t).catch(()=>{});}catch{if(result.connections.at(-1)?.kind!=='bridge-unavailable')result.connections.push({kind:'bridge-unavailable',time:Date.now()});}
  if(tick%5===0){
   for(const [target,c] of sockets){
    const expression=c.type==='page'?`(()=>{const h=document.getElementById('temby-companion'),p=globalThis.__uv?.meta?.url?.pathname;return {visible:document.visibilityState==='visible',pageKind:p==='/shopping_cart.html'?'cart':/verification|captcha|login/.test(p||'')?'authentication':'shopping',companion:!!h,amount:h?.shadowRoot?.getElementById('badge')?.textContent,count:h?.shadowRoot?.getElementById('count')?.textContent,issue:h?.getAttribute('data-cart-issue'),pending:h?.getAttribute('data-updating')};})()`:`({mobileMutationFix:typeof self.__tembyCart?.mutationURL==='function',pendingReads:typeof cartReadFlights!=='undefined'?cartReadFlights.size:null})`;
    await c.send('Runtime.evaluate',{expression,returnByValue:true}).then(r=>{if(r.result?.value&&result.snapshots.length<2000)result.snapshots.push({target,time:Date.now(),...r.result.value});}).catch(()=>{});
   }await save();
  }
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
}finally{for(const c of sockets.values())c.socket.close();result.finishedAt=new Date().toISOString();await save();console.log('Saved '+name);}
