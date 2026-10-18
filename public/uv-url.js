// Normalize virtual-local URLs before UV encodes them again. Never fetch the
// localhost URL upstream: its origin belongs to the relay, not the merchant.
self.__tembyUpstreamURL=(value,meta,prefix='/uv-service/')=>{
  const local=String(meta.origin||'');
  const unwrap=value=>{
    let text=String(value);
    for(let count=0;count<8;count++){
      // Ordinary relative links cannot be physical absolute proxy URLs.
      // Avoid throwing a URL parse exception for every product link.
      if(!text.includes(':'))return text;
      let url;try{url=new URL(text);}catch{return text;}
      if(!['http:','https:'].includes(url.protocol)||url.origin!==local)return text;
      if(url.pathname.startsWith(prefix)){
        try{text=decodeURIComponent(url.pathname.slice(prefix.length))+url.search+url.hash;continue;}catch{return text;}
      }
      let base;try{base=new URL(meta.url||meta.base);}catch{return text;}
      if(base.origin===local)return text;
      return new URL(url.pathname+url.search+url.hash,base.origin).href;
    }
    return text;
  };
  const text=unwrap(value);
  // Repair only a known login return URL containing our own proxy prefix.
  // Preserve unrelated query bytes, opaque fields and external destinations.
  // Most resource/product URLs have no return parameter and need no second parse.
  const match=/([?&]from=)([^&#]*)/.exec(text);if(!match)return text;
  try{
    let url;try{url=new URL(text);}catch{url=new URL(text,meta.url||meta.base);}
    if(url.protocol!=='https:'||!(['temu.com'].includes(url.hostname)||url.hostname.endsWith('.temu.com'))||url.pathname!=='/login.html'||url.searchParams.getAll('from').length!==1)return text;
    const physical=new URL(decodeURIComponent(match[2].replace(/\+/g,' ')));
    if(physical.origin!==local||!physical.pathname.startsWith(prefix))return text;
    const target=new URL(unwrap(physical.href));
    if(target.origin!==url.origin||target.username||target.password)return text;
    return text.slice(0,match.index)+match[1]+encodeURIComponent(target.href)+text.slice(match.index+match[0].length);
  }catch{return text;}
};
