self.__uv$config={prefix:'/uv-service/',encodeUrl:encodeURIComponent,decodeUrl:decodeURIComponent,handler:'/uv/handler.js',bundle:'/uv/bundle.js',client:'/uv/client.js',config:'/uv/config.js',sw:'/uv/sw.js'};
// 3.2.10 emits rewriteImport(base, specifier) but implements the reverse order.
// Match the emitted call for every site, including inline dynamic imports.
self.Ultraviolet.prototype.rewriteImport=function(base,specifier){return this.rewriteUrl(specifier,{...this.meta,base});};
// Preserve the browser's security attributes instead of UV's default renaming.
// Integrity-protected resources are returned byte-for-byte by our worker.
{
  const Original=self.Ultraviolet;
  const escapedHelpers=new Map();
  const security=new Set(['integrity','nonce','crossorigin','sandbox','http-equiv']);
  self.Ultraviolet=class extends Original{
    constructor(...args){
      super(...args);this.attrs.isForbidden=()=>false;
      this.html.on('attr',(attr,type)=>{
        if(type==='rewrite'&&attr.name.startsWith('__uv-attr-')&&security.has(attr.name.slice(10)))attr.name=attr.name.slice(10);
        if(type==='rewrite'&&self.__tembyResourceTags?.has(attr.node.tagName)&&['src','href'].includes(attr.name))attr.value=self.__tembyNetworkURL(this,attr.value);
        if(type==='rewrite'&&attr.name==='style')attr.value=this.sourceCSS(attr.value);
        if(type==='rewrite'&&['srcset','imagesrcset'].includes(attr.name))attr.value=this.html.unwrapSrcset(attr.value,this.meta);
      });
      this.html.on('text',(text,type)=>{if(type==='rewrite'&&text.element.tagName==='style')text.value=this.sourceCSS(text.value);});
      if(self.__tembyInlineHelpers){
        const create=this.createHtmlInject;
        this.createHtmlInject=(...args)=>{
          if(this.__tembyResponseCookieString!==undefined)args[4]=this.__tembyResponseCookieString;
          return create(...args).map(node=>{
            const src=node.attrs?.find(attr=>attr.name==='src')?.value;
            const code=self.__tembyInlineHelpers[src];
            if(code){
              let cached=escapedHelpers.get(src);
              if(cached?.source!==code){cached={source:code,safe:code.replace(/<\/script/gi,'<\\/script')};escapedHelpers.set(src,cached);}
              node.attrs=node.attrs.filter(attr=>attr.name!=='src');node.childNodes=[{nodeName:'#text',value:cached.safe,skip:true}];
            }
            node.namespaceURI='http://www.w3.org/1999/xhtml';
            for(const child of node.childNodes||[]){child.parentNode=node;if(child.nodeName==='#text'&&!code)child.value=child.value.replace(/<\/script/gi,'<\\/script');}
            return node;
          });
        };
      }
    }
    rewriteUrl(value,meta=this.meta){
      if(String(value).startsWith('blob:'))return this.blobUrls?.get(String(value))||String(value);
      return super.rewriteUrl(self.__tembyUpstreamURL?self.__tembyUpstreamURL(value,meta,this.prefix):value,meta);
    }
    rewriteCSS(value,meta=this.meta){
      // Dynamic style properties/cssText must follow the same original-origin
      // resource policy as HTML images. Requests still pass through our worker.
      return this.sourceCSS(super.rewriteCSS(value,meta),meta);
    }
    sourceUrl(value,meta=this.meta){
      const text=String(value||'');
      if(!text.startsWith(String(meta.origin||'')+this.prefix))return text;
      const source=super.sourceUrl(text,meta);
      return self.__tembyUpstreamURL?self.__tembyUpstreamURL(source,meta,this.prefix):source;
    }
  };
}
// UV persists document.cookie asynchronously in page IndexedDB. Notify the
// worker before an immediate fetch/navigation so it can await the same write.
if(self.UVClient&&self.navigator?.serviceWorker?.controller){
  const send=self.navigator.serviceWorker.controller.postMessage.bind(self.navigator.serviceWorker.controller);
  const cookieURL=decodeURIComponent(location.pathname.slice('/uv-service/'.length));
  const Client=self.UVClient;
  self.UVClient=class extends Client{
    constructor(...args){super(...args);self.__tembyConfigureClientNetwork?.(this,args[0]);self.__tembyConfigureNavigation?.(args[0]);self.__tembyConfigureCompanion?.(args[0],this.idb);this.document.on('setCookie',event=>send({tembyCookieWrite:{url:args[0]?.__uv?.meta?.url?.href||cookieURL,cookie:event.data.value}}));}
  };
}
