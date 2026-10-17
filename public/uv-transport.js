// Restricted relay adapter. It does not alter merchant verification code.
(()=>{
  const nativeFetch=self.fetch.bind(self);
  const relayURL=new URL('/_relay',self.location.origin).href;
  const runtimeURL=new URL('/_runtime',self.location.origin).href;
  class RelayClient {
    async fetch(url,options={}){
      const bytes=options.body?new Uint8Array(await new Response(options.body).arrayBuffer()):null;
      const body=bytes?btoa(Array.from(bytes,x=>String.fromCharCode(x)).join('')):null;
      const headers={...options.headers};const destination=headers['x-temby-request-destination']||'unknown';delete headers['x-temby-request-destination'];
      const relay=await nativeFetch(relayURL,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({url:String(url),method:options.method||'GET',headers,body,destination,engine:'ultraviolet'})});
      if(!relay.ok){
        await nativeFetch(runtimeURL,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({phase:'relay-refused'})}).catch(()=>{});
        throw new Error('Local relay refused request');
      }
      const wire=await relay.json();
      const response=new Response([101,204,205,304].includes(wire.status)?null:Uint8Array.from(atob(wire.body),x=>x.charCodeAt(0)),{status:wire.status,headers:Object.entries(wire.headers).filter(([k])=>k!=='set-cookie')});
      response.rawHeaders=wire.headers;response.finalURL=String(url);return response;
    }
    createWebSocket(){throw new Error('WebSockets unsupported');}
  }
  self.Ultraviolet.BareClient=RelayClient;
})();
