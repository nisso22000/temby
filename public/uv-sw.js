// Validated cart responses, account-scoped local state and bounded initial reads.
importScripts('/uv/request.js','/uv/bundle.js','/uv/config.js','/uv/worker.js');
const engine=new UVServiceWorker();
const lastCartSequence=new Map();
const lastCartPublishedSequence=new Map();
const lastCartMutationSequence=new Map();
const lastCartMutationCompletedAt=new Map();
const countRefreshSignals=new Map();
const cartState=self.__tembyCartState?.create(self.indexedDB);
self.__tembyCartScope=async value=>{
  try{
    const url=new URL(value),uv=new Ultraviolet(__uv$config);uv.meta={url,base:url,origin:location.origin};
    await pendingCookies.catch(()=>{});
    const cookies=uv.cookie.serialize((await uv.cookie.getCookies(await uv.cookie.db()))||[],uv.meta,false);
    return await self.__tembyCartState.scope(cookies,self.crypto);
  }catch{return null;}
};
self.__tembyPublishCartTrace=async(url,phase,details={})=>{
  if(!self.__tembyCart.responseURL(url))return;
  const merchantOrigin=new URL(url).origin;
  const safe=self.__tembyCart.trace(self,phase,{...details,route:new URL(url).pathname});
  for(const client of await self.clients.matchAll({type:'window'})){
    try{const address=new URL(client.url);if(address.origin!==location.origin||!address.pathname.startsWith('/uv-service/'))continue;
      if(new URL(decodeURIComponent(address.pathname.slice('/uv-service/'.length))).origin===merchantOrigin)client.postMessage({tembyCartTrace:safe});
    }catch{}
  }
};
async function requestCartRefresh(merchantOrigin,time){
  for(const client of await self.clients.matchAll({type:'window'})){
    try{const address=new URL(client.url);if(address.origin===location.origin&&address.pathname.startsWith('/uv-service/')&&new URL(decodeURIComponent(address.pathname.slice(12))).origin===merchantOrigin)client.postMessage({tembyCartNeedsRead:{time}});}catch{}
  }
}
self.__tembyObserveCartResponse=async(url,response,sequence,startedAt=Date.now(),requestScope,cartOperation)=>{
  if(!self.__tembyCart.responseURL(url)){void response.body?.cancel().catch(()=>{});return;}
  const merchantOrigin=new URL(url).origin;
  const scope=requestScope===undefined?await self.__tembyCartScope(url):requestScope;
  const publish=async(data,mutation=false)=>{
    const discarded=reason=>self.__tembyPublishCartTrace(url,'discarded',{source:'response',reason,requestStartedAt:startedAt});
    const sequenceKey=merchantOrigin+'|'+(scope||'');
    if(data.tembyCartUpdate&&mutation){
      if(sequence<(lastCartMutationSequence.get(sequenceKey)||0)){await discarded('newer-cart-edit-already-published');return;}
    }else if(sequence<(lastCartSequence.get(sequenceKey)||0)||data.tembyCartUpdate&&startedAt<=(lastCartMutationCompletedAt.get(sequenceKey)||0)){
      await discarded('newer-response-already-published');return;
    }
    const completedAt=Date.now();
    if(data.tembyCartUpdate&&scope&&cartState){
      if(scope!==await self.__tembyCartScope(url)){await discarded('identity-changed-during-request');return;}
      if(!await cartState.put(merchantOrigin,scope,{data,startedAt:completedAt,requestStartedAt:startedAt})){await discarded('snapshot-store-rejected-order');return;}
    }
    lastCartSequence.set(sequenceKey,Math.max(sequence,lastCartSequence.get(sequenceKey)||0));
    if(data.tembyCartUpdate)lastCartPublishedSequence.set(sequenceKey,Math.max(sequence,lastCartPublishedSequence.get(sequenceKey)||0));
    if(data.tembyCartUpdate&&mutation){lastCartMutationSequence.set(sequenceKey,sequence);lastCartMutationCompletedAt.set(sequenceKey,completedAt);}
    if(data.tembyCartStatus&&scope&&cartState)await cartState.problem(merchantOrigin,scope,data.tembyCartStatus);
    if(data.tembyCartUpdate)await self.__tembyPublishCartTrace(url,'published',{source:'response',requestStartedAt:startedAt,totalMinor:data.tembyCartUpdate.carts[0]?.minor});
    for(const client of await self.clients.matchAll({type:'window'})){
      try{const address=new URL(client.url);if(address.origin!==location.origin||!address.pathname.startsWith('/uv-service/'))continue;
        const merchant=new URL(decodeURIComponent(address.pathname.slice('/uv-service/'.length)));
        if(merchant.origin===merchantOrigin)client.postMessage(data);
      }catch{}
    }
  };
  const problem=async reason=>{
    const snapshot=self.__tembyCart.snapshotURL(url);
    await self.__tembyPublishCartTrace(url,snapshot?'rejected':'observed-without-snapshot',{source:'response',reason,status:response.status,requestStartedAt:startedAt,durationMs:Date.now()-startedAt});
    // A count-only response or an unrelated cart operation acknowledgement
    // cannot supersede an in-flight full snapshot or declare it broken.
    if(snapshot){const changedAt=cartReadFlights.get(merchantOrigin+'|'+scope)?.requiredAfter||0;return publish({tembyCartStatus:{reason,status:response.status,time:startedAt,changedAt}});}
  };
  if(!response.ok){void response.body?.cancel().catch(()=>{});await problem('http-error');return;}
  if(!response.headers.get('content-type')?.includes('json')){void response.body?.cancel().catch(()=>{});await problem('unsupported-content');return;}
  const reader=response.body?.getReader();if(!reader){await problem('missing-body');return;}
  const chunks=[];let bytes=0;
  try{
    for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>2*1024*1024){await problem('too-large');return;}chunks.push(next.value);}
    const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
    const text=new TextDecoder().decode(joined);
    const value=JSON.parse(text);
    if(self.__tembyCart.countURL(url)){
      const count=self.__tembyCart.countFacts(value);
      if(count&&scope&&cartState){
        const saved=await cartState.get(merchantOrigin,scope);
        const cart=saved&&startedAt>=saved.startedAt?self.__tembyCart.select(saved.data.tembyCartUpdate.carts,Date.now()):null;
        if(cart&&self.__tembyCart.countMatches(cart,count)===false){
          const key=merchantOrigin+'|'+scope,signature=JSON.stringify(count.lines),previous=countRefreshSignals.get(key);
          if(previous?.signature!==signature||startedAt-previous.time>=30000){
            countRefreshSignals.set(key,{signature,time:startedAt});
            if(countRefreshSignals.size>128)countRefreshSignals.delete(countRefreshSignals.keys().next().value);
            await self.__tembyPublishCartTrace(url,'changed',{source:'response',reason:'cart-count-differs-from-snapshot',requestStartedAt:startedAt});
            await requestCartRefresh(merchantOrigin,Date.now());
          }
        }
      }
      return;
    }
    const facts=self.__tembyCart.responseFacts(value,Date.now());
    if(!facts){
      if(self.__tembyCart.mutationAcknowledged(url,value,cartOperation)){
        await self.__tembyPublishCartTrace(url,'changed',{source:'response',reason:'accepted-mutation-needs-snapshot',status:response.status,requestStartedAt:startedAt});
        await requestCartRefresh(merchantOrigin,Date.now());
        return;
      }
      await problem(value?.success===false?'merchant-failure':!value?.result?.cartListInfo&&!value?.result?.cart_list_info?'unsupported-schema':'inconsistent-cart');return;
    }
    const cart=facts.carts[0];
    await self.__tembyPublishCartTrace(url,'response',{source:'response',status:response.status,requestStartedAt:startedAt,durationMs:Date.now()-startedAt,time:cart.time,merchantRequestTime:cart.merchantRequestTime,serverTime:cart.serverTime,totalMinor:cart.minor,currency:cart.currency,items:cart.items.length,invalidLines:cart.invalid});
    await publish({tembyCartUpdate:facts},self.__tembyCart.mutationAcknowledged(url,value,cartOperation));
  }catch{await problem('invalid-json');}finally{void reader.cancel().catch(()=>{});}
};
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
const cartReadFlights=new Map();
function readCartInClient(source){
  return new Promise(resolve=>{
    const channel=new MessageChannel();let finished=false;
    const finish=result=>{if(finished)return;finished=true;clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(result);};
    // A disappearing or unresponsive page must release the shared flight. It
    // may already have sent a request, so a timeout never triggers a duplicate.
    const timer=setTimeout(()=>finish({available:true,accepted:false}),18000);
    channel.port1.onmessage=event=>{
      const result=event.data;
      if(typeof result?.available==='boolean'&&typeof result?.accepted==='boolean')finish({available:result.available,accepted:result.accepted,interrupted:result.interrupted===true});
      else finish({available:true,accepted:false});
    };
    try{source.postMessage({tembyCartClientRead:true},[channel.port2]);}catch{finish({available:false,accepted:false});}
  });
}
async function cartReadState(origin,pending){
  for(const client of await self.clients.matchAll({type:'window'})){
    try{const local=new URL(client.url);if(local.origin===location.origin&&local.pathname.startsWith('/uv-service/')&&new URL(decodeURIComponent(local.pathname.slice(12))).origin===origin)client.postMessage({tembyCartReadState:{pending}});}catch{}
  }
}
async function readCurrentCart(source,changedAt=0,clientRead=false){
  const local=new URL(source.url);if(local.origin!==location.origin||!local.pathname.startsWith('/uv-service/'))return;
  const merchant=new URL(decodeURIComponent(local.pathname.slice(12)));
  if(merchant.protocol!=='https:'||!/(^|\.)temu\.com$/.test(merchant.hostname)||/login|verification|captcha/i.test(merchant.pathname))return;
  const scope=await self.__tembyCartScope(merchant.href),key=merchant.origin+'|'+(scope||source.id);
  const running=cartReadFlights.get(key);if(running){source.postMessage?.({tembyCartReadState:{pending:true}});running.changedAt=Math.max(running.changedAt,changedAt);running.requiredAfter=Math.max(running.requiredAfter,changedAt);running.source=source;running.clientRead=clientRead;return running.promise;}
  if(!changedAt&&scope&&await cartState?.attempted(merchant.origin,scope))return;
  const joined=cartReadFlights.get(key);if(joined){source.postMessage?.({tembyCartReadState:{pending:true}});joined.changedAt=Math.max(joined.changedAt,changedAt);joined.requiredAfter=Math.max(joined.requiredAfter,changedAt);joined.source=source;joined.clientRead=clientRead;return joined.promise;}
  const flight={changedAt,requiredAfter:changedAt,source,clientRead,promise:null};cartReadFlights.set(key,flight);
  flight.promise=(async()=>{
    try{
      await cartReadState(merchant.origin,true);
      let startedAt;
      do{
        startedAt=Date.now();flight.changedAt=0;const requester=flight.source;
        // Temu's own SDK defines NORMAL_RENDER=1 and FullSkuData=2. This is
        // a read, with no item IDs, quantities, selection changes or proof values.
        const url=new URL('/api/bg/bg-uranus-api/uranus_cart/cart_modify_page',merchant.origin);
        const target=location.origin+'/uv-service/'+encodeURIComponent(url.href);
        await pendingCookies.catch(()=>{});await getHelpers();
        if(scope)await cartState?.markAttempt(merchant.origin,scope,startedAt);
        if(flight.clientRead){
          const publishedBefore=lastCartPublishedSequence.get(merchant.origin+'|'+(scope||''))||0;
          const result=await readCartInClient(requester);
          if(result.available){
            const observed=(lastCartPublishedSequence.get(merchant.origin+'|'+(scope||''))||0)>publishedBefore;
            if(!result.accepted||!observed){
              if(result.interrupted&&flight.source.id!==requester.id&&flight.changedAt>startedAt)continue;
              const issue={reason:'client-error',status:0,time:startedAt,changedAt:flight.requiredAfter};
              if(scope)await cartState?.problem(merchant.origin,scope,issue);
              for(const client of await self.clients.matchAll({type:'window'})){
                try{const local=new URL(client.url);if(local.origin===location.origin&&local.pathname.startsWith('/uv-service/')&&new URL(decodeURIComponent(local.pathname.slice(12))).origin===merchant.origin)client.postMessage({tembyCartStatus:issue});}catch{}
              }
              await self.__tembyPublishCartTrace(url.href,'rejected',{source:'response',transport:'merchant-sdk',reason:result.accepted?'client-response-not-published':'client-error',requestStartedAt:startedAt});return;
            }
            await self.__tembyPublishCartTrace(url.href,'read',{source:'response',transport:'merchant-sdk',requestStartedAt:startedAt});
            continue;
          }
        }
        const response=await engine.fetch({request:new Request(target,{method:'POST',referrer:requester.url,credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({api_version:1,cart_modify_type:1,cart_scene:0,extra_config:{req_read_flag:2}})})});
        const value=response.ok&&response.headers.get('content-type')?.includes('json')?await response.json():null;
        if(!value){void response.body?.cancel().catch(()=>{});return;}
        // Transport observation already publishes the validated response. A
        // refusal or unsupported result ends this attempt; never retry it.
        if(!self.__tembyCart.responseFacts(value,startedAt))return;
      }while(flight.changedAt>startedAt);
    }finally{cartReadFlights.delete(key);await cartReadState(merchant.origin,false);}
  })();
  return flight.promise;
}
engine.on('request',event=>{
  if(self.__tembyBlockedTelemetry?.({url:event.data.url.href,destination:event.data.request.destination})){
    self.__tembyResourceCounts.blocked++;event.respondWith(new Response(null,{status:204}));return;
  }
  if(self.__tembyResourceCounts)self.__tembyResourceCounts.relay++;
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
  if(event.data?.tembyCartRefresh){
    const time=event.data.tembyCartRefresh.time;
    if(Number.isSafeInteger(time)&&Math.abs(Date.now()-time)<30000)event.waitUntil(readCurrentCart(event.source,time,event.data.tembyCartRefresh.clientRead===1).catch(()=>{}));
    return;
  }
  if(event.data?.tembyCartRead||event.data?.tembyCartInvalidate){
    event.waitUntil((async()=>{try{
      const source=new URL(event.source?.url);if(source.origin!==location.origin||!source.pathname.startsWith('/uv-service/'))return;
      const merchant=new URL(decodeURIComponent(source.pathname.slice('/uv-service/'.length)));
      if(merchant.protocol!=='https:'||!/(^|\.)temu\.com$/.test(merchant.hostname)||!cartState)return;
      if(event.data.tembyCartInvalidate){
        await cartState.clear(merchant.origin,Date.now());return;
      }
      const scope=await self.__tembyCartScope(merchant.href),cached=await cartState.get(merchant.origin,scope);
      event.source.postMessage({tembyCartReadState:{pending:cartReadFlights.has(merchant.origin+'|'+(scope||event.source.id))}});
      if(cached&&self.__tembyCart.select(cached.data.tembyCartUpdate.carts,Date.now())){
        event.source.postMessage(cached.data);
        if(cached.issue)event.source.postMessage({tembyCartStatus:cached.issue});
        if(await cartState.revalidate(merchant.origin,scope,Date.now()))
          await readCurrentCart(event.source,Date.now(),event.data.tembyCartRead.clientRead===1);
      }else await readCurrentCart(event.source,0,event.data.tembyCartRead.clientRead===1);
    }catch{}})());
    return;
  }
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
  if(['document','iframe'].includes(event.data.request.request.destination))self.__tembyBeginIntegrityDocument?.(event.data.request.url.href);
  const integrity=event.data.request.request.integrity||self.__tembyIntegrityFor?.(event.data.request.headers.referer,event.data.request.url.href);
  if(integrity||self.__tembyIsIntegrityResource?.(event.data.request.headers.referer,event.data.request.url.href)||event.data.request.request.destination==='style'||event.data.request.url.href==='https://fixture.temby.invalid/native-navigation.js'){
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
      await self.__tembyLoadIntegrity?.(context);
      if(self.__tembyBlockedTelemetry?.(original)){self.__tembyResourceCounts.blocked++;return new Response(null,{status:204});}
      const integrity=original.integrity||self.__tembyIntegrityFor?.(context,original.url);
      const direct=await self.__tembyTryDirect?.(original,original.url,integrity);if(direct)return direct;
      // The browser can reduce a cross-origin request's referrer to localhost/
      // before this event. Restore the actual controlled client's URL so UV
      // can map its virtual Origin/Referer instead of losing that context.
      const mapped=await self.__tembyMapRequest(original,location.origin+'/uv-service/'+encodeURIComponent(original.url),context);
      await pendingCookies.catch(()=>{});await getHelpers();const response=await engine.fetch({request:mapped});await self.__tembyFlushIntegrity?.();return response;
    })());return;
  }
  if(['sharedworker','serviceworker'].includes(event.request.destination)){
    event.waitUntil(fetch('/_runtime',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({phase:'worker-blocked'})}).catch(()=>{}));
    event.respondWith(Promise.resolve(new Response('Merchant workers unsupported',{status:403})));return;
  }
  event.respondWith((async()=>{
    let target;try{target=decodeURIComponent(new URL(event.request.url).pathname.slice('/uv-service/'.length));}catch{}
    const client=event.clientId?await self.clients.get(event.clientId):null;
    await self.__tembyLoadIntegrity?.(client?.url||event.request.referrer);
    const integrity=event.request.integrity||self.__tembyIntegrityFor?.(client?.url,target);
    const direct=target&&await self.__tembyTryDirect?.(event.request,target,integrity);if(direct)return direct;
    await pendingCookies.catch(()=>{});await getHelpers();const response=await engine.fetch(event);await self.__tembyFlushIntegrity?.();return response;
  })());
});
