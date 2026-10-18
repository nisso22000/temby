// Companion release v26: local inbox bridge and final packaged companion helpers.
importScripts('/uv/request.js','/uv/bundle.js','/uv/config.js','/uv/worker.js');
const engine=new UVServiceWorker();
self.__tembyRelaySignals=new WeakMap();
self.__tembyRelayCookieContexts=new WeakMap();
const workerContexts=self.__tembyWorkerContexts(location.origin);
let pendingContexts=Promise.resolve();
const contextKey=value=>location.origin+'/_worker-context/'+encodeURIComponent(value);
const resolveContext=async value=>{
  const known=workerContexts.resolve(value);if(known)return known;
  try{
    const blob=new URL(value);if(blob.protocol!=='blob:'||blob.origin!==location.origin)return null;
    // Service workers can be terminated between requests. Keep bounded context
    // metadata so an existing child worker survives a normal worker restart.
    const cache=await caches.open('temby-worker-context-v1');
    const saved=await cache.match(contextKey(value));if(!saved)return null;
    const entry=await saved.json();
    if(workerContexts.register(entry.owner,value,entry.time))return workerContexts.resolve(value);
    await cache.delete(contextKey(value));
  }catch{}
  return null;
};
const registerContext=async(source,value)=>{
  const owner=await resolveContext(source);
  if(!owner||!workerContexts.register(owner,value))return;
  try{
    const cache=await caches.open('temby-worker-context-v1');
    const keys=await cache.keys();
    for(const key of keys.slice(0,Math.max(0,keys.length-127)))await cache.delete(key);
    await cache.put(contextKey(value),new Response(JSON.stringify({owner,time:Date.now()}),{headers:{'content-type':'application/json'}}));
  }catch{}
};
let inlineHelpers;
const getHelpers=()=>inlineHelpers||=(async()=>{
  const entries=await Promise.all(['/uv/bundle.js','/uv/client.js','/uv/config.js','/uv/handler.js'].map(async path=>{
    const response=await fetch(path);if(!response.ok)throw new Error('Local helper unavailable');
    const code=(await response.text()).replace(/^[ \t]*\/\/[#@]\s*sourceMappingURL=.*(?:\r?\n|$)/gm,'');
    return [path,code];
  }));
  self.__tembyInlineHelpers=Object.fromEntries(entries);
})().catch(error=>{inlineHelpers=undefined;throw error;});
engine.on('request',event=>{
  event.data.headers['x-temby-request-destination']=event.data.request.destination||'empty';
  self.__tembyRelaySignals.set(event.data.headers,event.data.request.signal);
  self.__tembyRelayCookieContexts.set(event.data.headers,event.data.ultraviolet);
});
let pendingCookies=Promise.resolve();
self.__tembyApplyResponseCookies=(uv,cookies)=>{
  pendingCookies=pendingCookies.catch(()=>{}).then(async()=>{
    const db=await uv.cookie.db();await uv.cookie.setCookies(cookies,db,uv.meta);
    uv.__tembyResponseCookieString=uv.cookie.serialize((await uv.cookie.getCookies(db))||[],uv.meta,true);
    uv.__tembyResponseCookiesCommitted=true;
    // Notify other tabs only after the committed state is available.
    try{for(const client of await self.clients.matchAll())client.postMessage({msg:'updateCookies',url:uv.meta.url.href});}catch{}
  });
  return pendingCookies;
};
self.addEventListener('message',event=>{
  if(event.data?.tembyMail){
    const port=event.ports?.[0];if(!port)return;
    event.waitUntil((async()=>{
      try{
        const source=event.source?.id?await self.clients.get(event.source.id):null;
        const prefix=location.origin+'/uv-service/';
        if(!source?.url.startsWith(prefix)||!['GET','POST'].includes(event.data.tembyMail))throw Error('Invalid companion client');
        const target=new URL(decodeURIComponent(source.url.slice(prefix.length)));
        if(target.protocol!=='https:'||!/(^|\.)temu\.com$/.test(target.hostname))throw Error('Invalid companion client');
        const response=await fetch('/_companion/mail',{method:event.data.tembyMail,credentials:'same-origin',headers:{'x-temby-companion':'1'}});
        const data=await response.json();port.postMessage(response.ok?{ok:true,data}:{ok:false,error:data.error});
      }catch{port.postMessage({ok:false,error:'Local inbox connection failed. Reopen localhost:3000 and try again.'});}
      finally{port.close();}
    })());return;
  }
  if(event.data?.tembyWorkerContext){
    pendingContexts=pendingContexts.catch(()=>{}).then(async()=>{
      const source=event.source?.id?await self.clients.get(event.source.id):null;
      if(source)await registerContext(source.url,event.data.tembyWorkerContext.url);
    });
    event.waitUntil(pendingContexts);return;
  }
  const entry=event.data?.tembyCookieWrite;
  if(!entry||typeof entry.cookie!=='string'||entry.cookie.length>16384||/httponly/i.test(entry.cookie))return;
  try{
    const url=new URL(entry.url);
    if(url.protocol!=='https:'||!(['fixture.temby.invalid','temu.com','kwcdn.com'].includes(url.hostname)||url.hostname.endsWith('.temu.com')||url.hostname.endsWith('.kwcdn.com')))return;
    pendingCookies=pendingCookies.catch(()=>{}).then(async()=>{
      const uv=new Ultraviolet(__uv$config);uv.meta={url,base:url,origin:location.origin};
      await uv.cookie.setCookies(entry.cookie,await uv.cookie.db(),uv.meta);
    });
    event.waitUntil(pendingCookies);
  }catch{}
});
engine.on('beforemod',event=>{
  // The transport already awaited this write; suppress UV's fire-and-forget
  // duplicate, which otherwise races newer cookie updates.
  if(event.data.ultraviolet?.__tembyResponseCookiesCommitted)delete event.data.headers['set-cookie'];
  if(event.data.request.request.integrity||event.data.request.request.destination==='style'||event.data.request.url.href==='https://fixture.temby.invalid/native-navigation.js'){
    const raw=event.data.raw;
    event.respondWith(new Response(raw.body,{status:raw.status,statusText:raw.statusText,headers:raw.headers}));return;
  }
  event.savedPolicies=Object.entries(event.data.headers).filter(([key])=>/^(content-security-policy(?:-report-only)?|x-frame-options|permissions-policy|cross-origin-(embedder|opener|resource)-policy)$/i.test(key));
});
engine.on('response',event=>{for(const [key,value]of event.savedPolicies||[])event.data.headers[key]=value;});
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(!engine.route(event)){
    const original=event.request;
    if(new URL(original.url).origin===location.origin||original.mode==='navigate')return;
    event.respondWith((async()=>{
      const client=event.clientId?await self.clients.get(event.clientId):null;
      await pendingContexts.catch(()=>{});
      const context=client&&await resolveContext(client.url);
      if(!context)return new Response('Local proxy could not resolve the requesting worker or frame context',{status:502});
      // The browser can reduce a cross-origin request's referrer to localhost/
      // before this event. Restore the actual controlled client's URL so UV
      // can map its virtual Origin/Referer instead of losing that context.
      const mapped=await self.__tembyMapRequest(original,location.origin+'/uv-service/'+encodeURIComponent(original.url),context);
      await pendingCookies.catch(()=>{});await getHelpers();return engine.fetch({request:mapped});
    })());return;
  }
  if(['sharedworker','serviceworker'].includes(event.request.destination)){
    event.waitUntil(fetch('/_runtime',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({phase:'worker-blocked'})}).catch(()=>{}));
    event.respondWith(Promise.resolve(new Response('Merchant workers unsupported',{status:403})));return;
  }
  event.respondWith(pendingCookies.catch(()=>{}).then(()=>getHelpers()).then(()=>engine.fetch(event)));
});
