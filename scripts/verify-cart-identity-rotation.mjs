// Owned storefront: rotate a verification cookie during a real worker cart read.
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createServers} from '../src/server.ts';
const {chromium,devices}=createRequire(import.meta.url)('C:/Users/Mecro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const expectDiscard=process.argv.includes('--expect-discard'),fixture=JSON.parse(await readFile(new URL('../tests/fixtures/mobile-cart-bootstrap.json',import.meta.url),'utf8'));
let reads=0,quantity=0,authenticated=false;
const transport=async url=>{
 if(url.pathname.endsWith('/cart_modify_page')){
  reads++;await new Promise(resolve=>setTimeout(resolve,500));
  const value=structuredClone(fixture),total=quantity*2500;
  value.result.cartListInfo.goodsSkuList=quantity?[value.result.cartListInfo.goodsSkuList[0]]:[];if(quantity)value.result.cartListInfo.goodsSkuList[0].skuInfo.amount=quantity;
  value.result.cartListInfo.invalidGoodsLines=0;value.result.cartTransferMap.orderAmount=String(total);value.result.cartTransferMap.lastRequestTime=String(Date.now()-400);value.result.discountInfo.orderAmountDto={orderAmount:total,totalGoodsAmount:total,goodsDiscountAmount:0};
  return Response.json(value);
 }
 if(url.pathname.endsWith('/single/operate_cart')){quantity++;return Response.json({success:true,result:{success:true}});}
 const headers=new Headers({'content-type':'text/html'});headers.append('set-cookie','api_uid=owned-guest; Path=/; Secure');headers.append('set-cookie','verifyAuthToken=owned-proof-before; Path=/; Secure');
 if(authenticated){headers.append('set-cookie','AccessToken=owned-account; Path=/; Secure');headers.append('set-cookie','user_uin=owned-user; Path=/; Secure');}
 return new Response('<!doctype html><h1>Owned cart identity rotation fixture</h1>',{headers});
};
const servers=createServers(4230,4231,transport);servers.app.listen(4230,'127.0.0.1');servers.merchant.listen(4231,'127.0.0.1');await Promise.all([once(servers.app,'listening'),once(servers.merchant,'listening')]);
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
try{
 for(const mobile of [false,true])for(const auth of [false,true]){
  reads=0;quantity=0;authenticated=auth;const context=await browser.newContext(mobile?devices['Pixel 7']:{});
  await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  const page=await context.newPage(),traces=[];page.on('console',m=>{if(m.text().startsWith('[TEMBY cart]')&&m.args()[1])void m.args()[1].jsonValue().then(v=>traces.push(v)).catch(()=>{});});
  await page.goto('http://localhost:4231/uv-service/'+encodeURIComponent('https://www.temu.com/index.html'));
  const host=page.locator('#temby-companion');await page.waitForFunction(()=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('count')?.textContent.startsWith('0 '));
  await page.evaluate(()=>fetch('/api/bg/bg-uranus-api/uranus_cart/single/operate_cart',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.json()));
  for(let i=0;i<100&&reads<2;i++)await new Promise(r=>setTimeout(r,10));assert.equal(reads,2);
  await page.evaluate(()=>{document.cookie='verifyAuthToken=owned-proof-after; Path=/; Secure';});
  if(expectDiscard){
   for(let i=0;i<100&&!traces.some(t=>t.phase==='discarded');i++)await new Promise(r=>setTimeout(r,20));
   assert.ok(traces.some(t=>t.phase==='discarded'&&t.reason==='identity-changed-during-request'));
   assert.ok((await host.locator('#count').textContent()).startsWith('0 '));
  }else{
   await page.waitForFunction(()=>document.getElementById('temby-companion')?.shadowRoot?.getElementById('count')?.textContent.startsWith('1 '),{},{timeout:6000});
   assert.equal(await host.getAttribute('data-cart-issue'),null);
   assert.ok(!traces.some(t=>t.phase==='discarded'));
  }
  results.push({mobile,authenticated:auth,reads,verificationCookieRotated:true,discardReproduced:expectDiscard,amount:await host.locator('#badge').textContent()});await context.close();
 }
}finally{await browser.close();for(const server of [servers.app,servers.merchant]){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
const out=new URL('../artifacts/improvements-v45/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL(expectDiscard?'identity-rotation-before.json':'identity-rotation-after.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
