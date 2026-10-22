import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('successful mobile mutation acknowledgements request fresh facts without an operation field',async()=>{
  const notices:any[]=[],origin='http://localhost:3001';
  const self:any={addEventListener(){},clients:{matchAll:async()=>[{url:origin+'/uv-service/'+encodeURIComponent('https://www.temu.com/goods.html'),postMessage(value:any){if(!value.tembyCartTrace)notices.push(value);}}]}};
  class Engine {on(){}}
  const context={self,UVServiceWorker:Engine,location:{origin},__uv$config:{},importScripts(){},URL,Response,TextDecoder,encodeURIComponent,decodeURIComponent};
  for(const file of ['uv-request.js','companion-cart.js','uv-sw.js'])vm.runInNewContext(await readFile(new URL('../public/'+file,import.meta.url),'utf8'),context);
  const base='https://www.temu.com/api/bg/bg-uranus-api/uranus_cart/';
  for(const prefix of [base,base.replace('/api/','/dz/api/')])for(const endpoint of ['single/operate_cart','batch/add_cart','remove_and_add'])await self.__tembyObserveCartResponse(prefix+endpoint,Response.json({success:true,result:{cart_operate_info:{success:true}}}),1,Date.now(),null,null);
  assert.equal(notices.length,6);assert.ok(notices.every(n=>Number.isSafeInteger(n.tembyCartNeedsRead?.time)));
  await self.__tembyObserveCartResponse(base+'single/operate_cart',Response.json({success:false,error_code:40001}),2,Date.now(),null,null);
  await self.__tembyObserveCartResponse(base+'tracking_data',Response.json({success:true,result:{}}),3,Date.now(),null,null);
  await self.__tembyObserveCartResponse(base+'user_cart_num',Response.json({success:true,result:{count:1}}),4,Date.now(),null,null);
  assert.equal(notices.length,6,'refusals, telemetry and counts cannot cause reads');
});

test('validated cart response follows browsing pages but not another account or logout',async()=>{
  const listeners=new Map(),notices:any[]=[];
  const origin='http://localhost:3001';
  const self:any={addEventListener(name:string,fn:any){listeners.set(name,fn);},clients:{matchAll:async()=>[]}};
  class Engine {on(){}}
  const context={self,UVServiceWorker:Engine,location:{origin},__uv$config:{},importScripts(){},URL,Response,TextDecoder,encodeURIComponent,decodeURIComponent};
  for(const file of ['uv-request.js','companion-cart.js','uv-sw.js'])vm.runInNewContext(await readFile(new URL('../public/'+file,import.meta.url),'utf8'),context);
  let identity='owned-account';self.__tembyCartScope=async()=>identity;
  const packet=JSON.parse(await readFile(new URL('./fixtures/mobile-cart-bootstrap.json',import.meta.url),'utf8'));
  const startedAt=Date.now();packet.result.cartTransferMap.lastRequestTime=String(startedAt);
  const cartUrl='https://www.temu.com/api/bg/bg-uranus-api/uranus_cart/cart_modify_page';
  const response=Response.json(packet);
  await self.__tembyObserveCartResponse(cartUrl,response.clone(),1,startedAt);
  assert.equal(notices.length,0,'there was no receiving page when the full API response arrived');
  const source={url:origin+'/uv-service/'+encodeURIComponent('https://www.temu.com/shopping_cart.html'),postMessage(value:any){if(!value.tembyCartReadState)notices.push(value);}};
  const message=async(event:any)=>{let work;listeners.get('message')({...event,waitUntil(value:any){work=value;}});await work;};
  await message({source,data:{tembyCartRead:{since:startedAt}}});
  assert.equal(notices.length,1);assert.equal(notices[0].tembyCartUpdate.carts[0].minor,42106);assert.equal(notices[0].tembyCartUpdate.carts[0].items.length,8);
  await message({source:{...source,url:origin+'/uv-service/'+encodeURIComponent('https://www.temu.com/goods.html')},data:{tembyCartRead:{since:startedAt+100}}});assert.equal(notices.length,2,'the same account keeps its verified cart on product pages');
  identity='another-account';await message({source,data:{tembyCartRead:{since:startedAt}}});assert.equal(notices.length,2,'another account cannot restore the earlier cart');
  identity='owned-account';
  await message({source:{...source,url:origin+'/uv-service/'+encodeURIComponent('https://other.temu.com/shopping_cart.html')},data:{tembyCartRead:{since:startedAt}}});assert.equal(notices.length,2);
  await message({source,data:{tembyCartInvalidate:true}});
  await message({source,data:{tembyCartRead:{since:startedAt}}});assert.equal(notices.length,2,'logout removes the saved snapshot');
  await self.__tembyObserveCartResponse(cartUrl,response.clone(),2,startedAt,'owned-account');
  await message({source,data:{tembyCartRead:{since:startedAt}}});assert.equal(notices.length,2,'a late pre-logout response cannot restore it');
  assert.deepEqual(await response.json(),packet,'the merchant receives its unchanged API response');
});

