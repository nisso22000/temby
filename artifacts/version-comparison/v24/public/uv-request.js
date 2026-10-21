// Request used as RequestInit exposes a ReadableStream body. keepalive forbids
// streaming bodies, so materialize the bounded beacon body before remapping.
self.__tembyMapRequest=async(original,url,clientReferrer)=>{
  const body=['GET','HEAD'].includes(original.method)?undefined:await original.clone().arrayBuffer();
  const mapped=new Request(url,{
    method:original.method,headers:original.headers,body,
    mode:original.mode,credentials:original.credentials,cache:original.cache,
    redirect:original.redirect,referrer:clientReferrer??original.referrer,
    referrerPolicy:original.referrerPolicy,integrity:original.integrity,
    keepalive:original.keepalive,signal:original.signal,
  });
  Object.defineProperty(mapped,'destination',{value:original.destination});
  return mapped;
};

// Only a controlled document (or a registered child worker) can introduce a
// blob context. Never infer a merchant identity from the requested API host.
self.__tembyWorkerContexts=(origin,now=Date.now)=>{
  const entries=new Map();
  const documentURL=value=>{
    try{
      const physical=new URL(value);
      if(physical.origin!==origin||!physical.pathname.startsWith('/uv-service/'))return null;
      const virtual=new URL(decodeURIComponent(physical.pathname.slice('/uv-service/'.length)));
      return ['http:','https:'].includes(virtual.protocol)?physical.href:null;
    }catch{return null;}
  };
  const resolve=value=>{
    const document=documentURL(value);if(document)return document;
    const entry=entries.get(value);
    if(entry&&now()-entry.time<1800000)return entry.owner;
    entries.delete(value);return null;
  };
  return {resolve,register(source,value,time=now()){
    const owner=resolve(source);if(!owner||typeof value!=='string')return false;
    if(!Number.isFinite(time)||time>now()||now()-time>=1800000)return false;
    try{const blob=new URL(value);if(blob.protocol!=='blob:'||blob.origin!==origin)return false;}catch{return false;}
    if(entries.size>=128)entries.delete(entries.keys().next().value);
    entries.set(value,{owner,time});return true;
  }};
};
