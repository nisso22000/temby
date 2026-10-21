// Catch browser-native GET navigation from scripts that could not be rewritten
// (including integrity-protected resources). Keep history traversal and POST
// bodies intact; do not emulate CAPTCHA or authentication outcomes.
self.__tembyConfigureNavigation=page=>{
  const local=page.location.origin;
  const assign=page.location.assign.bind(page.location);
  const replace=page.location.replace.bind(page.location);
  const wrap=value=>{
    const uv=page.__uv;if(!uv)return String(value);
    return uv.rewriteUrl(String(value));
  };
  if(typeof page.open==='function'){
    const open=page.open;
    page.open=function(url,...args){return open.call(this,url==null||url===''?url:wrap(url),...args);};
  }
  page.navigation?.addEventListener('navigate',event=>{
    if(!event.cancelable||event.defaultPrevented||event.formData||event.downloadRequest!=null||event.navigationType==='traverse')return;
    let url;try{url=new URL(event.destination.url);}catch{return;}
    const uv=page.__uv;if(!uv)return;
    if(url.origin===local&&url.pathname.startsWith('/uv-service/'))return;
    const merchant=url.protocol==='https:'&&(['temu.com','kwcdn.com','fixture.temby.invalid'].includes(url.hostname)||url.hostname.endsWith('.temu.com')||url.hostname.endsWith('.kwcdn.com'));
    if(!merchant&&url.origin!==local)return;
    if(url.origin===local&&/^\/(?:uv(?:\/|$)|_)/.test(url.pathname))return;
    const target=wrap(url.href);
    if(target===url.href||!target.startsWith(local+'/uv-service/'))return;
    event.preventDefault();
    // Start after the cancelled navigation finishes dispatching.
    page.setTimeout(()=>{(event.navigationType==='replace'?replace:assign)(target);},0);
  });
};
