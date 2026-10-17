(()=>{
  // This local script is inserted after content rewriting, before merchant scripts.
  const go=window.location.assign.bind(window.location);
  const nativeFetch=window.fetch.bind(window);
  const rawURL=window.location.href;
  const create=document.createElement.bind(document);
  const appOrigin='__APP_ORIGIN__';
  const ready=()=>{
    const host=create('div');host.id='temby-proxy-toolbar';
    host.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;';
    const root=host.attachShadow({mode:'open'});
    root.innerHTML='<style>:host{all:initial}nav{font:14px system-ui;display:flex;align-items:center;gap:14px;padding:10px 14px;background:#173b32;color:white;box-shadow:0 1px 5px #0004}button{font:inherit;background:#fff;color:#173b32;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}span{flex:1}dialog{font:16px system-ui;max-width:90vw;border:0;border-radius:12px;padding:24px}pre{white-space:pre-wrap;max-height:60vh;overflow:auto}</style><nav aria-label="Temby proxy"><button id="home">Temby home</button><span>Proxied page</span><button id="pay">Pay in DZD</button></nav><dialog><h2>Payment preview</h2><p>No real cart has been verified. No payment is collected.</p><pre></pre><button id="close">Close</button></dialog>';
    let target='Proxied page';try{target=new URL(decodeURIComponent(rawURL.split('/service/')[1])).hostname;}catch{}
    root.querySelector('span').textContent=target+' · via Temby';
    root.querySelector('#home').onclick=()=>go(appOrigin+'/');
    root.querySelector('#pay').onclick=async()=>{
      const dialog=root.querySelector('dialog');dialog.showModal();
      try{const r=await nativeFetch('/_state',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error();const state=await r.json();root.querySelector('pre').textContent=JSON.stringify(state.cart,null,2);}catch{root.querySelector('pre').textContent='Cart information unavailable';}
    };
    root.querySelector('#close').onclick=()=>root.querySelector('dialog').close();
    document.body.prepend(host);document.documentElement.style.scrollPaddingTop='64px';document.body.style.paddingTop='64px';
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
