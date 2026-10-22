// Worker-only native delivery for public, non-executable CDN resources.
// Never run merchant APIs/documents or rewritten JS through this path.
(() => {
  const failed=new Map();
  const nativeFetch=self.fetch.bind(self);
  const counts=self.__tembyResourceCounts={direct:0,directFallback:0,blocked:0,relay:0};
  const protectedDocuments=new Map();
  const dirty=new Set();let pendingIntegrity=Promise.resolve();
  const documentKey=value=>{try{let url=new URL(value);if(url.origin===self.location.origin&&url.pathname.startsWith('/uv-service/'))url=new URL(decodeURIComponent(url.pathname.slice('/uv-service/'.length)));url.hash='';return url.href;}catch{return '';}};
  const cacheKey=owner=>self.location.origin+'/_integrity-context/'+encodeURIComponent(owner);
  self.__tembyBeginIntegrityDocument=owner=>{const key=documentKey(owner);if(!key||key.length>4096)return;if(!protectedDocuments.has(key)&&protectedDocuments.size>=32){const first=protectedDocuments.keys().next().value;protectedDocuments.delete(first);dirty.delete(first);}protectedDocuments.set(key,{resources:new Map()});dirty.add(key);};
  self.__tembyRegisterIntegrity=(owner,url,integrity)=>{
    const entry=protectedDocuments.get(documentKey(owner));
    if(entry&&(entry.resources.size<64||entry.resources.has(url))&&url.length<=2048&&integrity.length<=1024){entry.resources.set(url,entry.resources.has(url)&&entry.resources.get(url)!==integrity?null:integrity);dirty.add(documentKey(owner));}
  };
  self.__tembyIntegrityFor=(owner,url)=>protectedDocuments.get(documentKey(owner))?.resources.get(url)||'';
  self.__tembyIsIntegrityResource=(owner,url)=>protectedDocuments.get(documentKey(owner))?.resources.has(url)===true;
  self.__tembyFlushIntegrity=()=>{
    if(!dirty.size)return pendingIntegrity;
    const entries=[...dirty].map(owner=>[owner,[...(protectedDocuments.get(owner)?.resources||[])]]);dirty.clear();
    pendingIntegrity=pendingIntegrity.catch(()=>{}).then(async()=>{
      try{const cache=await caches.open('temby-integrity-context-v1');
        for(const [owner,resources]of entries){const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-31)))await cache.delete(key);await cache.put(cacheKey(owner),new Response(JSON.stringify({resources}),{headers:{'content-type':'application/json'}}));}
      }catch{}
    });return pendingIntegrity;
  };
  self.__tembyLoadIntegrity=async owner=>{
    const key=documentKey(owner);if(!key||key.length>4096||protectedDocuments.has(key))return;
    await pendingIntegrity.catch(()=>{});
    try{const saved=await(await caches.open('temby-integrity-context-v1')).match(cacheKey(key));if(!saved)return;
      const data=await saved.json();if(!Array.isArray(data.resources)||data.resources.length>64||data.resources.some(pair=>!Array.isArray(pair)||pair.length!==2||typeof pair[0]!=='string'||pair[0].length>2048||pair[1]!==null&&(typeof pair[1]!=='string'||pair[1].length>1024)))return;
      if(protectedDocuments.has(key))return;
      if(protectedDocuments.size>=32)protectedDocuments.delete(protectedDocuments.keys().next().value);
      protectedDocuments.set(key,{resources:new Map(data.resources)});
    }catch{}
  };
  self.__tembyBlockedTelemetry=request=>{
    if(self.__tembyResourceOptions?.blockTelemetry!==true||['document','iframe'].includes(request.destination))return false;
    try{const url=new URL(request.url);return url.protocol==='https:'&&(/(^|\.)(?:pftk|thtk)\.temu\.com$/.test(url.hostname)||/(^|\.)temu\.com$/.test(url.hostname)&&url.pathname.startsWith('/api/adx/')||url.hostname==='adtk-eu.temu.com'&&url.pathname==='/c/ad');}catch{return false;}
  };
  self.__tembyDirectCandidate=(request,target=request.url,integrity=request.integrity)=>{
    if(self.__tembyResourceOptions?.directAssets!==true||!['GET','HEAD'].includes(request.method))return false;
    let url;try{url=new URL(target);}catch{return false;}
    if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!/(^|\.)kwcdn\.com$/.test(url.hostname))return false;
    if(request.headers.has('authorization')||[...url.searchParams.keys()].some(key=>/token|signature|credential|auth|expires/i.test(key)))return false;
    return ['image','style','font','audio','video','track'].includes(request.destination)||request.destination==='script'&&!!integrity;
  };
  self.__tembyTryDirect=async(request,target=request.url,integrity=request.integrity)=>{
    if(!self.__tembyDirectCandidate(request,target,integrity))return null;
    const url=new URL(target),key=url.origin+' '+request.destination;
    if((failed.get(key)||0)>Date.now())return null;
    const signal=request.signal;
    try{
      const headers=new Headers(request.headers);
      for(const name of [...headers.keys()])if(/^(cookie|authorization|proxy-authorization|host|origin|referer|sec-fetch-.+|x-temby-.+)$/i.test(name))headers.delete(name);
      const response=await nativeFetch(new Request(url.href,{method:request.method,headers,signal,integrity,cache:request.cache,mode:'cors',credentials:'omit',redirect:'error'}));
      // A readable rate limit/server refusal is an upstream response, not a
      // reason to make a duplicate relay request to that same CDN endpoint.
      if(response.status===429||response.status>=500){counts.direct++;return response;}
      // Require a readable successful public response. Opaque responses cannot
      // be validated and protected/private resources retain relay semantics.
      const type=response.headers.get('content-type')||'';
      const expected={image:/^image\//i,style:/^text\/css/i,font:/^(font\/|application\/(?:font|x-font|woff|vnd\.ms-fontobject|octet-stream))/i,audio:/^audio\//i,video:/^video\//i,track:/^text\/vtt/i,script:/^(?:application|text)\/(?:javascript|ecmascript|x-javascript)/i}[request.destination];
      const control=response.headers.get('cache-control')||'';
      if(!response.ok||response.type==='opaque'||response.status===206&&!response.headers.has('content-range')||!expected?.test(type)||!/max-age\s*=\s*"?[1-9]\d*/i.test(control)||/private|no-store|no-cache/i.test(control)){
        await response.body?.cancel();throw Error('Direct resource requires relay');
      }
      counts.direct++;return response;
    }catch(error){
      if(signal?.aborted)throw error;
      if(failed.size>=128)failed.delete(failed.keys().next().value);
      failed.set(key,Date.now()+60000);counts.directFallback++;return null;
    }
  };
})();
