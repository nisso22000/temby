// One read-only full-cart request using the existing mobile page's own client.
// No navigation, cart mutation, token extraction, login or challenge automation.
import {mkdir,writeFile} from 'node:fs/promises';
const tabs=await(await fetch('http://127.0.0.1:9223/json/list',{signal:AbortSignal.timeout(4000)})).json();
const pages=tabs.filter(t=>{try{return t.type==='page'&&new URL(t.url).origin==='http://localhost:3001'&&['/','/dz-fr','/dz-fr/'].includes(new URL(decodeURIComponent(new URL(t.url).pathname.slice(12))).pathname);}catch{return false;}});
if(!pages.length)throw Error('No existing mobile homepage; no navigation performed');
const tab=pages[0],s=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{s.onopen=r;s.onerror=j;});
const expression=`(async()=>{
 const root=globalThis.__INITIAL_PROPS__?.stores?.store,service=root?.$service;
 if(typeof service?.postRisk!=='function')return {clientAvailable:false};
 const startedAt=Date.now();
 try{
  const value=await service.postRisk({url:'/api/bg/bg-uranus-api/uranus_cart/cart_modify_page',params:{api_version:1,cart_modify_type:1,cart_scene:0,extra_config:{req_read_flag:2}},config:{timeout:15000,useRiskDialog:false}});
  const facts=globalThis.__tembyCart.responseFacts(value,startedAt),cart=facts?.carts?.[0];
  return {clientAvailable:true,clientPath:'__INITIAL_PROPS__.stores.store.$service.postRisk',durationMs:Date.now()-startedAt,success:typeof value?.success==='boolean'?value.success:null,errorCode:Number.isSafeInteger(value?.errorCode??value?.error_code)?value.errorCode??value.error_code:null,accepted:!!cart,cart:cart?{totalMinor:cart.minor,currency:cart.currency,lines:cart.items.length,selectedUnits:cart.items.filter(i=>i.selection).reduce((n,i)=>n+i.quantity,0)}:null};
 }catch{return {clientAvailable:true,failed:true,durationMs:Date.now()-startedAt};}
})()`;
try{
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('SDK read timed out; no retry')),20000);s.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1){clearTimeout(timer);resolve(m.result?.result?.value||{runtimeError:true});}};s.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
 const out=new URL('../artifacts/mobile-session-investigation/',import.meta.url);await mkdir(out,{recursive:true});const report={capturedAt:new Date().toISOString(),scope:'One normal-render full-cart read from an existing mobile homepage through its own merchant client. No cart changes or raw payloads retained.',result};await writeFile(new URL('homepage-sdk-cart-read-'+Date.now()+'.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{s.close();}
