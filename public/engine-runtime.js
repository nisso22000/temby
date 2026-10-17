/* Generic Scramjet v2 bridge; runs before merchant code in each proxied document. */
(()=>{
  const nativeFetch=self.fetch.bind(self), NativeResponse=self.Response, NativeURL=self.URL;
  const nativeOrigin=self.location.origin;
  const {CookieJar,defaultConfig,ScramjetClient}=self.$scramjet;
  class Transport {
    ready=true;
    async init(){}
    connect(_u,_p,_h,_o,_m,_c,error){error('WebSockets are unsupported');return [()=>{},()=>{}];}
    async request(remote,method,body,headers,signal){
      const bytes=body?new Uint8Array(await new NativeResponse(body).arrayBuffer()):null;
      const encoded=bytes?btoa(Array.from(bytes,x=>String.fromCharCode(x)).join('')):null;
      const response=await nativeFetch(nativeOrigin+'/_relay',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({url:remote.href,method,headers:Object.fromEntries(headers),body:encoded}),signal});
      if(!response.ok)throw new Error('Local relay refused request');
      const wire=await response.json();
      const raw=Object.entries(wire.headers).flatMap(([k,v])=>(Array.isArray(v)?v:[v]).map(value=>[k,value]));
      this.lastHeaders?.set(remote.href,raw);
      return {status:wire.status,statusText:wire.statusText,headers:raw,body:Uint8Array.from(atob(wire.body),x=>x.charCodeAt(0)).buffer};
    }
  }
  function context(jar){
    return {config:structuredClone(defaultConfig),prefix:new NativeURL('/service/',nativeOrigin),cookieJar:jar,interface:{
      codecEncode:encodeURIComponent,codecDecode:decodeURIComponent,
      getInjectScripts(_meta,_handler,htmlcontext,script){
        const cookies=Object.fromEntries(Object.entries(JSON.parse(jar.dump())).filter(([,c])=>!c.httpOnly));
        const init={cookies,headers:(htmlcontext.headers||[]).filter(([name])=>name.toLowerCase()!=='set-cookie'),history:htmlcontext.history||[]};
        const code='$temby.start('+JSON.stringify(init)+');';
        const data=btoa(unescape(encodeURIComponent(code)));
        return [script('/engine/core.js'),script('/engine/runtime.js'),script('data:text/javascript;base64,'+data)];
      }
    }};
  }
  function start(init){
    const jar=new CookieJar();jar.load(init.cookies);
    const transport=new Transport();
    const sw=navigator.serviceWorker.controller;
    const send=sw?.postMessage.bind(sw);
    const sendCookies=async entries=>{for(const {url,cookie}of entries)jar.setCookies(cookie,url);send?.({tembyCookies:entries.map(x=>({url:x.url.href,cookie:x.cookie}))});};
    const ctx=context(jar);
    const hook=(target,headers=[],history=[])=>{
      const client=new ScramjetClient(target,{context:ctx,transport,sendSetCookie:sendCookies,hookSubcontext:sub=>hook(sub),initHeaders:headers,history});
      client.hook();return client;
    };
    hook(self,init.headers,init.history);
  }
  self.$temby={Transport,context,start};
})();
