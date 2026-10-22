// Owned browser/merchant only. Full cart reads require the page's SDK marker.
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createServers} from '../src/server.ts';
const {chromium,devices}=createRequire(import.meta.url)('C:/Users/Mecro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const original=JSON.parse(await readFile(new URL('../tests/fixtures/mobile-cart-bootstrap.json',import.meta.url),'utf8'));
let quantity=0,reads=0,unsigned=0,refused=false,nested=true,staleReadQuantity=null;
const fullPacket=(merchantTime=Date.now()-400,units=quantity)=>{
 const value=structuredClone(original),total=units*2500;value.result.cartListInfo.goodsSkuList=units?[value.result.cartListInfo.goodsSkuList[0]]:[];if(units)value.result.cartListInfo.goodsSkuList[0].skuInfo.amount=units;
 value.result.cartListInfo.invalidGoodsLines=0;value.result.cartTransferMap.orderAmount=String(total);value.result.cartTransferMap.lastRequestTime=String(merchantTime);value.result.discountInfo.orderAmountDto={orderAmount:total,totalGoodsAmount:total,goodsDiscountAmount:0};return value;
};
const transport=async(url,method,headers,body)=>{
 if(url.pathname.endsWith('/cart_modify_page')){
  reads++;if(headers['x-owned-sdk']!=='1'){unsigned++;return Response.json({success:false},{status:403});}
  const request=JSON.parse(body.toString());assert.equal(request.cart_modify_type,1);assert.equal(request.modify_goods_list,undefined);
  if(refused)return Response.json({success:false},{status:403});await new Promise(r=>setTimeout(r,150));
  if(staleReadQuantity!==null){const value=fullPacket(Date.now()-400,staleReadQuantity);staleReadQuantity=null;return Response.json(value);}
  return Response.json(fullPacket());
 }
 if(url.pathname.endsWith('/single/operate_cart')){quantity++;return Response.json({success:true,result:{success:true}});}
 if(url.pathname.endsWith('/cart_modify')){const request=JSON.parse(body.toString());if(request.cart_modify_type===1){reads++;return refused?Response.json({success:false},{status:403}):Response.json(fullPacket());}if(request.race){staleReadQuantity=quantity;quantity++;await new Promise(r=>setTimeout(r,350));const packet=fullPacket();packet.result.cart_operate_info={success:true};return Response.json(packet);}quantity=Math.max(0,quantity-1);if(request.full){const packet=fullPacket(Date.now()-60000);packet.result.cart_operate_info={success:true};return Response.json(packet);}return Response.json({success:true,result:{cart_operate_info:{success:true}}});}
 if(url.pathname.endsWith('/user_cart_num'))return Response.json({success:true,result:{cart_sku_num_map:quantity?{'175000000':quantity}:{},cart_sku_detail_info_map:{cart_selected_sku_list:quantity?['175000000']:[]}}});
 const script=`window.rawData={stores:{store:{}}};setTimeout(()=>{const service={postRisk:async request=>{if(window.ownedClientThrows)throw Error('Owned client failure');if(window.ownedClientHangs)return new Promise(()=>{});const value=await fetch(request.url,{method:'POST',headers:{'content-type':'application/json','x-owned-sdk':'1'},body:JSON.stringify(request.params)}).then(r=>r.json());if(window.ownedClientAfterReply==='throw')throw Error('SDK failed after response');return window.ownedClientAfterReply==='wrapped'?{data:value}:value;}};window.__INITIAL_PROPS__=${nested?'{stores:{store:{$service:service}}}':'{store:{$service:service}}'};},400);`;
 const cartLoad=url.pathname==='/shopping_cart.html'?`fetch('/dz/api/bg/bg-uranus-api/uranus_cart/cart_modify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cart_modify_type:1})});`:'';
 return new Response('<!doctype html><meta charset="utf-8"><h1>Owned delayed merchant bootstrap</h1><script>'+cartLoad+script+'</script>',{headers:{'content-type':'text/html; charset=utf-8','set-cookie':'session=owned-sdk-client; Path=/; Secure'}});
};
const servers=createServers(4240,4241,transport);servers.app.listen(4240,'127.0.0.1');servers.merchant.listen(4241,'127.0.0.1');await Promise.all([once(servers.app,'listening'),once(servers.merchant,'listening')]);
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
try{
 for(const mobile of [false,true]){
  quantity=0;reads=0;unsigned=0;refused=false;nested=mobile;staleReadQuantity=null;
  const context=await browser.newContext(mobile?devices['Pixel 7']:{});await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:4241/uv-service/'+encodeURIComponent('https://www.temu.com/index.html'));
  const count=n=>page.waitForFunction(n=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('count')?.textContent.startsWith(n+' '),n,{timeout:10000});
  const apiPrefix=mobile?'/dz/api/':'/api/';
  const add=()=>page.evaluate(prefix=>fetch(prefix+'bg/bg-uranus-api/uranus_cart/single/operate_cart',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.json()),apiPrefix);
  await count(0);assert.equal(reads,1);assert.equal(unsigned,0,'initial read waits for the merchant client');
  await add();await count(1);assert.equal(reads,2);assert.equal(unsigned,0);
  await page.evaluate(()=>fetch('/api/bg/bg-uranus-api/uranus_cart/cart_modify',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.json()));await count(0);assert.equal(reads,3);
  refused=true;await add();await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-cart-issue')==='http-error');assert.equal(reads,4,'refused SDK read is not repeated through another transport');
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='false');assert.equal(unsigned,0);
  refused=false;await add();await count(2);
  await page.evaluate(()=>window.ownedClientThrows=true);const before=reads;await add();await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-cart-issue')==='client-error');assert.equal(reads,before,'client failure cannot silently fall back to another request');
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='false');
  await page.evaluate(()=>window.ownedClientThrows=false);await add();await count(4);assert.equal(unsigned,0);assert.deepEqual(errors,[]);
  if(!mobile){
   await page.evaluate(()=>window.ownedClientHangs=true);await add();
   await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='true');
   const beforeTimeout=reads;
   await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='false',{},{timeout:20000});
   assert.equal(reads,beforeTimeout,'a stalled client times out without a fallback request');
   assert.equal(await page.locator('#temby-companion').getAttribute('data-cart-issue'),'client-error');
   await page.evaluate(()=>window.ownedClientHangs=false);await add();await count(6);
  }
  await page.evaluate(()=>window.ownedClientHangs=true);await add();
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='true');
  const navigationStarted=Date.now();await page.goto('http://localhost:4241/uv-service/'+encodeURIComponent('https://www.temu.com/goods.html'));
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='false',{},{timeout:5000});
  await context.serviceWorkers()[0].evaluate(async()=>{for(let i=0;i<50&&cartReadFlights.size;i++)await new Promise(r=>setTimeout(r,20));if(cartReadFlights.size)throw Error('Read flight leaked after navigation');});
  assert.ok(Date.now()-navigationStarted<5000,'page departure releases the bridge without the 18-second timeout');
  await page.waitForFunction(()=>typeof window.__INITIAL_PROPS__?.stores?.store?.$service?.postRisk==='function'||typeof window.__INITIAL_PROPS__?.store?.$service?.postRisk==='function');
  await add();await count(mobile?6:8);assert.equal(unsigned,0);
  const countRequest=()=>page.evaluate(prefix=>fetch(prefix+'bg/bg-uranus-api/uranus_cart/user_cart_num').then(r=>r.json()),apiPrefix);
  const beforeCount=reads;await countRequest();assert.equal(reads,beforeCount,'matching bubble count causes no merchant cart read');
  quantity++;await countRequest();await count(mobile?7:9);assert.equal(reads,beforeCount+1,'changed bubble contents trigger one full merchant cart read');
  const beforeFullDelete=reads;
  await page.evaluate(()=>fetch('/api/bg/bg-uranus-api/uranus_cart/cart_modify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({full:true})}).then(r=>r.json()));
  await count(mobile?6:8);assert.equal(reads,beforeFullDelete,'a full delete response updates directly without a second read');
  const beforeRace=quantity,beforeRaceReads=reads;
  const edit=page.evaluate(()=>fetch('/api/bg/bg-uranus-api/uranus_cart/cart_modify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({race:true})}).then(r=>r.json()));
  await new Promise(resolve=>setTimeout(resolve,50));
  const overlappingRead=page.evaluate(()=>{
   const service=(window.__INITIAL_PROPS__?.stores?.store??window.__INITIAL_PROPS__?.store).$service;
   return service.postRisk({url:'/api/bg/bg-uranus-api/uranus_cart/cart_modify_page',params:{api_version:1,cart_modify_type:1,cart_scene:0,extra_config:{req_read_flag:2}},config:{timeout:15000,useRiskDialog:false}});
  });
  await Promise.all([edit,overlappingRead]);await count(beforeRace+1);
  assert.equal(reads,beforeRaceReads+1,'overlapping read completed');
  for(const mode of ['wrapped','throw']){
   await page.evaluate(mode=>window.ownedClientAfterReply=mode,mode);
   await add();await count(quantity);
   await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='false');
   assert.equal(await page.locator('#temby-companion').getAttribute('data-cart-issue'),null,'validated network response survives SDK '+mode);
  }
  await page.evaluate(()=>delete window.ownedClientAfterReply);
  // On an already-open cart, the recovery action must reload the document.
  await page.goto('http://localhost:4241/uv-service/'+encodeURIComponent('https://www.temu.com/shopping_cart.html'));
  await count(quantity);await page.waitForFunction(()=>!!window.__INITIAL_PROPS__);
  refused=true;const beforeRefusal=reads;await add();
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-cart-issue')==='http-error');
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='false');
  assert.equal(reads,beforeRefusal+1,'a refused cart read does not automatically retry');
  const host=page.locator('#temby-companion');await host.locator('#bubble').click();
  assert.match(await host.locator('#primary').textContent(),/Actualiser|نحدّث/);
  assert.match(await host.locator('#cartWarning').textContent(),/vérification|التحقق/);
  refused=false;const beforeReload=reads;
  await Promise.all([page.waitForEvent('load'),host.locator('#primary').click()]);
  await page.waitForFunction(()=>!document.getElementById('temby-companion')?.hasAttribute('data-cart-issue')&&document.getElementById('temby-companion')?.getAttribute('data-updating')==='false');
  await count(quantity);assert.equal(reads,beforeReload+1,'recovery refreshes the cart once');
  assert.equal(await host.locator('#panel').isVisible(),true,'recovery keeps the companion panel open');
  if(mobile){
   // The merchant cart can change while every TEMBY tab is closed. A later
   // tab must verify an old saved amount without a new add-to-cart action.
   await page.close();quantity=1;await new Promise(resolve=>setTimeout(resolve,30500));
   const previousReads=reads,returning=await context.newPage();
   await returning.goto('http://localhost:4241/uv-service/'+encodeURIComponent('https://www.temu.com/index.html'));
   await returning.waitForFunction(()=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('count')?.textContent.startsWith('1 '),null,{timeout:10000});
   assert.equal(reads,previousReads+1,'a returning browser refreshes its old saved cart once');assert.equal(unsigned,0);
  }
  results.push({mobile,localizedMutations:mobile,delayedSDKStartup:true,fullSDKRead:true,addAndRemoveThroughZero:true,bubbleChangeRevalidated:true,fullDeleteResponseDirect:true,overlappingReadDoesNotLoseEdit:true,wrappedAndThrownSDKReply:true,cartPageReloadRecovery:true,noUnsignedReads:true,noRefusalRetry:true,clientErrorReleased:true,...(!mobile?{stalledClientDeadline:true}:{}),navigationReleased:true,recovery:true,...(mobile?{returningTabRevalidated:true}:{}),reads});await context.close();
 }
}finally{await browser.close();for(const server of [servers.app,servers.merchant]){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
const out=new URL('../artifacts/improvements-v49/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('merchant-client-browser.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
