// Resource URLs retain their upstream origin for CSP and relative-URL semantics.
// The controlling worker intercepts their requests and uses the local relay.
self.__tembyResourceTags=new Set(['script','link','img','image','source','track','video','audio','input','embed','object']);
// Access UV's source helper from our own realm, rather than looking it up on
// a cross-origin Window. Only operations the native Window permits are exposed.
self.__tembySetSource=(target,uv)=>{
  if(target==null)return target;
  try{return target.__uv$setSource(uv);}catch(error){
    if(error?.name!=='SecurityError')throw error;
    try{if(target.window!==target)throw error;}catch{throw error;}
    return new Proxy(Object.create(null),{
      get(_object,key){
        const nativeKey=({'__uv$location':'location','__uv$top':'top','__uv$parent':'parent','__uv$eval':'eval'})[key]||key;
        const value=target[nativeKey];return nativeKey==='postMessage'?value.bind(target):value;
      },
      set(_object,key,value){
        if(key==='__uv$location'){target.location=uv.rewriteUrl(value);return true;}
        target[key]=value;return true;
      },
    });
  }
};
self.__tembyNetworkURL=(uv,value)=>{
  const source=uv.sourceUrl(String(value));
  if(source.startsWith('blob:'))return uv.blobUrls?.get(source)||source;
  if(/^(data:|blob:|about:|javascript:|#)/i.test(source))return source;
  try{return new URL(source,uv.meta.base||uv.meta.url).href;}catch{return source;}
};
self.__tembyConfigureClientNetwork=(client,page)=>{
  const controller=page.navigator?.serviceWorker?.controller;
  const send=controller?.postMessage.bind(controller);
  // UV's wrapper otherwise starts a BareMuxConnection after constructing the
  // worker. Our RelayClient needs no message port or localStorage workerPath.
  const workerEmit=client.workers.emit.bind(client.workers);
  client.workers.emit=(type,event,...args)=>{
    const result=workerEmit(type,event,...args);
    if(type==='worker'&&!event.intercepted){
      const url=page.__uv?.blobUrls?.get(String(event.data.url))||event.data.url;
      if(String(url).startsWith('blob:')&&send)send({tembyWorkerContext:{url:String(url)}});
      event.respondWith(new event.target(url,event.data.options));
    }
    return result;
  };
  for(const [channel,eventName,field]of [[client.fetch,'request','input'],[client.xhr,'open','input'],[client.navigator,'sendBeacon','url']]){
    const emit=channel.emit.bind(channel);
    channel.emit=(type,event,...args)=>{
      if(channel===client.fetch&&type==='request'&&typeof client.fetch.Request==='function'&&event.data.input instanceof client.fetch.Request){
        // UV stringifies Request objects into "[object Request]". A native
        // clone already has a mapped URL and must retain its method/body.
        event.respondWith(new event.target(event.data.input,event.data.options));
        return;
      }
      const result=emit(type,event,...args);
      if(type===eventName&&typeof event?.data?.[field]==='string'&&page.__uv)event.data[field]=self.__tembyNetworkURL(page.__uv,event.data[field]);
      return result;
    };
  }
  const elementEmit=client.element.emit.bind(client.element);
  client.element.emit=(type,event,...args)=>{
    const result=elementEmit(type,event,...args);
    if(type==='setAttribute'&&page.__uv&&self.__tembyResourceTags.has(event.that?.tagName?.toLowerCase())&&['src','href'].includes(event.data.name))event.data.value=self.__tembyNetworkURL(page.__uv,event.data.value);
    if(type==='setAttribute'&&page.__uv&&['srcset','imagesrcset'].includes(event.data.name))event.data.value=page.__uv.html.unwrapSrcset(event.data.value,page.__uv.meta);
    return result;
  };
  const hook=client.element.hookProperty.bind(client.element);
  client.element.hookProperty=(classes,key,options)=>{
    if(options?.get&&['contentWindow','contentDocument'].includes(key)){
      return hook(classes,key,{...options,get:(target,that,args)=>{
        try{return options.get(target,that,args);}catch(error){
          if(error?.name!=='SecurityError')throw error;
          // UV probes win.__uv before invoking the native getter. A real
          // cross-origin/opaque frame rejects that probe. Preserve native
          // behavior (contentDocument=null, contentWindow=WindowProxy).
          return target.call(that);
        }
      }});
    }
    if(options?.set&&['srcset','imageSrcset'].includes(key))return hook(classes,key,{...options,set:(target,that,args)=>{
      if(!page.__uv)return options.set(target,that,args);
      client.element.setAttribute.call(that,'__uv-attr-'+key.toLowerCase(),String(args[0]));
      return target.call(that,page.__uv.html.unwrapSrcset(page.__uv.html.wrapSrcset(String(args[0])),page.__uv.meta));
    }});
    if(!options?.set||!['src','href'].includes(key))return hook(classes,key,options);
    return hook(classes,key,{...options,set:(target,that,args)=>{
      if(page.__uv&&self.__tembyResourceTags.has(that.tagName?.toLowerCase())){
        client.element.setAttribute.call(that,'__uv-attr-'+key,String(args[0]));
        return target.call(that,self.__tembyNetworkURL(page.__uv,args[0]));
      }
      return options.set(target,that,args);
    }});
  };
};
