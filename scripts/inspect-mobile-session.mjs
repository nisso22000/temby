// Read-only session inspection and short passive network capture. No merchant
// navigation, input, requests, challenge interaction or storage edits.
import {mkdir,writeFile} from 'node:fs/promises';
const tabs=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const targets=tabs.filter(t=>t.type==='page'&&/^http:\/\/localhost:3001\/uv-service\//.test(t.url));
const result={capturedAt:new Date().toISOString(),scope:'Physical Samsung, read-only current tabs and passive network capture; no merchant interaction',tabs:[]};
function address(value){try{let u=new URL(value);if(u.pathname.startsWith('/uv-service/'))u=new URL(decodeURIComponent(u.pathname.slice(12)));return {host:u.hostname,route:u.pathname.startsWith('/api/')?u.pathname.split('/').map(p=>/^[a-z_-]{1,40}$/i.test(p)?p:p?'[value]':'').join('/'):/^\/(?:login|shopping_cart|index|bgt_order_checkout)\.html$/.test(u.pathname)||u.pathname==='/'?u.pathname:'[resource]'};}catch{return {host:'invalid'};}}
for(const target of targets){
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 let sequence=0;const pending=new Map();const network=[];
 socket.onmessage=event=>{
  const item=JSON.parse(event.data);
  if(item.id){const slot=pending.get(item.id);if(!slot)return;clearTimeout(slot.timer);pending.delete(item.id);item.error?slot.reject(Error(item.error.message)):slot.resolve(item.result);return;}
  if(item.method==='Network.responseReceived'){
   const response=item.params.response,info=address(response.url);
   if(network.length<150&&(info.route.startsWith('/api/')||response.status>=400))network.push({...info,status:response.status,fromWorker:response.fromServiceWorker===true,type:item.params.type,observedAt:new Date().toISOString()});
  }
 };
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Debugger timeout: '+method));},8000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 const snapshot={location:address(target.url),network};
 try{
  const page=await send('Runtime.evaluate',{expression:`JSON.stringify((()=>{const host=document.getElementById('temby-companion');return {visibility:document.visibilityState,cartTraceAvailable:typeof globalThis.__tembyCart?.trace==='function',pageReaderPresent:typeof globalThis.__tembyPageReader==='function',companion:!!host,source:host?.getAttribute('data-price-source'),issue:host?.getAttribute('data-cart-issue'),cache:host?.getAttribute('data-cart-cache'),emailFormVisible:[...document.querySelectorAll('input[type=email],input[autocomplete=email]')].some(e=>e.getClientRects().length),humanVerificationVisible:/verify you are human|complete the puzzle|security verification|التحقق من أنك|التحقق الأمني/i.test(document.body?.innerText||''),navigationStartedAt:new Date(performance.timeOrigin).toISOString(),resources:performance.getEntriesByType('resource').filter(e=>e.name.includes('/api/')).slice(-40).map(e=>({path:new URL(e.name).pathname.split('/').map(p=>/^[a-z_-]{1,40}$/i.test(p)?p:p?'[value]':'').join('/'),startMs:Math.round(e.startTime),durationMs:Math.round(e.duration),status:e.responseStatus,type:e.initiatorType}))};})())`,returnByValue:true});
  if(page.result?.value)snapshot.page=JSON.parse(page.result.value);
  const frames=await send('Page.getFrameTree');const world=await send('Page.createIsolatedWorld',{frameId:frames.frameTree.frame.id,worldName:'temby-readonly-session-inspection'});
  const native=await send('Runtime.evaluate',{contextId:world.executionContextId,expression:`(async()=>{const dbs=await Promise.race([indexedDB.databases(),new Promise(resolve=>setTimeout(()=>resolve(null),1500))]);const registration=await navigator.serviceWorker.getRegistration();return {databaseNames:dbs?.map(d=>d.name).filter(n=>/scdb|uv/i.test(n)),databaseEnumerationTimedOut:dbs===null,workerRevision:/[?&]v=(\\d+)/.exec(registration?.active?.scriptURL||'')?.[1],workerState:registration?.active?.state};})()`,awaitPromise:true,returnByValue:true});
  if(native.result?.value)snapshot.native=native.result.value;
  // Cookie values are used only to read this session's local diagnostics.
  // Never persist or print them, and never send them to a merchant.
  const cookieResult=await send('Network.getCookies',{urls:['http://localhost:3001/']});
  const sid=cookieResult.cookies.find(c=>c.name==='temby_sid');snapshot.hasLocalSession=!!sid;
  if(sid){
   const headers={cookie:'temby_sid='+sid.value};
   const [state,health,metrics]=await Promise.all(['/api/state','/api/health','/api/metrics'].map(async path=>(await fetch('http://localhost:3000'+path,{headers})).json()));
   snapshot.localDiagnostics={counts:metrics.counts,health:health.failures,apiTimeline:state.apiEvents||[],recentApiEvents:state.events.filter(e=>e.route||e.status>=400).slice(-40)};
  }
  if(snapshot.page?.visibility==='visible'&&!process.argv.includes('--snapshot-only')){
   await send('Network.enable');await new Promise(resolve=>setTimeout(resolve,15000));await send('Network.disable');
  }
 }catch(error){snapshot.inspectionError=error.message;}
 finally{socket.close();}
 result.tabs.push(snapshot);
}
const out=new URL('../artifacts/mobile-session-investigation/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL(process.argv.includes('--snapshot-only')?'phone-session-after-action.json':'phone-session.json',out),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
