// Full browser regression on owned fixtures. No Temu connection is made.
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServers} from '../src/server.ts';
const require=createRequire(import.meta.url);
const {chromium,devices}=require('C:/Users/Mecro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=new URL('../artifacts/improvements-v48/',import.meta.url);await mkdir(out,{recursive:true});
const results={scope:'Owned fixtures only; no merchant requests or customer sessions',cases:[]};
let relayAssets=0,relayTelemetry=0;
const protectedScript="document.body.dataset.integrityScript=location.href.includes('temu.com')?'yes':'wrong';";
const integrity='sha256-'+createHash('sha256').update(protectedScript).digest('base64');
const payload={success:true,result:{cartListInfo:{checkoutExtendMap:{ckCartCcy:'EUR',ckCartLoginStatus:'1'},invalidGoodsLines:0,goodsSkuList:[{isSelected:1,baseGoodsInfo:{goodsId:601000001,goodsName:'Owned fixture'},skuInfo:{skuId:175000001,amount:1,skuPrice:2092}}]},cartTransferMap:{currency:'EUR',orderAmount:'2092'},discountInfo:{orderAmountDto:{orderAmount:2092,totalGoodsAmount:2092}},checkoutLayerTrackInfo:{strongThreshold:'3000'}}};
const emptyPayload=()=>{const empty=structuredClone(payload);empty.result.cartListInfo.goodsSkuList=[];empty.result.cartTransferMap.orderAmount='0';empty.result.discountInfo.orderAmountDto={orderAmount:0,totalGoodsAmount:0};return empty;};
let currentReadPayload=emptyPayload();
let initialCartPending=false;
const transport=async(url)=>{
 if(url.pathname==='/shopping_cart.html'&&url.searchParams.has('initial')){
  initialCartPending=true;
  return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><h1>Owned cart page full API response</h1><script>fetch("/api/bg/bg-uranus-api/uranus_cart/cart_modify_page",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})</script>',{headers:{'content-type':'text/html','set-cookie':'session=owned-fixture; Path=/; Secure; HttpOnly'}});
 }
 if(url.hostname.endsWith('.kwcdn.com')){relayAssets++;return new Response(url.pathname.endsWith('.js')?protectedScript:'body{}',{headers:{'content-type':url.pathname.endsWith('.js')?'text/javascript':'text/css'}});}
 if(url.hostname.includes('pftk')){relayTelemetry++;return new Response('unexpected');}
 if(url.pathname.startsWith('/api/')){
  if(url.pathname.endsWith('/cart_modify_page')){if(initialCartPending){initialCartPending=false;const initial=JSON.parse(await readFile(new URL('../tests/fixtures/mobile-cart-bootstrap.json',import.meta.url),'utf8'));initial.result.cartTransferMap.lastRequestTime=String(Date.now());currentReadPayload=initial;return Response.json(initial);}return Response.json(currentReadPayload);}
  if(url.pathname.endsWith('/user_cart_num'))return Response.json({success:true,result:{count:7}});
  if(url.pathname.endsWith('/fail'))return Response.json({success:false},{status:403});
  if(url.pathname.endsWith('/sold-out')){const cart=structuredClone(payload);cart.result.cartListInfo.goodsSkuList=Array.from({length:7},(_,i)=>({isSelected:i===5?0:1,baseGoodsInfo:{goodsId:601000000+i,goodsName:'Owned item '+i},skuInfo:{skuId:175000000+i,amount:i===5?0:1,skuPrice:450},...i===5?{invalidDescVo:{invalidType:'SKU_SOLD_OUT'}}:{}}));cart.result.cartListInfo.invalidGoodsLines=1;cart.result.cartTransferMap.orderAmount='2699';cart.result.cartTransferMap.lastRequestTime=String(Date.now());cart.result.discountInfo.orderAmountDto={orderAmount:2699,totalGoodsAmount:2699};cart.result.checkoutLayerTrackInfo.strongThreshold=2000;return Response.json(cart);}
  if(url.pathname.endsWith('/empty')){const empty=structuredClone(payload);empty.result.cartListInfo.goodsSkuList=[];empty.result.cartTransferMap.orderAmount='0';empty.result.discountInfo.orderAmountDto={orderAmount:0,totalGoodsAmount:0};return Response.json(empty);}
  currentReadPayload=payload;return Response.json(payload);
 }
 const login=url.pathname==='/login.html';
 const content=login?'<form><button type="button" aria-label="Continue with Google">Google</button><button type="button">Continue with Facebook</button><input type="email" aria-label="Email"></form>':'<main class="g_p_sum_wr"><span>Total</span><b>€20.92</b></main>';
 const scenario=url.pathname==='/database.html'?`const request=indexedDB.open('scdb',1);request.onupgradeneeded=()=>request.result.createObjectStore('entries');request.onsuccess=()=>{const db=request.result;const tx=db.transaction('entries','readwrite');tx.objectStore('entries').put({k:Date.now()+'-owned-EUR',d:${JSON.stringify(payload)}},'sc_cache');tx.oncomplete=()=>{db.close();document.body.dataset.received='yes';};};`:url.pathname==='/misleading.html'?`document.body.dataset.received='yes';`:url.pathname==='/fresh.html'?`fetch('/api/example/cart_modify/fail').then(()=>document.body.dataset.received='yes')`:`fetch('/api/example/cart_modify${url.pathname==='/empty.html'?'/empty':''}').then(r=>r.json()).then(()=>document.body.dataset.received='yes')`;
 return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Owned v40 regression</title><link rel="stylesheet" href="https://static.kwcdn.com/temby-owned.css"><h1>Owned regression, not Temu</h1>${content}<script src="https://static.kwcdn.com/temby-integrity.js" integrity="${integrity}" crossorigin="anonymous"></script><script>${scenario};fetch('https://eu.pftk.temu.com/report',{method:'POST',body:'owned'}).then(()=>document.body.dataset.telemetry='done')</script>`,{headers:{'content-type':'text/html; charset=utf-8','set-cookie':'session=owned-fixture; Path=/; Secure; HttpOnly'}});
};
const servers=createServers(4160,4161,transport,{filterMode:'balanced',directAssets:true});servers.app.listen(4160,'127.0.0.1');servers.merchant.listen(4161,'127.0.0.1');await Promise.all([once(servers.app,'listening'),once(servers.merchant,'listening')]);
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const mobile of [false,true]){
  currentReadPayload=emptyPayload();
  const context=await browser.newContext(mobile?devices['Pixel 7']:{viewport:{width:1366,height:900}});
  let directRequests=0;
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='static.kwcdn.com'){directRequests++;const script=url.pathname.endsWith('.js');return route.fulfill({status:200,contentType:script?'text/javascript':'text/css',headers:{'access-control-allow-origin':'*','cache-control':'public, max-age=3600'},body:script?protectedScript:'body{--temby-direct:1}'});}
   if(!['localhost','127.0.0.1'].includes(url.hostname))return route.abort();
   return route.continue();
  });
  const page=await context.newPage();const errors=[],cartLogs=[];page.on('pageerror',e=>errors.push(e.name));
  page.on('console',message=>{if(message.text().includes('[TEMBY cart]'))cartLogs.push(message.text());if(message.type()==='error')console.log('Owned fixture browser error:',message.text());});
  const visit=async path=>{await page.goto('http://localhost:4161/uv-service/'+encodeURIComponent('https://www.temu.com'+path));if(path!=='/login.html')await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-price-source')==='response',{},{timeout:15000});await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='false');};
  const go=async path=>{await page.goto('http://localhost:4161/uv-service/'+encodeURIComponent('https://www.temu.com'+path));await page.waitForFunction(()=>document.body.dataset.received==='yes');};
  await go('/fresh.html');
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-price-source')==='response');
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='false');
  const host=page.locator('#temby-companion');await host.locator('#bubble').click();
  assert.equal(await host.getAttribute('data-price-source'),'response');
  assert.equal(await host.getAttribute('data-cart-issue'),null,'fresh failed request must not claim a broken cart');
  assert.equal(await host.locator('#bubble').getAttribute('aria-busy'),'false','no cart amount to dim');
  assert.equal(await host.locator('#cartWarning').isVisible(),false);
  await go('/misleading.html');await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-price-source')==='response');assert.match(await host.locator('#amount').textContent(),/^0\D/,'the confirmed empty response wins over the misleading visible total');
  await go('/empty.html');await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='false');
  await host.locator('#bubble').click();assert.equal(await host.locator('#cartWarning').isVisible(),false,'empty cart has no minimum warning');
  await page.evaluate(()=>fetch('/api/example/cart_modify/fail').then(r=>r.text()));
  assert.equal(await host.getAttribute('data-cart-issue'),null,'failed empty-cart request is not a nonempty-cart update failure');
  await go('/database.html');await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-price-source')==='response',{},{timeout:12000});
  assert.match(await host.locator('#amount').textContent(),/^0\D/,'merchant storage cannot override the newer validated live response');
  assert.equal(await host.getAttribute('data-cart-issue'),null);
  await visit('/shopping_cart.html');
  await host.locator('#bubble').click();
  const warning=await host.locator('#cartWarning').textContent();assert.match(warning,/9,08|9\.08/);
  assert.match(await host.locator('#primary').textContent(),/Continuer mes achats/);
  await page.waitForFunction(()=>getComputedStyle(document.body).getPropertyValue('--temby-direct').trim()==='1');
  await page.waitForFunction(()=>document.body.dataset.integrityScript==='yes',{},{timeout:5000}).catch(async error=>{console.log(JSON.stringify({errors,relayAssets,directRequests,scripts:await page.locator('script[src]').evaluateAll(elements=>elements.map(el=>({src:el.getAttribute('src'),integrity:el.getAttribute('integrity'),virtualIntegrity:el.getAttribute('__uv-attr-integrity')}))),counts:await context.serviceWorkers()[0].evaluate(()=>self.__tembyResourceCounts)}));throw error;});
  if(relayAssets)console.log('Owned relay asset diagnostics:',JSON.stringify((await(await context.request.get('http://localhost:4161/_state')).json()).events.filter(event=>event.host.endsWith('.kwcdn.com'))));
  assert.ok(directRequests>0,'public stylesheet was requested natively');assert.equal(relayAssets,0,'direct stylesheet bypassed Node relay');assert.equal(relayTelemetry,0,'telemetry never reached upstream transport');
  await page.evaluate(()=>fetch('/api/example/cart_modify/fail').then(r=>r.text()));
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-cart-issue')==='http-error');
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('primary')?.textContent==='Ouvrir mon panier');
  const failureWarning=await host.locator('#cartWarning').textContent();assert.match(failureWarning,/actualiser/);
  await page.evaluate(()=>fetch('/api/example/cart_modify').then(r=>r.json()));
  await page.waitForFunction(()=>!document.getElementById('temby-companion')?.hasAttribute('data-cart-issue'));
  const updateStart=Date.now();
  await page.evaluate(()=>fetch('/api/example/cart_modify/sold-out').then(r=>r.json()));
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('count')?.textContent.startsWith('6 '),{},{timeout:1500});
  const soldOutUpdateMs=Date.now()-updateStart;
  const companionBounds=await host.boundingBox();
  assert.ok(companionBounds,'companion has visible bounds');
  if(mobile)assert.ok(companionBounds.y+companionBounds.height<=page.viewportSize().height-64,'mobile companion clears the bottom checkout controls');
  assert.ok(soldOutUpdateMs<1500,'accepted response has no eight-second hold');
  assert.equal(await host.locator('.item').count(),6,'six selected lines remain visible');
  assert.equal(await host.locator('#primary').textContent(),'Suivant','unselected sold-out line does not trap the user in cart review');
  assert.match(await host.locator('#cartWarning').textContent(),/non sélectionné/);
  assert.ok(cartLogs.length>0,'page console receives safe cart diagnostics');
  await page.evaluate(()=>fetch('/api/bg/bg-uranus-api/uranus_cart/merge').then(r=>r.json()));
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('count')?.textContent.startsWith('1 '),{},{timeout:1500});
  await page.evaluate(()=>fetch('/api/bg/bg-uranus-api/uranus_cart/user_cart_num').then(r=>r.json()));
  assert.equal(await host.getAttribute('data-cart-issue'),null,'count-only reply does not declare the valid snapshot broken');
  assert.match(await host.locator('#count').textContent(),/^1 /,'count-only reply cannot replace a complete selected quantity');
  const worker=context.serviceWorkers()[0];const counts=await worker.evaluate(()=>self.__tembyResourceCounts);
  assert.ok(counts.direct>=1);assert.ok(counts.blocked>=1);
  const cdp=await context.newCDPSession(page);await cdp.send('ServiceWorker.enable');await cdp.send('ServiceWorker.stopAllWorkers');
  await page.evaluate(({integrity})=>{document.body.dataset.integrityScript='';const script=document.createElement('script');script.integrity=integrity;script.crossOrigin='anonymous';script.src='https://static.kwcdn.com/temby-integrity.js';document.body.append(script);},{integrity});
  await page.waitForFunction(()=>document.body.dataset.integrityScript==='yes',{},{timeout:10000});await cdp.detach();
  assert.equal(relayAssets,0,'declared protected resource survives worker restart without relay rewriting');
  await page.screenshot({path:new URL((mobile?'mobile':'desktop')+'-cart.png',out).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  await visit('/login.html');
  assert.equal(await page.locator('#temby-email-signin-note').count(),0);
  assert.equal(await page.getByRole('button',{name:'Continue with Google'}).count(),1);assert.equal(await page.getByRole('button',{name:'Continue with Facebook'}).count(),1);
  await visit('/shopping_cart.html?initial=1');
  await host.locator('#bubble').click();
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('count')?.textContent.startsWith('8 '));
  assert.match(await host.locator('#count').textContent(),/^8 /,'full cart API supplies all eight selected lines');
  assert.match(await host.locator('#temuNet').textContent(),/421,06/);
  await visit('/misleading.html');
  assert.match(await host.locator('#count').textContent(),/^8 /,'product/listing navigation retains the verified cart without an API response');
  const restart=await context.newCDPSession(page);await restart.send('ServiceWorker.enable');await restart.send('ServiceWorker.stopAllWorkers');await restart.detach();
  await visit('/misleading.html');
  assert.match(await host.locator('#count').textContent(),/^8 /,'local cart database survives worker termination and page reload');
  await page.evaluate(()=>fetch('/api/example/cart_modify/fail').then(r=>r.text()));
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-cart-issue')==='http-error');
  await visit('/misleading.html');
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-cart-issue')==='http-error');
  results.cases.push({mode:mobile?'mobile':'desktop',freshVisitNoWarning:true,visibleTotalIgnored:true,emptyCartNoWarning:true,databaseCannotOverrideLive:true,bareEndpoint:'response',minimumWarning:warning,cartFailureWarning:failureWarning,directRequests,workerCounts:counts,pageErrors:errors,cartFamilyMergeObserved:true,countOnlyPreservesSnapshot:true,soldOutSevenLines:true,soldOutUpdateMs,cartConsoleEvents:cartLogs.length,providerUiUntouched:true,integrityAfterWorkerRestart:true,initialApiEightItems:true,cartSurvivesBrowsingAndWorkerRestart:true});
  await context.close();
 }
}finally{await browser.close();for(const server of [servers.app,servers.merchant]){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
await writeFile(new URL('browser-verification.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
