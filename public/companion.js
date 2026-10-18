// Runs as a local UV helper, outside merchant source rewriting.
self.__tembyConfigureCompanion=page=>{
  if(page!==page.top||page.__tembyCompanionStarted)return;
  page.__tembyCompanionStarted=true;
  const core=self.__tembyCompanionCore;
  const controller=page.navigator.serviceWorker?.controller;
  const send=controller?.postMessage.bind(controller);
  const nativeSet=Object.getOwnPropertyDescriptor(page.HTMLInputElement.prototype,'value').set;
  const start=()=>{
    const url=page.__uv?.meta?.url;
    if(!url||!/(^|\.)temu\.com$/.test(url.hostname))return;
    const doc=page.document;
    const host=doc.createElement('div');host.id='temby-companion';
    host.style.cssText='all:initial;font:14px/1.5 Arial,sans-serif;color:#18304c;position:fixed;bottom:20px;left:16px;z-index:2147483646;direction:ltr;';
    const root=host.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      :host{font:14px/1.5 Arial,sans-serif;color:#18304c}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid #83baff;outline-offset:2px}[hidden]{display:none!important}
      .bubble{border:0;border-radius:24px;background:#1464df;color:white;box-shadow:0 6px 24px #123e7360;padding:11px 17px;display:grid;gap:2px;min-width:108px;text-align:center}.bubble b{font-size:17px}.bubble small{font-size:11px;color:#dbeaff}
      .panel{width:min(370px,calc(100vw - 32px));max-height:calc(100dvh - 120px);overflow:auto;background:#f5f8fc;border:1px solid #d9e4f1;border-radius:20px;box-shadow:0 12px 48px #15375b45;margin-bottom:12px}.head{padding:18px 20px;background:#1464df;color:white;display:flex;justify-content:space-between;align-items:center}.head strong{font-size:18px}.head small{display:block;color:#dae8ff}.close{background:none;border:0;color:white;font-size:25px}.body{padding:16px}.card{background:white;border:1px solid #e0e8f1;border-radius:13px;padding:14px;margin-bottom:12px}h2{font-size:14px;margin:0 0 8px}p{margin:7px 0}small,.muted{font-size:12px;color:#526980}.amount{font-size:28px;font-weight:700;letter-spacing:-1px;margin:8px 0}.row{display:flex;justify-content:space-between;gap:12px;margin:6px 0}.total{border-top:1px solid #dfe7f0;padding-top:9px;font-weight:700}.action{background:#eaf2ff;color:#1157c0;border:0;border-radius:8px;padding:9px 11px;margin:4px 4px 0 0}.primary{background:#1464df;color:white}.status{color:#8a5700;font-size:12px}.ok{color:#127348}label{display:block;margin:7px 0}input{width:100%;border:1px solid #c6d5e6;border-radius:7px;padding:8px;margin-top:3px}input[type=checkbox]{width:auto}summary{cursor:pointer;font-weight:600}.notice{font-size:12px;background:#fff5de;padding:9px;border-radius:8px}.inbox{white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto}button:disabled{opacity:.5;cursor:default}ol{padding-left:19px;margin:7px 0}li{margin:7px 0}.foot{font-size:11px;text-align:center;color:#61768d}
    </style>
    <section class="panel" id="panel" role="region" aria-label="TEMBY shopping companion" hidden>
      <header class="head"><div><strong>TEMBY</strong><small>Your shopping companion</small></div><button class="close" id="close" aria-label="Close companion">\u00d7</button></header>
      <div class="body"><div class="card"><h2>Your cart in dinars</h2><div id="amount" class="amount">\u2014 DZD</div><p id="status" class="status" role="status">Reading Temu\u2019s cart\u2026</p><div id="breakdown" hidden></div><p class="muted">Estimate includes our 8% service fee. The 2% card fee is shown separately. Shipping and other checkout charges are not yet validated.</p><button class="action" id="cart">Open Temu cart</button></div>
      <div class="card"><h2>Get ready to order</h2><ol><li><strong>Cart</strong><div id="cartstep" class="muted">Waiting for a readable subtotal</div><div id="items" class="muted"></div></li><li><strong>Account</strong><div id="accountstep" class="muted">Not verified</div><button class="action" id="account">Sign in / register on Temu</button></li><li><strong>Delivery</strong><div class="muted">Enter and select your address in Temu checkout.</div><button class="action" id="shipping">Continue to Temu checkout</button><label class="muted"><input type="checkbox" id="delivery"> I checked the selected delivery address</label><div id="deliverystep" class="muted">Not confirmed</div></li></ol><button disabled class="action primary">Payment integration coming later</button></div>
      <div class="card"><details><summary>Account setup tools</summary><p class="muted">Use an email you control, or try a disposable inbox for testing. Complete verification and registration yourself on Temu.</p><label>Email for registration<input id="email" type="email" autocomplete="off" placeholder="you@example.com"></label><button class="action" id="fillEmail">Fill email on Temu</button><p class="notice">Catchmail test inboxes are public to anyone who knows the address. Messages expire after 7 days. Avoid using them for personal orders.</p><button class="action" id="newInbox">Create test inbox</button><button class="action" id="checkInbox">Check test inbox</button><p id="mailstatus" class="muted" role="status"></p><div id="messages" class="inbox"></div><button class="action" id="password">Generate password</button><label hidden id="passwordrow">Generated password<input id="generated" type="text" readonly autocomplete="off"></label><button class="action" id="fillPassword" hidden>Fill generated password on Temu</button><p class="muted">Generated passwords stay in this page\u2019s memory. Save yours before leaving. TEMBY does not read existing passwords or hand credentials to an operator.</p></details></div>
      <div class="card"><details><summary>Local test rates</summary><p class="muted">Example rates for this browser session; not a payment quote.</p><label>1 USD in DZD<input id="usd" type="number" min="0.01" max="10000" step="0.01" value="250"></label><label>1 EUR in DZD<input id="eur" type="number" min="0.01" max="10000" step="0.01" value="275"></label><button class="action" id="rates">Apply rates</button><p id="ratestatus" class="muted"></p></details></div><div class="foot">Local prototype \u00b7 no payment is taken</div></div>
    </section><button class="bubble" id="bubble" aria-label="Open TEMBY companion" aria-expanded="false" aria-controls="panel"><span>\u25c9 TEMBY</span><b id="badge">\u2014 DZD</b><small>incl. service \u00b7 excl. card</small></button>`;
    doc.documentElement.append(host);
    const $=id=>root.getElementById(id);
    const dzd=n=>new Intl.NumberFormat('fr-DZ',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100)+' DZD';
    let rates={USD:25000,EUR:27500};
    let opened=false,previous='',stableSince=0,latest=null,lastRender='';
    try{const saved=JSON.parse(page.sessionStorage.getItem('temby-rates')||'null');if(saved){core.quote(0,'USD',saved);core.quote(0,'EUR',saved);rates=saved;}}catch{}
    $('usd').value=String(rates.USD/100);$('eur').value=String(rates.EUR/100);
    const toggle=value=>{opened=value;$('panel').hidden=!value;$('bubble').setAttribute('aria-expanded',String(value));if(value)$('close').focus();else $('bubble').focus();};
    $('bubble').onclick=()=>toggle(!opened);$('close').onclick=()=>toggle(false);
    root.addEventListener('keydown',event=>{if(event.key==='Escape'&&opened){event.stopPropagation();toggle(false);}});
    const visible=el=>el&&el.getClientRects().length>0&&page.getComputedStyle(el).visibility!=='hidden';
    function readCart(){
      const checkout=doc.getElementById('SidebarCheckout');
      if(!checkout||!visible(checkout)){
        if(!/\/shopping_cart\.html$/.test(page.__uv?.meta?.url?.pathname||''))return null;
        const summary=doc.querySelector('.g_p_sum_wr');
        const button=summary?.querySelector('.checkoutButton');
        const total=summary?.querySelector('.g_p_sum')?.nextElementSibling?.firstElementChild;
        if(!button||!total||!visible(button))return null;
        const nodes=[...total.querySelectorAll('*')].filter(el=>visible(el)&&!el.closest('[aria-hidden="true"]')&&core.money(el.textContent)&&![...el.children].some(child=>core.money(child.textContent)));
        return core.consensus(nodes.map(el=>el.textContent),button.getAttribute('aria-label'));
      }
      const scope=checkout.parentElement?.parentElement;
      if(!scope||!scope.querySelector('.Sidebar-itemList'))return null;
      const groups=[...scope.querySelectorAll('[role="group"][aria-label]')].filter(visible).map(el=>el.getAttribute('aria-label')).filter(label=>/subtotal|sous.total|\u0627\u0644\u0645\u062c\u0645\u0648\u0639 \u0627\u0644\u0641\u0631\u0639\u064a/i.test(label));
      return core.consensus(groups,checkout.getAttribute('aria-label'));
    }
    function update(){
      const cart=readCart();const signature=JSON.stringify(cart);
      if(signature!==previous){previous=signature;stableSince=Date.now();$('delivery').checked=false;$('deliverystep').textContent='Not confirmed';}
      latest=cart&&Date.now()-stableSince>=900?cart:null;
      const key=JSON.stringify([latest,rates]);
      if(key!==lastRender){
        lastRender=key;
        $('breakdown').hidden=!latest;
        if(latest){
          const q=core.quote(latest.minor,latest.currency,rates);
          $('amount').textContent=$('badge').textContent=dzd(q.bubble);
          $('status').textContent=`${latest.quantity} selected item(s) \u00b7 live Temu cart total`;
          $('status').className='status ok';
          $('cartstep').textContent=latest.quantity?'Subtotal detected; product details still need validation':'No selected items';
          const rows=[['Temu cart total',`${(latest.minor/100).toFixed(2)} ${latest.currency}`],['Exchange rate',`1 ${latest.currency} = ${q.rate/100} DZD`],['Converted cart',dzd(q.converted)],['Service fee \u00b7 8%',dzd(q.service)],['Estimate before card fee',dzd(q.bubble)],['Card fee \u00b7 2%',dzd(q.card)],['Estimate with card',dzd(q.total)]];
          $('breakdown').replaceChildren(...rows.map(([label,value],i)=>{const row=doc.createElement('div');row.className='row'+(i===6?' total':'');const a=doc.createElement('span'),b=doc.createElement('strong');a.textContent=label;b.textContent=value;row.append(a,b);return row;}));
        }else{
          $('amount').textContent=$('badge').textContent='\u2014 DZD';$('status').className='status';
          $('status').textContent=cart?'Cart updating\u2026':'Cart subtotal unavailable. Open the cart; no amount is being assumed.';
          $('cartstep').textContent='Waiting for a stable, readable cart';
        }
      }
      const signIn=[...doc.querySelectorAll('[role="button"][aria-label]')].some(el=>visible(el)&&/sign in.*register|sign in.*account|\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644\s*\/\s*\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628|connexion.*inscri/i.test(el.getAttribute('aria-label')));
      $('accountstep').textContent=signIn?'Temu is asking you to sign in':'Account status not verified \u2014 check on Temu';
    }
    const clickMerchant=selector=>{const el=[...doc.querySelectorAll(selector)].find(visible);if(el){el.click();toggle(false);return true;}return false;};
    $('cart').onclick=()=>{if(!clickMerchant('.Sidebar-GotoCartBtn'))$('status').textContent='Use Temu\u2019s cart button to open your cart.';};
    $('shipping').onclick=()=>{if(!latest?.quantity){$('deliverystep').textContent='Select items in your cart first.';return;}if(!clickMerchant('#SidebarCheckout,.g_p_sum_wr .checkoutButton'))$('deliverystep').textContent='Open checkout from Temu\u2019s cart.';};
    $('account').onclick=()=>{const buttons=[...doc.querySelectorAll('[role="button"],button')];const el=buttons.find(el=>visible(el)&&/sign in.*register|\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644\s*\/\s*\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628|connexion.*inscri/i.test(el.getAttribute('aria-label')||el.textContent));if(el){el.click();toggle(false);}else $('accountstep').textContent='Open Orders & account on Temu to sign in or register.';};
    $('delivery').onchange=()=>{$('deliverystep').textContent=$('delivery').checked?'Confirmed by you for this page; not independently verified':'Not confirmed';};
    $('rates').onclick=()=>{try{const next={USD:Math.round(Number($('usd').value)*100),EUR:Math.round(Number($('eur').value)*100)};core.quote(0,'USD',next);core.quote(0,'EUR',next);rates=next;try{page.sessionStorage.setItem('temby-rates',JSON.stringify(rates));}catch{}lastRender='';update();$('ratestatus').textContent='Rates applied.';}catch{$('ratestatus').textContent='Enter rates between 0.01 and 10,000 DZD.';}};
    function fill(selector,value){const fields=[...doc.querySelectorAll(selector)].filter(visible);if(fields.length!==1){$('mailstatus').textContent='Open the matching Temu registration field first. Fill it yourself if more than one field is shown.';return;}nativeSet.call(fields[0],value);fields[0].dispatchEvent(new page.Event('input',{bubbles:true}));fields[0].dispatchEvent(new page.Event('change',{bubbles:true}));$('mailstatus').textContent='Filled on Temu. Review it before continuing.';}
    $('fillEmail').onclick=()=>{if(!$('email').checkValidity()||!$('email').value){$('mailstatus').textContent='Enter a valid email address.';return;}fill('input[type="email"],input[autocomplete="email"]',$('email').value);};
    $('password').onclick=()=>{const bytes=page.crypto.getRandomValues(new Uint8Array(24));const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%';$('generated').value='Aa9!'+Array.from(bytes,b=>alphabet[b%alphabet.length]).join('');$('passwordrow').hidden=$('fillPassword').hidden=false;};
    $('fillPassword').onclick=()=>fill('input[type="password"]',$('generated').value);
    async function mail(path,method='GET'){
      if(!send)throw Error('Reopen the local proxy to connect the inbox.');
      return await new Promise((resolve,reject)=>{
        const channel=new page.MessageChannel();
        const timer=page.setTimeout(()=>{channel.port1.close();reject(Error('Inbox request timed out. Try again later.'));},25000);
        channel.port1.onmessage=event=>{page.clearTimeout(timer);channel.port1.close();const result=event.data;if(result?.ok)resolve(result.data);else reject(Error(result?.error||'Mailbox unavailable'));};
        send({tembyMail:method},[channel.port2]);
      });
    }
    async function mailAction(button,action){button.disabled=true;try{await action();}catch(error){$('mailstatus').textContent=error.message;}finally{button.disabled=false;}}
    $('newInbox').onclick=()=>mailAction($('newInbox'),async()=>{const data=await mail('','POST');$('email').value=data.address;$('messages').textContent='';$('mailstatus').textContent='Test inbox created for this local session. Use Fill email on Temu.';});
    $('checkInbox').onclick=()=>mailAction($('checkInbox'),async()=>{const data=await mail('');if(!$('email').value)$('email').value=data.address;$('mailstatus').textContent=data.address?'Checked '+data.address:'';$('messages').textContent=data.messages.length?data.messages.map(m=>`${m.from}\n${m.subject}\n${m.text}`).join('\n\n'):'No email received yet. Check again after Temu sends a code.';});
    // No full-page text scans, network interception, or password listeners.
    update();page.setInterval(()=>{if(!doc.hidden)update();},500);
  };
  if(page.document.readyState==='loading')page.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
};
