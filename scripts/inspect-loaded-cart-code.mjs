// Inspect cached public CDN script source through CDP. No merchant requests,
// source edits, navigation or interaction; raw script bodies are not saved.
import {mkdir,writeFile} from 'node:fs/promises';
const targets=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const result={scope:'Read-only cached public-script endpoint discovery and safe cart console history',targets:[]};
function decoded(value){try{let u=new URL(value);if(u.pathname.startsWith('/uv-service/'))u=new URL(decodeURIComponent(u.pathname.slice(12)));return u;}catch{return null;}}
for(const target of targets.filter(t=>['page','service_worker'].includes(t.type)&&(t.type==='service_worker'||/^http:\/\/localhost:3001\/uv-service\//.test(t.url)))){
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map(),scripts=[];const traces=[],exceptions=[];
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Debugger timeout: '+method));},8000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});
 socket.onmessage=event=>{const e=JSON.parse(event.data);if(e.id){const p=pending.get(e.id);if(!p)return;clearTimeout(p.timer);pending.delete(e.id);e.error?p.reject(Error(e.error.message)):p.resolve(e.result);return;}
  if(e.method==='Runtime.exceptionThrown'){
   const d=e.params.exceptionDetails,message=d.exception?.description||d.text||'';
   const category=/__uv.*(?:not defined|not a function)/i.test(message)?'uv-helper':/Blocked a frame|cross-origin frame|SecurityError.*frame/i.test(message)?'frame-access':/postMessage.*(?:origin|Window)/i.test(message)?'postmessage-origin':/Illegal invocation/i.test(message)?'illegal-invocation':/Failed to fetch|NetworkError|net::ERR/i.test(message)?'network':'other-js-exception';
   if(exceptions.length<100)exceptions.push({category,name:d.exception?.className,line:d.lineNumber,column:d.columnNumber});
  }
  if(e.method==='Debugger.scriptParsed'){const u=decoded(e.params.url);if(u&&/(^|\.)kwcdn\.com$/.test(u.hostname)&&e.params.length<2*1024*1024)scripts.push(e.params.scriptId);}
  if(e.method==='Runtime.consoleAPICalled'&&e.params.args?.[0]?.value==='[TEMBY cart]'){
   const object=e.params.args[1];if(!object?.objectId)return;
   void send('Runtime.getProperties',{objectId:object.objectId,ownProperties:true}).then(properties=>{
    const safe={};for(const p of properties.result)if(['phase','route','source','reason','method','transport','status','time','requestStartedAt','durationMs','totalMinor','currency','items','selectedUnits','invalidLines'].includes(p.name)&&['string','number','boolean'].includes(p.value?.type))safe[p.name]=p.value.value;
    if(traces.length<60)traces.push(safe);
   }).catch(()=>{});
  }
 };
 const entry={type:target.type,scannedScripts:0,endpoints:[],traces,exceptions};const endpoints=new Set();
 try{
  await send('Runtime.enable');
  if(target.type==='service_worker'){
   const value=await send('Runtime.evaluate',{expression:`({mobileMutationFix:typeof self.__tembyCart?.mutationURL==='function',cartIdentityFix:!!self.__tembyCartState?.scope?.toString().includes('Verification/CSRF'),recognizedCartResponses:typeof lastCartSequence!=='undefined'?lastCartSequence.size:null,counts:self.__tembyResourceCounts,options:self.__tembyResourceOptions})`,returnByValue:true});entry.worker=value.result?.value;
  }else{
   const tree=await send('Page.getFrameTree');entry.frames=[];const walk=node=>{const u=decoded(node.frame.url);entry.frames.push({host:u?.hostname||'opaque',isMain:!node.frame.parentId,isProduct:!!u&&/goods/.test(u.pathname),isVerification:!!u&&/verification|captcha/.test(u.pathname)});for(const c of node.childFrames||[])walk(c);};walk(tree.frameTree);
   await send('Debugger.setSkipAllPauses',{skip:true});await send('Debugger.enable');
   for(const scriptId of scripts.slice(0,90)){
    const source=await send('Debugger.getScriptSource',{scriptId});entry.scannedScripts++;
    for(const match of source.scriptSource.matchAll(/["'`]((?:https:\/\/[^/"'`\s]+)?\/[a-z_\/-]{2,180})["'`]/gi)){
     if(/cart|\/sku(?:\/|$)|uranus/i.test(match[1]))endpoints.add(match[1]);
    }
   }
  }
 }catch(e){entry.error=e.message;}
 finally{await send('Debugger.disable').catch(()=>{});socket.close();}
 entry.endpoints=[...endpoints].slice(0,100);result.targets.push(entry);
}
const out=new URL('../artifacts/mobile-session-investigation/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('loaded-cart-code.json',out),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
