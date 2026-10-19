import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('worker broadcasts sanitized live cart facts only to matching merchant tabs and preserves the original response',async()=>{
  const notices:any[]=[];
  const origin='http://localhost:3001';
  const self:any={addEventListener(){},clients:{matchAll:async()=>[
    {url:origin+'/uv-service/'+encodeURIComponent('https://www.temu.com/address.html'),postMessage(value:any){notices.push(value);}},
    {url:origin+'/uv-service/'+encodeURIComponent('https://accounts.google.com/'),postMessage(){throw Error('Wrong merchant');}},
    {url:'https://www.temu.com/',postMessage(){throw Error('Wrong browser origin');}},
  ]}};
  class Engine {on(){}}
  const context={self,UVServiceWorker:Engine,location:{origin},__uv$config:{},importScripts(){},URL,Response,TextDecoder,encodeURIComponent,decodeURIComponent};
  for(const file of ['uv-request.js','companion-cart.js','uv-sw.js'])vm.runInNewContext(await readFile(new URL('../public/'+file,import.meta.url),'utf8'),context);
  const payload={success:true,result:{cartListInfo:{checkoutExtendMap:{ckCartCcy:'EUR',ckCartLoginStatus:'1',cartMorganToken:'do-not-forward'},goodsSkuList:[],invalidGoodsLines:0},cartTransferMap:{currency:'EUR',orderAmount:'0'},discountInfo:{orderAmountDto:{orderAmount:0,totalGoodsAmount:0,goodsDiscountAmount:0}}}};
  const url='https://www.temu.com/api/bg/bg-uranus-api/uranus_cart/cart_modify/pc_side_bar';
  const response=new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});
  await self.__tembyObserveCartResponse(url,response.clone(),2);
  assert.equal(notices.length,1);assert.equal(notices[0].tembyCartUpdate.carts[0].minor,0);assert.ok(!JSON.stringify(notices).includes('do-not-forward'));
  assert.deepEqual(await response.json(),payload,'merchant still receives the original body');
  await self.__tembyObserveCartResponse(url,new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}}),1);assert.equal(notices.length,1,'late older request cannot overwrite newer cart');
  const large=new Response(' '.repeat(2*1024*1024+1),{headers:{'content-type':'application/json'}});
  await self.__tembyObserveCartResponse(url,large.clone(),3);assert.equal((await large.text()).length,2*1024*1024+1);assert.equal(notices.length,1);
});
