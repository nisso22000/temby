// Normalize virtual-local URLs before UV encodes them again. Never fetch the
// localhost URL upstream: its origin belongs to the relay, not the merchant.
self.__tembyUpstreamURL=(value,meta,prefix='/uv-service/')=>{
  let text=String(value),local=String(meta.origin||'');
  for(let count=0;count<8;count++){
    let url;try{url=new URL(text);}catch{return text;}
    if(!['http:','https:'].includes(url.protocol))return text;
    if(url.origin!==local)return text;
    if(url.pathname.startsWith(prefix)){
      try{text=decodeURIComponent(url.pathname.slice(prefix.length))+url.search+url.hash;continue;}catch{return text;}
    }
    let base;try{base=new URL(meta.url||meta.base);}catch{return text;}
    if(base.origin===local)return text;
    return new URL(url.pathname+url.search+url.hash,base.origin).href;
  }
  return text;
};
