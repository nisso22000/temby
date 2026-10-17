// Diagnostic baseline: deliver the relay's original bytes without a content
// rewriter. This deliberately does not emulate the merchant's window origin.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  event.respondWith((async()=>{
    try{
      const request=event.request,url=new URL(request.url);
      let remote;
      if(url.origin===location.origin&&url.pathname.startsWith('/plain/'))remote=new URL(decodeURIComponent(url.pathname.slice('/plain/'.length)));
      else{
        const client=event.clientId?await self.clients.get(event.clientId):null;
        if(!client||!new URL(client.url).pathname.startsWith('/plain/'))return fetch(request);
        const base=new URL(decodeURIComponent(new URL(client.url).pathname.slice('/plain/'.length)));
        remote=url.origin===location.origin?new URL(url.pathname+url.search,base):url;
      }
      const bytes=['GET','HEAD'].includes(request.method)?null:new Uint8Array(await request.arrayBuffer());
      // Do not send localhost cookies/credentials to a merchant. This baseline
      // uses only the relay's per-session upstream cookie jar.
      const forwarded=Object.fromEntries([...request.headers].filter(([key])=>!['cookie','authorization','proxy-authorization'].includes(key.toLowerCase())));
      const relay=await fetch('/_relay',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({url:remote.href,method:request.method,headers:forwarded,body:bytes?btoa(Array.from(bytes,x=>String.fromCharCode(x)).join('')):null})});
      if(!relay.ok)return new Response('Local diagnostic relay refused request',{status:502});
      const wire=await relay.json();const headers=new Headers();
      for(const [key,value]of Object.entries(wire.headers))if(key!=='set-cookie')headers.set(key,Array.isArray(value)?value.join(', '):value);
      if(headers.has('location')){
        const destination=new URL(headers.get('location'),remote);
        headers.set('location','/plain/'+encodeURIComponent(destination.href));
      }
      return new Response([204,205,304].includes(wire.status)||request.method==='HEAD'?null:Uint8Array.from(atob(wire.body),x=>x.charCodeAt(0)),{status:wire.status,headers});
    }catch{return new Response('Transport diagnostic failed',{status:502});}
  })());
});
