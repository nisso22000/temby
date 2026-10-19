// Internal DOM regression harness. This is never a merchant/storefront page.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const assetFiles:Record<string,string>={'/core.js':'companion-core.js','/cart.js':'companion-cart.js','/companion.js':'companion.js','/icon.js':'companion-icon.js','/network.js':'uv-network.js','/config.js':'uv-config.js'};
const checks=[
  {name:'Cart uses discounted total, not earlier subtotal',path:'/shopping_cart.html',html:'<main class="g_p_sum_wr"><div><span>Subtotal</span><b>€28.99</b></div><div><span>Discount</span><b>€8.07</b></div><div><span>Total</span><b>€20.92</b></div><button class="checkoutButton" aria-label="Checkout (4)"></button></main>',expected:2092},
  {name:'Checkout uses final EUR amount without item count',path:'/bgt_order_checkout.html',html:'<main><div><span>Order total</span><b>€20.92</b></div></main>',expected:2092},
  {name:'Arabic total supports split numeric/currency spans',path:'/bgt_order_checkout.html',html:'<main><div><span>الإجمالي</span><div><span>20.92</span><span>€</span></div></div></main>',expected:2092},
  {name:'Crossed-out original price does not conflict with net',path:'/shopping_cart.html',html:'<main class="g_p_sum_wr"><div><span>Total</span><s>€28.99</s><b>€20.92</b></div></main>',expected:2092},
  {name:'Hidden animation duplicate is ignored',path:'/shopping_cart.html',html:'<main class="g_p_sum_wr"><div><span>Total</span><b>€20.92</b><b aria-hidden="true">€28.99</b></div></main>',expected:2092},
  {name:'Subtotal-only full cart is not presented as payable',path:'/shopping_cart.html',html:'<main class="g_p_sum_wr"><div><span>Subtotal</span><b>€28.99</b></div></main>',expected:null},
  {name:'Conflicting explicit totals remain unavailable',path:'/bgt_order_checkout.html',html:'<main><div><span>Total</span><b>€20.92</b></div><div><span>Order total</span><b>€21.92</b></div></main>',expected:null}
];
const html=`<!doctype html><meta charset="utf-8"><title>TEMBY internal DOM regression</title><style>body{font:16px Arial;margin:30px}iframe{width:400px;height:100px;position:absolute;left:-2000px}li{margin:12px 0}.pass{color:green}.fail{color:red}</style><h1>TEMBY internal DOM regression</h1><p>This page contains synthetic test cases, not Temu.</p><ol id="results"></ol><p id="summary">Running…</p><script src="/core.js"></script><script src="/cart.js"></script><script>
(async()=>{let passed=0;for(const test of ${JSON.stringify(checks)}){const frame=document.createElement('iframe');document.body.append(frame);await new Promise(resolve=>{frame.onload=resolve;frame.srcdoc=test.html;});const child=frame.contentWindow;const reader=self.__tembyPageReader({document:child.document,getComputedStyle:child.getComputedStyle.bind(child),__uv:{meta:{url:{pathname:test.path}}}},self.__tembyCompanionCore);const result=reader();const actual=result?.minor??null;const ok=actual===test.expected;const li=document.createElement('li');li.className=ok?'pass':'fail';li.textContent=(ok?'PASS: ':'FAIL: ')+test.name+' (actual '+actual+')';document.getElementById('results').append(li);if(ok)passed++;frame.remove();}document.getElementById('summary').textContent=passed+' / '+${checks.length}+' passed';})();</script>`;
// A visibly labelled, separate-origin UI fixture. Never served by npm start.
const preview=`<!doctype html><html lang="ar"><meta charset="utf-8"><title>TEMBY internal UI regression</title><style>body{font:16px Arial;background:#f5f7fa;margin:35px;color:#38536a}main{margin-left:420px}h1{font-size:20px}</style><main><h1>Internal companion regression</h1><p>Synthetic cart data. This is not Temu.</p><p>20 example items, EUR 20.92 net.</p></main><script src="/core.js"></script><script src="/cart.js"></script><script src="/icon.js"></script><script src="/companion.js"></script><script>
(async()=>{
 const mode=new URL(location.href).searchParams.get('page');const path=mode==='cart'?'/shopping_cart.html':mode==='login'?'/login.html':mode==='account'||mode==='empty'||mode==='unavailable'?'/':'/address.html';
 window.__uv={meta:{url:new URL('https://www.temu.com'+path)},rewriteUrl:url=>url};
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('https://www.temu.com@scdb',1);r.onupgradeneeded=()=>r.result.createObjectStore('entries');r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
 const row={k:Date.now()+'-test-EUR-ar',d:{success:true,result:{cartListInfo:{checkoutExtendMap:{ckCartCcy:'EUR',ckCartLoginStatus:'1'},invalidGoodsLines:0,goodsSkuList:Array.from({length:20},(_,i)=>({isSelected:1,baseGoodsInfo:{goodsId:601000000+i,goodsName:'منتج للتجربة '+(i+1)},skuInfo:{skuId:175000000+i,amount:1,skuQuantity:99,skuPrice:i===0?192:100,skuSpec:[{specKey:'اللون',specValue:'أزرق'}]}}))},cartTransferMap:{currency:'EUR',orderAmount:'2092'},discountInfo:{orderAmountDto:{totalGoodsAmount:2899,orderAmount:2092,goodsDiscountAmount:807}}}}};
 if(mode==='empty'){row.d.result.cartListInfo.goodsSkuList=[];row.d.result.cartTransferMap.orderAmount='0';Object.assign(row.d.result.discountInfo.orderAmountDto,{orderAmount:0,totalGoodsAmount:0,goodsDiscountAmount:0});}
 if(mode==='account'||mode==='login'){row.d.result.cartListInfo.checkoutExtendMap.ckCartLoginStatus='0';row.d.result.cartListInfo.invalidGoodsLines=1;row.d.result.checkoutLayerTrackInfo={strongThreshold:99999};}
 await new Promise((resolve,reject)=>{const tx=db.transaction('entries','readwrite');if(mode==='unavailable')tx.objectStore('entries').clear();else tx.objectStore('entries').put(row,'sc_cache');tx.oncomplete=resolve;tx.onerror=reject;});db.close();
 if(path==='/shopping_cart.html'){const cart=document.createElement('section');cart.className='g_p_sum_wr';cart.style.marginLeft='420px';cart.innerHTML='<div><span>Total</span><b>€20.92</b></div><button class="checkoutButton" aria-label="Checkout (20)">Internal cart count</button>';document.body.append(cart);}
 let clientPage=window;
 if(mode==='account'||mode==='login'){
   const bridge=new EventTarget(),controller={};const navigatorFacade={serviceWorker:{controller,addEventListener:bridge.addEventListener.bind(bridge)},clipboard:navigator.clipboard};
   const form=document.createElement('form');form.style.marginLeft='420px';form.innerHTML='<label>Email <input aria-label="Email" type="text"></label><br><label>New password <input aria-label="New password" type="password" autocomplete="new-password"></label><button type="submit">Internal registration submit</button>';
   form.oninput=()=>{form.dataset.passwordLength=String(form.querySelector('input[type=password]').value.length);};
   if(mode==='login')document.body.append(form);
   form.onsubmit=event=>{event.preventDefault();document.body.dataset.submitted='yes';};
   const login=document.createElement('button');login.textContent='Sign in / Register';login.style.marginLeft='420px';login.onclick=()=>{document.body.append(form);};document.body.append(login);
   const WorkerFacade={prototype:{postMessage(message,ports){if(message.tembyMail)ports[0].postMessage({ok:true,data:message.tembyMail==='POST'?{address:'temby-'+ 'a'.repeat(36)+'@catchmail.io'}:{messages:[]}});}}};
   clientPage=new Proxy(window,{get(target,key){if(key==='top')return clientPage;if(key==='navigator')return navigatorFacade;if(key==='ServiceWorker')return WorkerFacade;const value=Reflect.get(target,key,target);return typeof value==='function'&&['setInterval','setTimeout','clearInterval','clearTimeout','getComputedStyle','addEventListener'].includes(key)?value.bind(target):value;}});
 }
 if(mode==='unavailable'){sessionStorage.removeItem('temby-order-intent');sessionStorage.removeItem('temby-test-setup');}
 self.__tembyConfigureCompanion(clientPage,{open:indexedDB.open});
 const simulation=document.createElement('button');simulation.textContent='Run 4-second cache-gap regression';simulation.style.marginLeft='420px';document.body.append(simulation);
 simulation.onclick=async()=>{
   simulation.disabled=true;let blank=false,dimmed=false;
   const root=()=>document.getElementById('temby-companion')?.shadowRoot;
   const monitor=setInterval(()=>{const r=root();if(!r)return;blank||=r.getElementById('badge').textContent.includes('—');dimmed||=getComputedStyle(r.getElementById('badge')).opacity!=='1'&&getComputedStyle(r.querySelector('.tag')).opacity==='1';},100);
   const write=async(clear)=>{const database=await new Promise(resolve=>{const r=indexedDB.open('https://www.temu.com@scdb');r.onsuccess=()=>resolve(r.result);});await new Promise(resolve=>{const tx=database.transaction('entries','readwrite');const store=tx.objectStore('entries');if(clear)store.clear();else store.put(row,'sc_cache');tx.oncomplete=resolve;});database.close();};
   document.querySelector('.g_p_sum_wr')?.remove();await write(true);
   setTimeout(async()=>{row.k=Date.now()+'-test-EUR-ar';row.d.result.cartTransferMap.orderAmount='2200';row.d.result.discountInfo.orderAmountDto.orderAmount=2200;row.d.result.discountInfo.orderAmountDto.goodsDiscountAmount=699;await write(false);setTimeout(()=>{clearInterval(monitor);const ok=!blank&&dimmed&&root().getElementById('badge').textContent.includes('534');document.body.dataset.transitionResult=ok?'passed':'failed';simulation.textContent='Cache gap: '+(ok?'PASS':'FAIL')+' (blank='+blank+', amount-only dim='+dimmed+')';},3000);},4000);
 };
})();</script></html>`;
const frameCheck=`<!doctype html><meta charset="utf-8"><title>Internal cross-origin window regression</title><h1>Internal cross-origin window regression</h1><p>Synthetic sandbox frame, not Temu.</p><p id="result">Running…</p><script src="/bundle.js"></script><script src="/network.js"></script><script src="/config.js"></script><script>
(async()=>{
 const frame=document.createElement('iframe');frame.sandbox='allow-scripts';document.body.append(frame);
 await new Promise(resolve=>{frame.onload=resolve;frame.srcdoc='<script>onmessage=()=>parent.postMessage("temby-frame-echo","*")<\\/script>';});
 let reproduced=false;try{frame.contentWindow.__uv$setSource({}).postMessage({},'*');}catch(e){reproduced=e.name==='SecurityError';}
 const uv=new self.Ultraviolet(self.__uv$config);uv.meta={origin:location.origin,url:new URL('https://fixture.temby.invalid/'),base:new URL('https://fixture.temby.invalid/')};self.__uv=uv;self.ownedFrame=frame;
 const received=new Promise(resolve=>addEventListener('message',e=>{if(e.source===frame.contentWindow&&e.data==='temby-frame-echo')resolve(true);}));
 try{(0,eval)(uv.rewriteJS('ownedFrame.contentWindow.postMessage({kind:"test"},"*")'));await received;document.getElementById('result').textContent=reproduced?'PASS: original helper access failed; corrected native postMessage succeeded':'FAIL: baseline not reproduced';}catch(e){document.getElementById('result').textContent='FAIL: '+e.name;}
})();</script>`;
const server=createServer(async(req,res)=>{const path=new URL(req.url||'/','http://localhost').pathname;const file=assetFiles[path];const body=path==='/bundle.js'?await readFile(new URL('../node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.bundle.js',import.meta.url),'utf8'):file?await readFile(new URL('../public/'+file,import.meta.url),'utf8'):path==='/'?html:path==='/preview'?preview:path==='/frame-check'?frameCheck:null;if(body===null){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':file||path==='/bundle.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8','cache-control':'no-store'});res.end(body);});
server.listen(0,'127.0.0.1',()=>{const address=server.address();if(address&&typeof address==='object')console.log('Internal DOM test: http://localhost:'+address.port+'/');});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>server.close());
