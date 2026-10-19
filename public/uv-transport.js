// Restricted relay adapter. It does not alter merchant verification code.
(()=>{
  const nativeFetch=self.fetch.bind(self);
  const relayURL=new URL('/_relay',self.location.origin).href;
  const runtimeURL=new URL('/_runtime',self.location.origin).href;
  let requestSequence=0;
  const readBinary=async relay=>{
    const reader=relay.body.getReader();let chunk=new Uint8Array(0),offset=0;
    const take=async size=>{
      const bytes=new Uint8Array(size);let written=0;
      while(written<size){
        if(offset===chunk.length){const next=await reader.read();if(next.done)throw new Error('Incomplete local relay response');chunk=next.value;offset=0;}
        const length=Math.min(size-written,chunk.length-offset);bytes.set(chunk.subarray(offset,offset+length),written);offset+=length;written+=length;
      }
      return bytes;
    };
    try{
      const prefix=await take(4);const length=new DataView(prefix.buffer).getUint32(0);
      if(length>1024*1024)throw new Error('Local relay metadata too large');
      const metadata=JSON.parse(new TextDecoder().decode(await take(length)));
      const body=new ReadableStream({
        start(controller){if(offset<chunk.length)controller.enqueue(chunk.subarray(offset));},
        async pull(controller){try{const next=await reader.read();if(next.done){reader.releaseLock();controller.close();}else controller.enqueue(next.value);}catch(error){controller.error(error);}},
        cancel(reason){return reader.cancel(reason);},
      });
      return {...metadata,body};
    }catch(error){await reader.cancel().catch(()=>{});throw error;}
  };
  class RelayClient {
    async fetch(url,options={}){
      const started=++requestSequence;
      const bytes=options.body?new Uint8Array(await new Response(options.body).arrayBuffer()):null;
      const body=bytes?btoa(Array.from(bytes,x=>String.fromCharCode(x)).join('')):null;
      const headers={...options.headers};const destination=headers['x-temby-request-destination']||'unknown';delete headers['x-temby-request-destination'];
      const signal=['GET','HEAD'].includes(options.method||'GET')?(self.__tembyRelaySignals?.get(options.headers)||options.signal):undefined;
      const relay=await nativeFetch(relayURL,{method:'POST',credentials:'same-origin',signal,headers:{'content-type':'application/json','x-temby-wire':'binary-v1'},body:JSON.stringify({url:String(url),method:options.method||'GET',headers,body,destination,engine:'ultraviolet'})});
      if(!relay.ok){
        await nativeFetch(runtimeURL,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({phase:'relay-refused'})}).catch(()=>{});
        throw new Error('Local relay refused request');
      }
      const binary=relay.headers.get('content-type')?.startsWith('application/x-temby-binary');
      const wire=binary?await readBinary(relay):await relay.json();
      const cookieContext=self.__tembyRelayCookieContexts?.get(options.headers);
      try{
        if(cookieContext&&wire.headers['set-cookie']?.length&&self.__tembyApplyResponseCookies)await self.__tembyApplyResponseCookies(cookieContext,wire.headers['set-cookie']);
      }catch(error){if(binary)await wire.body.cancel().catch(()=>{});throw error;}
      const empty=[101,204,205,304].includes(wire.status)||options.method==='HEAD';
      if(empty&&binary)await wire.body.cancel();
      const response=new Response(empty?null:binary?wire.body:Uint8Array.from(atob(wire.body),x=>x.charCodeAt(0)),{status:wire.status,headers:Object.entries(wire.headers).filter(([k])=>k!=='set-cookie')});
      if(self.__tembyCart?.responseURL(String(url))&&self.__tembyObserveCartResponse){
        // Observe the response already requested by Temu; never request a cart.
        try{await self.__tembyObserveCartResponse(String(url),response.clone(),started);}catch{}
      }
      response.rawHeaders=wire.headers;response.finalURL=String(url);return response;
    }
    createWebSocket(){throw new Error('WebSockets unsupported');}
  }
  self.Ultraviolet.BareClient=RelayClient;
})();