test('worker broadcasts sanitized live cart facts only to matching merchant tabs and preserves the original response',async()=>{
  const notices:any[]=[],traces:any[]=[];
  const origin='http://localhost:3001';
  const self:any={addEventListener(){},clients:{matchAll:async()=>[
    {url:origin+'/uv-service/'+encodeURIComponent('https://www.temu.com/address.html'),postMessage(value:any){if(value.tembyCartTrace)traces.push(value.tembyCartTrace);else notices.push(value);}},
    {url:origin+'/uv-service/'+encodeURIComponent('https://accounts.google.com/'),postMessage(){throw Error('Wrong merchant');}},
    {url:'https://www.temu.com/',postMessage(){throw Error('Wrong browser origin');}},
  ]}};
  class Engine {on(){}}
  const context={self,UVServiceWorker:Engine,location:{origin},__uv$config:{},importScripts(){},URL,Response,TextDecoder,encodeURIComponent,decodeURIComponent};
  for(const file of ['uv-request.js','companion-cart.js','uv-sw.js'])vm.runInNewContext(await readFile(new URL('../public/'+file,import.meta.url),'utf8'),context);
  const payload={success:true,result:{cartListInfo:{checkoutExtendMap:{ckCartCcy:'EUR',ckCartLoginStatus:'1',cartMorganToken:'do-not-forward'},goodsSkuList:[],invalidGoodsLines:0},cartTransferMap:{currency:'EUR',orderAmount:'0'},discountInfo:{orderAmountDto:{orderAmount:0,totalGoodsAmount:0,goodsDiscountAmount:0}}}};
  const url='https://www.temu.com/api/bg/bg-uranus-api/uranus_cart/cart_modify/pc_side_bar';
  const response=new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});
  const startedAt=Date.now()-1000;
  await self.__tembyObserveCartResponse(url,response.clone(),2,startedAt);
  assert.equal(notices.length,1);assert.equal(notices[0].tembyCartUpdate.carts[0].minor,0);assert.ok(!JSON.stringify(notices).includes('do-not-forward'));
  assert.ok(notices[0].tembyCartUpdate.carts[0].time>=startedAt,'snapshot freshness uses response arrival');
  assert.deepEqual(await response.json(),payload,'merchant still receives the original body');
  assert.equal(traces[0].phase,'response');assert.ok(!JSON.stringify(traces).includes('do-not-forward'));assert.ok(traces[0].durationMs>=1000);
  const countUrl='https://www.temu.com/api/bg/bg-uranus-api/uranus_cart/user_cart_num';
  await self.__tembyObserveCartResponse(countUrl,Response.json({success:true,result:{count:7}}),100);
  assert.equal(notices.length,1,'count-only observation does not publish an error or a fabricated total');
  assert.equal(traces.at(-1).phase,'published');
  await self.__tembyObserveCartResponse(url,new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}}),1);assert.equal(notices.length,1,'late older request cannot overwrite newer cart');
  const large=new Response(' '.repeat(2*1024*1024+1),{headers:{'content-type':'application/json'}});
  await self.__tembyObserveCartResponse(url,large.clone(),3);assert.equal((await large.text()).length,2*1024*1024+1);assert.equal(notices.length,2);assert.equal(notices[1].tembyCartStatus.reason,'too-large');
  await self.__tembyObserveCartResponse(url,new Response('{"success":false,"token":"secret"}',{headers:{'content-type':'application/json'}}),4);
  assert.equal(notices[2].tembyCartStatus.reason,'merchant-failure');assert.ok(!JSON.stringify(notices).includes('secret'));
  await self.__tembyObserveCartResponse(url,new Response('{}',{status:403,headers:{'content-type':'application/json'}}),5);
  assert.equal(notices[3].tembyCartStatus.reason,'http-error');assert.equal(notices[3].tembyCartStatus.status,403);
  assert.ok(Number.isSafeInteger(notices[3].tembyCartStatus.time),'failure carries its request-start time for ordering against cart data');
  await self.__tembyObserveCartResponse(url,new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}}),4);
  assert.equal(notices.length,4,'older successful response cannot conceal a newer failure');
});
