// Read cached cart data shapes only. No requests, navigation or user data values.
import {mkdir,writeFile} from 'node:fs/promises';
const tabs=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const tab=tabs.find(t=>t.type==='page'&&/^http:\/\/localhost:3001\/uv-service\//.test(t.url));
if(!tab)throw Error('No proxy tab');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
let sequence=0;const pending=new Map();
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Debugger timeout'));},8000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
socket.onmessage=e=>{const v=JSON.parse(e.data),p=pending.get(v.id);if(!p)return;clearTimeout(p.timer);pending.delete(v.id);v.error?p.reject(Error(v.error.message)):p.resolve(v.result);};
try{
 if(process.argv.includes('--stop-passive-capture')){
  const tree=await send('Page.getFrameTree');
  const world=await send('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:'temby-passive-action'});
  await send('Runtime.evaluate',{expression:'globalThis.__tembyPassiveCleanup?.()',contextId:world.executionContextId});
  await send('Runtime.removeBinding',{name:'__tembyPassiveAction'}).catch(()=>{});
  console.log('Temporary passive listeners removed from the current page.');
 }
 const value=await send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
 const keys=o=>o&&typeof o==='object'?Object.keys(o).filter(k=>!/^__uv/.test(k)&&/^[a-zA-Z_$][a-zA-Z0-9_$]{0,60}$/.test(k)).slice(0,60):[];
 const candidates=Object.keys(globalThis).filter(k=>/rawData|initial|redux|store|cart|state|pageData/i.test(k)&&!/^__uv|temby/i.test(k));
 const shapes=candidates.map(key=>{const d=Object.getOwnPropertyDescriptor(globalThis,key);return {key,type:typeof d?.value,keys:keys(d?.value)};});
 const embedded=[...document.scripts].filter(s=>!s.src).map(s=>({type:s.type,length:s.textContent.length,hasCartList:s.textContent.includes('cartListInfo'),hasGoodsList:s.textContent.includes('goodsSkuList'),hasOrderAmount:s.textContent.includes('orderAmount')}));
 const paths=[];let nodes=0;const seen=new WeakSet();const walk=(o,path,depth)=>{if(!o||typeof o!=='object'||depth>5||++nodes>3000||seen.has(o))return;seen.add(o);if(Object.hasOwn(o,'cartListInfo')||Object.hasOwn(o,'goodsSkuList')||Object.hasOwn(o,'orderAmount'))paths.push({path,keys:keys(o)});for(const k of keys(o)){if(/token|cookie|password|user|account/i.test(k))continue;const d=Object.getOwnPropertyDescriptor(o,k);if(d&&Object.hasOwn(d,'value'))walk(d.value,path+'.'+k,depth+1);}};
 for(const key of candidates){const d=Object.getOwnPropertyDescriptor(globalThis,key);if(d&&Object.hasOwn(d,'value'))walk(d.value,key,0);}
 const host=document.getElementById('temby-companion');const bounds=host?.getBoundingClientRect();
 const fixedBottom=[...document.querySelectorAll('body *')].filter(e=>e!==host&&getComputedStyle(e).position==='fixed').map(e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,width:b.width,height:b.height};}).filter(b=>b.height>0&&b.width>innerWidth/2&&b.bottom>=innerHeight-2&&b.top>innerHeight/2).slice(0,12);
 return {shapes,embedded,cartPaths:paths,viewport:{width:innerWidth,height:innerHeight},fixedBottom,companionBounds:bounds?{top:bounds.top,bottom:bounds.bottom,left:bounds.left,right:bounds.right}:null};})()`});
 const result=value.result?.value||{evaluationFailed:true};const out=new URL('../artifacts/mobile-session-investigation/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('mobile-cart-shapes.json',out),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{socket.close();}
