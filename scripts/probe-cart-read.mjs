// One authorized read-only cart document request, through the ordinary proxy.
// No navigation, iframe, login, challenge handling or cart mutation.
let tabs=await(await fetch('http://127.0.0.1:9223/json/list')).json();
let tab=tabs.find(t=>t.type==='service_worker'&&t.url.includes('localhost:3001/uv/sw.js'));
if(!tab){
 const page=tabs.find(t=>t.type==='page'&&t.url.includes('localhost:3001/uv-service/'));if(!page)throw Error('No proxy page');
 const wake=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{wake.onopen=r;wake.onerror=j;});
 const start=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker start timeout')),10000);wake.onmessage=e=>{const v=JSON.parse(e.data);if(v.id===0){wake.send(JSON.stringify({id:1,method:'ServiceWorker.startWorker',params:{scopeURL:'http://localhost:3001/uv-service/'}}));}if(v.id===1){clearTimeout(timer);v.error?reject(Error(v.error.message)):resolve();}};});
 wake.send(JSON.stringify({id:0,method:'ServiceWorker.enable',params:{}}));try{await start;}finally{wake.close();}
 tabs=await(await fetch('http://127.0.0.1:9223/json/list')).json();tab=tabs.find(t=>t.type==='service_worker'&&t.url.includes('localhost:3001/uv/sw.js'));
}
if(!tab)throw Error('No active proxy worker');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();
socket.onmessage=e=>{const v=JSON.parse(e.data),p=pending.get(v.id);if(!p)return;clearTimeout(p.timer);pending.delete(v.id);v.error?p.reject(Error(v.error.message)):p.resolve(v.result);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Debugger timeout'));},30000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});
try{
 if(process.argv.includes('--api')){
  const result=await send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{const windows=await self.clients.matchAll({type:'window'});const client=windows.find(c=>{try{return new URL(decodeURIComponent(new URL(c.url).pathname.slice(12))).pathname==='/';}catch{return false;}})||windows[0];if(!client)return {error:'No existing client'};await pendingCookies;const address='https://www.temu.com/api/bg/bg-uranus-api/uranus_cart/cart_modify_page';const target=location.origin+'/uv-service/'+encodeURIComponent(address);const response=await engine.fetch({request:new Request(target,{method:'POST',referrer:client.url,headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({api_version:1,cart_modify_type:1,cart_scene:0,extra_config:{req_read_flag:2}})})});const value=await response.json();const facts=self.__tembyCart.responseFacts(value,Date.now());return {status:response.status,success:value?.success,errorCode:value?.error_code??value?.errorCode,accepted:!!facts,totalMinor:facts?.carts[0].minor,currency:facts?.carts[0].currency,items:facts?.carts[0].items.length,keys:Object.keys(value||{}).filter(k=>/^[a-zA-Z_]{1,40}$/.test(k)),resultKeys:value?.result&&typeof value.result==='object'?Object.keys(value.result).filter(k=>/^[a-zA-Z_]{1,40}$/.test(k)):[]};})()`});
  console.log(JSON.stringify(result.result?.value||{error:result.exceptionDetails?.exception?.description?.slice(0,250)||'No result'},null,2));
 }else{
 const result=await send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{const windows=await self.clients.matchAll({type:'window'});const client=windows.find(c=>{try{return new URL(decodeURIComponent(new URL(c.url).pathname.slice(12))).pathname==='/';}catch{return false;}})||windows[0];if(!client)return {error:'No existing client'};await pendingCookies;await getHelpers();const target=location.origin+'/uv-service/'+encodeURIComponent('https://www.temu.com/shopping_cart.html');const response=await engine.fetch({request:new Request(target,{method:'GET',referrer:client.url,headers:{accept:'text/html'},credentials:'same-origin'})});const text=await response.text();const facts=self.__tembyCart.documentFacts(text,Date.now());return {status:response.status,accepted:!!facts,totalMinor:facts?.carts[0].minor,currency:facts?.carts[0].currency,items:facts?.carts[0].items.length,loginDocument:/window\\.rawData\\s*=/.test(text)&&!facts,bytes:text.length,type:response.headers.get('content-type'),localBoundary:/Temby proxy boundary|Proxy startup|browser did not route/i.test(text),uvError:/Ultraviolet Error|Error code|Failed to fetch/i.test(text),hasRawData:/rawData/.test(text),hasLogin:/login.html|sign in|connexion/i.test(text),hasCart:/shopping_cart|cartListInfo/.test(text)};})()`});
 console.log(JSON.stringify(result.result?.value||{error:result.exceptionDetails?.exception?.description?.slice(0,250)||'No result'},null,2));
 }
}finally{socket.close();}


