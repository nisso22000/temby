// Owned storefront/API only: cold homepage, mobile wire format and cart changes.
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createServers} from '../src/server.ts';
const require=createRequire(import.meta.url);
const {chromium,devices}=require('C:/Users/Mecro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const original=JSON.parse(await readFile(new URL('../tests/fixtures/mobile-cart-bootstrap.json',import.meta.url),'utf8'));
const snake=value=>Array.isArray(value)?value.map(snake):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),snake(v)])):value;
let reads=0,cartDocuments=0,quantity=8,refused=false;
const transport=async(url,method,headers,body)=>{
 if(url.pathname==='/shopping_cart.html'){cartDocuments++;throw Error('Cart page must not be requested');}
 if(url.pathname.endsWith('/cart_modify_page')){
  const operation=JSON.parse(body.toString());assert.equal(operation.cart_modify_type,1);assert.equal(operation.extra_config.req_read_flag,2);assert.equal(operation.modify_goods_list,undefined);
  reads++;if(refused)return Response.json({success:false,error_code:40001},{status:403});
  await new Promise(resolve=>setTimeout(resolve,300));
  const packet=structuredClone(original);packet.result.cartListInfo.goodsSkuList[0].skuInfo.amount=quantity-7;
  if(quantity<8){packet.result.cartListInfo.goodsSkuList=quantity?[packet.result.cartListInfo.goodsSkuList[0]]:[];if(quantity)packet.result.cartListInfo.goodsSkuList[0].skuInfo.amount=quantity;packet.result.cartListInfo.invalidGoodsLines=0;}
  const total=quantity<8?quantity*2500:42106+(quantity-8)*2500;packet.result.discountInfo.orderAmountDto={orderAmount:total,totalGoodsAmount:total,goodsDiscountAmount:0};packet.result.cartTransferMap.orderAmount=String(total);packet.result.cartTransferMap.lastRequestTime=String(Date.now()-400);
  return Response.json(snake(packet));
 }
 if(url.pathname.endsWith('/ack')||url.pathname.endsWith('/refuse')){if(url.pathname.endsWith('/refuse'))refused=true;else quantity++;return Response.json({success:true,result:{cart_operate_info:{success:true}}});}
 if(url.pathname.endsWith('/cart_modify/remove')){quantity=Math.max(0,quantity-1);return Response.json({success:true,result:{cart_operate_info:{success:true}}});}
 if(/\/(?:single\/operate_cart|batch\/add_cart|remove_and_add)$/.test(url.pathname)){quantity++;return Response.json({success:true,result:{cart_operate_info:{success:true}}});}
 if(url.pathname.endsWith('/user_cart_num'))return Response.json({success:true,result:{count:quantity}});
 return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><h1>Owned storefront; no cart data or merchant fetch scripts</h1>',{headers:{'content-type':'text/html','set-cookie':'session=owned-startup; Path=/; Secure; HttpOnly'}});
};
const servers=createServers(4210,4211,transport);servers.app.listen(4210,'127.0.0.1');servers.merchant.listen(4211,'127.0.0.1');await Promise.all([once(servers.app,'listening'),once(servers.merchant,'listening')]);
const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
try{
 for(const mobile of [false,true]){
  reads=0;quantity=8;refused=false;
  const context=await browser.newContext(mobile?devices['Pixel 7']:{viewport:{width:1366,height:900}});
  await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const visit=async path=>{await page.goto('http://localhost:4211/uv-service/'+encodeURIComponent('https://www.temu.com'+path));await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-price-source')==='response',{},{timeout:15000});};
  const count=async n=>page.waitForFunction(n=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('count')?.textContent.startsWith(n+' '),n,{timeout:10000});
  await visit('/index.html');await count(8);assert.equal(reads,1,'cold homepage initializes from one read-only API call');assert.equal(cartDocuments,0);
  await visit('/goods.html');await count(8);assert.equal(reads,1,'ordinary navigation does not poll the merchant');
  const mutate=path=>page.evaluate(path=>fetch('/api/example/cart_modify/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cart_modify_type:2})}).then(r=>r.json()),path);
  await mutate('ack');await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='true');
  assert.equal(await page.locator('#temby-companion').locator('#primary').isDisabled(),true,'cannot advance using the old amount while the changed cart is being read');
  await count(9);assert.equal(reads,2,'successful partial acknowledgement triggers one full read');
  await page.evaluate(()=>fetch('/api/bg/bg-uranus-api/uranus_cart/user_cart_num').then(r=>r.json()));assert.equal(reads,2,'count-only replies do not trigger reads');
  const beforeBurst=reads;await Promise.all(Array.from({length:4},()=>mutate('ack')));await count(13);
  await context.serviceWorkers()[0].evaluate(async()=>{for(let i=0;i<40&&cartReadFlights.size;i++)await new Promise(resolve=>setTimeout(resolve,25));});
  assert.ok(reads-beforeBurst<=2,'a burst shares a read and at most one follow-up for a later change');
  const failureRead=reads+1;
  await mutate('refuse');await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-cart-issue')==='http-error');assert.equal(reads,failureRead);
  await visit('/index.html');await count(13);assert.equal(reads,failureRead,'refusal is not retried by navigation');
  await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-cart-issue')==='http-error');
  assert.deepEqual(errors,[]);
  results.push({mobile,coldHomepage:true,noCartPage:true,partialMutationRefresh:true,burstReads:reads-beforeBurst-1,noCountPolling:true,noRefusalRetry:true,reads,cartDocuments});
  await context.close();
  reads=0;quantity=0;refused=false;
  const fresh=await browser.newContext(mobile?devices['Pixel 7']:{});
  await fresh.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  const empty=await fresh.newPage();await empty.goto('http://localhost:4211/uv-service/'+encodeURIComponent('https://www.temu.com/index.html'));
  const emptyCount=n=>empty.waitForFunction(n=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('count')?.textContent.startsWith(n+' '),n,{timeout:10000});
  await emptyCount(0);assert.equal(reads,1);
  let previousAmount=await empty.locator('#temby-companion').locator('#badge').textContent();
  for(const [index,endpoint] of ['single/operate_cart','batch/add_cart','remove_and_add'].entries()){
   await empty.evaluate(endpoint=>fetch('/api/bg/bg-uranus-api/uranus_cart/'+endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({api_version:24})}).then(r=>r.json()),endpoint);
   await emptyCount(index+1);assert.equal(reads,index+2,'mobile mutation with no cart_modify_type triggers a full read');
   const nextAmount=await empty.locator('#temby-companion').locator('#badge').textContent();assert.notEqual(nextAmount,previousAmount,'the visible amount must change as well as the count');previousAmount=nextAmount;
  }
  for(const expected of [2,1,0]){
   await empty.evaluate(()=>fetch('/api/bg/bg-uranus-api/uranus_cart/cart_modify/remove',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cart_modify_type:3})}).then(r=>r.json()));
   await emptyCount(expected);
   const nextAmount=await empty.locator('#temby-companion').locator('#badge').textContent();assert.notEqual(nextAmount,previousAmount,'removing an item must update the displayed amount');previousAmount=nextAmount;
  }
  assert.equal(reads,7,'each accepted add/remove gets one full read');
  results.push({mobile,freshEmptyCartThenMobileMutations:true,removalsThroughEmptyCart:true,reads,cartDocuments});await fresh.close();
  reads=0;quantity=0;refused=false;
  const stale=await browser.newContext(mobile?devices['Pixel 7']:{});
  await stale.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  const stalePage=await stale.newPage(),home='http://localhost:4211/uv-service/'+encodeURIComponent('https://www.temu.com/index.html');
  await stalePage.goto(home);await stalePage.waitForFunction(()=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('count')?.textContent.startsWith('0 '));
  refused=true;
  const add=()=>stalePage.evaluate(()=>fetch('/api/bg/bg-uranus-api/uranus_cart/single/operate_cart',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.json()));
  await add();await stalePage.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-cart-issue')==='http-error');
  assert.equal(reads,2,'a refused read after a confirmed add ends after one attempt');
  await stalePage.goto(home);await stalePage.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-cart-issue')==='http-error');assert.equal(reads,2,'the stale empty-cart warning survives navigation without retrying');
  refused=false;await add();await stalePage.waitForFunction(()=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('count')?.textContent.startsWith('2 '));
  assert.equal(await stalePage.locator('#temby-companion').getAttribute('data-cart-issue'),null,'a later confirmed snapshot clears the warning');
  results.push({mobile,emptyCartChangedReadRefusedVisible:true,warningSurvivesNavigation:true,laterAddRecovers:true,reads});await stale.close();
 }
 reads=0;refused=true;
 const denied=await browser.newContext();const page=await denied.newPage();
 await denied.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const home='http://localhost:4211/uv-service/'+encodeURIComponent('https://www.temu.com/index.html');
 await page.goto(home);for(let i=0;i<80&&reads===0;i++)await new Promise(resolve=>setTimeout(resolve,25));assert.equal(reads,1);
 await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='false');
 await page.reload();await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='false');
 const cdp=await denied.newCDPSession(page);await cdp.send('ServiceWorker.enable');await cdp.send('ServiceWorker.stopAllWorkers');await cdp.detach();
 await page.reload();await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-updating')==='false');
 assert.equal(reads,1,'a refused cold-start read is not retried by navigation or worker restart');
 results.push({coldRefusedNoNavigationRetry:true,reads});await denied.close();
}finally{await browser.close();for(const server of [servers.app,servers.merchant]){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
const out=new URL('../artifacts/improvements-v46/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('fallback-startup-browser.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
