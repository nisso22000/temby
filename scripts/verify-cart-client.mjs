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
 if(url.pathname.endsWith('/cart_modify')){const request=JSON.parse(body.toString());if(request.race){staleReadQuantity=quantity;quantity++;await new Promise(r=>setTimeout(r,350));const packet=fullPacket();packet.result.cart_operate_info={success:true};return Response.json(packet);}quantity=Math.max(0,quantity-1);if(request.full){const packet=fullPacket(Date.now()-60000);packet.result.cart_operate_info={success:true};return Response.json(packet);}return Response.json({success:true,result:{cart_operate_info:{success:true}}});}
 if(url.pathname.endsWith('/user_cart_num'))return Response.json({success:true,result:{cart_sku_num_map:quantity?{'175000000':quantity}:{},cart_sku_detail_info_map:{cart_selected_sku_list:quantity?['175000000']:[]}}});
 const script=`window.rawData={stores:{store:{}}};setTimeout(()=>{const service={postRisk:async request=>{if(window.ownedClientThrows)throw Error('Owned client failure');if(window.ownedClientHangs)return new Promise(()=>{});return fetch(request.url,{method:'POST',headers:{'content-type':'application/json','x-owned-sdk':'1'},body:JSON.stringify(request.params)}).then(r=>r.json());}};window.__INITIAL_PROPS__=${nested?'{stores:{store:{$service:service}}}':'{store:{$service:service}}'};},400);`;
 return new Response('<!doctype html><h1>Owned delayed merchant bootstrap</h1><script>'+script+'</script>',{headers:{'content-type':'text/html','set-cookie':'session=owned-sdk-client; Path=/; Secure'}});
};
const servers=createServers(4240,4241,transport);servers.app.listen(4240,'127.0.0.1');servers.merchant.listen(4241,'127.0.0.1');await Promise.all([once(servers.app,'listening'),once(servers.merchant,'listening')]);
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
try{
 for(const mobile of [false,true]){
  quantity=0;reads=0;unsigned=0;refused=false;nested=mobile;staleReadQuantity=null;
  const context=await browser.newContext(mobile?devices['Pixel 7']:{});await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:4241/uv-service/'+encodeURIComponent('https://www.temu.com/index.html'));
  const count=n=>page.waitForFunction(n=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('count')?.textContent.startsWith(n+' '),n,{timeout:10000});
  const add=()=>page.evaluate(()=>fetch('/api/bg/bg-uranus-api/uranus_cart/single/operate_cart',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.json()));
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
  const countRequest=()=>page.evaluate(()=>fetch('/api/bg/bg-uranus-api/uranus_cart/user_cart_num').then(r=>r.json()));
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
  if(mobile){
   // The merchant cart can change while every TEMBY tab is closed. A later
   // tab must verify an old saved amount without a new add-to-cart action.
   await page.close();quantity=1;await new Promise(resolve=>setTimeout(resolve,30500));
   const previousReads=reads,returning=await context.newPage();
   await returning.goto('http://localhost:4241/uv-service/'+encodeURIComponent('https://www.temu.com/index.html'));
   await returning.waitForFunction(()=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('count')?.textContent.startsWith('1 '),null,{timeout:10000});
   assert.equal(reads,previousReads+1,'a returning browser refreshes its old saved cart once');assert.equal(unsigned,0);
  }
  results.push({mobile,delayedSDKStartup:true,fullSDKRead:true,addAndRemoveThroughZero:true,bubbleChangeRevalidated:true,fullDeleteResponseDirect:true,overlappingReadDoesNotLoseEdit:true,noUnsignedReads:true,noRefusalRetry:true,clientErrorReleased:true,...(!mobile?{stalledClientDeadline:true}:{}),navigationReleased:true,recovery:true,...(mobile?{returningTabRevalidated:true}:{}),reads});await context.close();
 }
}finally{await browser.close();for(const server of [servers.app,servers.merchant]){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
const out=new URL('../artifacts/improvements-v48/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('merchant-client-browser.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
