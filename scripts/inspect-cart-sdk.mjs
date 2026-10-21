// Inspect already-loaded public code. No merchant requests or UI interaction.
const tabs=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const tab=tabs.find(t=>t.type==='page'&&/^http:\/\/localhost:3001\/uv-service\//.test(t.url));if(!tab)throw Error('No proxy tab');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map(),scripts=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Debugger timeout'));},8000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});
socket.onmessage=e=>{const v=JSON.parse(e.data);if(v.method==='Debugger.scriptParsed'){try{let u=new URL(v.params.url);if(u.pathname.startsWith('/uv-service/'))u=new URL(decodeURIComponent(u.pathname.slice(12)));if(/(^|\.)kwcdn\.com$/.test(u.hostname)&&v.params.length<3*1024*1024)scripts.push(v.params.scriptId);}catch{}}const p=pending.get(v.id);if(!p)return;clearTimeout(p.timer);pending.delete(v.id);v.error?p.reject(Error(v.error.message)):p.resolve(v.result);};
try{
 await send('Debugger.setSkipAllPauses',{skip:true});await send('Debugger.enable');
 let count=0;
 for(const scriptId of scripts.slice(0,100)){
  const {scriptSource}=await send('Debugger.getScriptSource',{scriptId});
  for(const term of (process.argv.slice(2).length?process.argv.slice(2):['NORMAL_RENDER:','FullSkuData:','NORMAL_RENDER=','FullSkuData=','req_read_flag','cart_modify_type:'])){
   let p=0,found=0;while((p=scriptSource.indexOf(term,p))>=0&&found++<3&&count++<25){console.log(JSON.stringify({term,snippet:scriptSource.slice(Math.max(0,p-260),p+550)}));p+=term.length;}
  }
 }
}finally{await send('Debugger.disable').catch(()=>{});socket.close();}

