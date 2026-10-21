// Update local proxy code only. No page navigation, cache clearing or cart calls.
const targets=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const target=targets.find(t=>t.type==='page'&&t.url.startsWith('http://localhost:3001/uv-service/'));if(!target)throw Error('No proxy page');
const s=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{s.onopen=r;s.onerror=j;});let id=0;const pending=new Map();
s.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('Debugger timeout')),15000);pending.set(n,{resolve,reject,timer});s.send(JSON.stringify({id:n,method,params}));});
try{await send('ServiceWorker.enable');await send('ServiceWorker.updateRegistration',{scopeURL:'http://localhost:3001/uv-service/'});await send('ServiceWorker.startWorker',{scopeURL:'http://localhost:3001/uv-service/'});console.log('Requested local worker update; page, merchant cookies and cart unchanged.');}finally{s.close();}
