try {
// v2 snapshots window Blob-URL helpers at import time. Service workers do not
// expose these helpers; keep the unsupported operation explicit if invoked.
if(!URL.createObjectURL)URL.createObjectURL=()=>{throw new Error('Blob URLs unsupported in the proxy worker');};
if(!URL.revokeObjectURL)URL.revokeObjectURL=()=>{throw new Error('Blob URLs unsupported in the proxy worker');};
importScripts('/engine/core.js','/engine/runtime.js');
const {ScramjetFetchHandler,ScramjetHeaders,CookieJar,BareResponse}=self.$scramjet;
const jar=new CookieJar();
const transport=new self.$temby.Transport();transport.lastHeaders=new Map();
const handler=new ScramjetFetchHandler({context:self.$temby.context(jar),transport,
  async sendSetCookie(){},
  async fetchDataUrl(url){return BareResponse.fromNativeResponse(await fetch(url));},
  async fetchBlobUrl(url){return BareResponse.fromNativeResponse(await fetch(url));}
});
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  if(Array.isArray(event.data?.tembyCookies))for(const entry of event.data.tembyCookies.slice(0,100)){
    try{if(typeof entry.cookie==='string'&&entry.cookie.length<16384&&!/httponly/i.test(entry.cookie))jar.setCookies(entry.cookie,new URL(entry.url));}catch{}
  }
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(!url.pathname.startsWith('/service/'))return;
  event.respondWith((async()=>{
    try{
      const request=event.request;
      if(['worker','sharedworker','serviceworker'].includes(request.destination))return new Response('Merchant workers unsupported',{status:403});
      const client=event.clientId?await self.clients.get(event.clientId):null;
      const result=await handler.handleFetch({rawUrl:url,rawReferrer:request.referrer||null,rawDestination:request.destination,mode:request.mode,referrer:request.referrer,method:request.method,body:['GET','HEAD'].includes(request.method)?null:request.body,cache:request.cache,initialHeaders:ScramjetHeaders.fromNativeHeaders(request.headers),rawClientUrl:client?new URL(client.url):undefined,clientId:event.clientId});
      const headers=result.headers.toNativeHeaders();
      const remote=decodeURIComponent(url.pathname.slice('/service/'.length));
      for(const [key,value]of transport.lastHeaders.get(remote)||[])if(/^(content-security-policy|x-frame-options|permissions-policy|cross-origin-(embedder|opener|resource)-policy)$/i.test(key))headers.set(key,value);
      transport.lastHeaders.delete(remote);
      return new Response(result.body,{status:result.status,statusText:result.statusText,headers});
    }catch(error){
      const detail=String(error?.message||'Unknown worker error').replace(/https?:\/\/\S+/g,'[URL omitted]').slice(0,180);
      return new Response('Temby rewriting worker failed: '+detail,{status:502,headers:{'content-type':'text/plain'}});
    }
  })());
});

} catch(error) {
 const detail=String(error?.message||'Startup error').replace(/https?:\/\/\S+/g,'[URL omitted]').slice(0,180);
 self.addEventListener('install',()=>self.skipWaiting());
 self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
 self.addEventListener('fetch',event=>{if(new URL(event.request.url).pathname.startsWith('/service/'))event.respondWith(Promise.resolve(new Response('Temby v2 startup: '+detail,{status:502,headers:{'content-type':'text/plain'}})));});
}

