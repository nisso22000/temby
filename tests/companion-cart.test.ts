import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const scope:any={self:{},URL};
vm.runInNewContext(await readFile(new URL('../public/companion-cart.js',import.meta.url),'utf8'),scope);
const {normalize,select}=scope.self.__tembyCart;
const now=1792333154238;
test('mobile mutation routes are recognized without treating counts or tracking as changes',()=>{
 const api=scope.self.__tembyCart,base='https://www.temu.com/api/bg/bg-uranus-api/uranus_cart/';
 for(const path of ['single/operate_cart','batch/add_cart','remove_and_add'])assert.equal(api.mutationURL(base+path),true,path);
 for(const path of ['user_cart_num','tracking_data','cart_modify_page','single/operate_cart_extra'])assert.equal(api.mutationURL(base+path),false,path);
 assert.equal(api.mutationURL(base.replace('www.temu.com','www.temu.com.evil.invalid')+'batch/add_cart'),false);
});
test('a successful cart edit acknowledgement requests a full cart read',()=>{
 const api=scope.self.__tembyCart,base='https://www.temu.com/api/bg/bg-uranus-api/uranus_cart/';
 const accepted={success:true,result:{cart_operate_info:{success:true}}};
 assert.equal(api.mutationAcknowledged(base+'cart_modify',accepted,null),true,'cart delete may omit the operation type');
 assert.equal(api.mutationAcknowledged(base+'batch/delete_cart',accepted,null),true,'new cart edit routes with an explicit success acknowledgement refresh');
 assert.equal(api.mutationAcknowledged(base+'cart_modify',{success:true,result:{cart_operate_info:{success:false}}},3),false);
 assert.equal(api.mutationAcknowledged(base+'cart_modify_page',accepted,1),false,'a partial read is not a cart edit');
 assert.equal(api.mutationAcknowledged(base+'cart_modify_page',accepted,15),true,'new edit operation types are still changes');
 assert.equal(api.mutationAcknowledged(base+'user_cart_num',accepted,null),false);
});
test('mobile bubble counts signal changes but never supply a price',()=>{
 const api=scope.self.__tembyCart,base='https://www.temu.com/api/bg/bg-uranus-api/uranus_cart/';
 const value={success:true,result:{cart_sku_num_map:{'175000001':2,'175000002':1},cart_sku_detail_info_map:{cart_selected_sku_list:['175000001']}}};
 assert.equal(api.countURL(base+'user_cart_num'),true);assert.equal(api.countURL(base+'cart_modify_page'),false);
 const count=api.countFacts(value);assert.equal(JSON.stringify(count.lines),JSON.stringify([['175000001',2]]));
 assert.equal(api.responseFacts(value),null,'item counts cannot become payable money');
 assert.equal(api.countMatches({selectionKnown:true,items:[{id:'175000001',quantity:2,selection:true},{id:'175000002',quantity:1,selection:false}]},count),true);
 assert.equal(api.countMatches({selectionKnown:true,items:[{id:'175000001',quantity:1,selection:true}]},count),false);
 assert.equal(api.countFacts({success:true,result:{...value.result,cart_sku_detail_info_map:{cart_selected_sku_list:['missing']}}}),null);
});
test('mobile snake-case API responses normalize like the SDK camel-case copy',async()=>{
  const packet=JSON.parse(await readFile(new URL('./fixtures/mobile-cart-bootstrap.json',import.meta.url),'utf8'));
  const snake=(value:any):any=>Array.isArray(value)?value.map(snake):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,value])=>[key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),snake(value)])):value;
  const wire=snake(packet),facts=scope.self.__tembyCart.responseFacts(wire,Date.now());
  assert.equal(facts.carts[0].minor,42106);assert.equal(facts.carts[0].currency,'EUR');assert.equal(facts.carts[0].items.length,8);
  wire.result.cart_transfer_map.order_amount='1';
  assert.equal(scope.self.__tembyCart.responseFacts(wire),null,'wire spelling does not bypass conflicting-total validation');
  wire.result.cart_transfer_map.order_amount='42106';wire.result.cart_transfer_map.orderAmount='1';
  assert.equal(scope.self.__tembyCart.responseFacts(wire),null,'conflicting spellings of the same field are rejected');
});
test('cart document bootstrap parsing is absent; only structured API responses supply totals',()=>{
  const api=scope.self.__tembyCart;
  assert.equal(api.documentURL,undefined);assert.equal(api.documentFacts,undefined);
  assert.equal(api.responseURL('https://www.temu.com/shopping_cart.html'),false);
});
const sku=(id:string,quantity=1)=>({goodsId:'60109912345',skuId:id,goodsName:'Earbuds',quantity,salePrice:1299,marketPrice:2500,thumbUrl:'https://aimg.kwcdn.com/item.jpg',skuSpecVo:[{specKey:'Color',specValue:'Black'}]});
const record=(overrides:any={})=>({k:now+'-4-session-USD-en',v:JSON.stringify({goodsSkuList:[sku('17589912345',2)],currency:'USD',orderAmount:2000,orderAmountUsd:2000,cartMorganToken:'must-never-leave-adapter',ckCartLoginStatus:'1',invalidGoodsLines:0,...overrides})});
test('scdb adapter rejects ambiguous currency, invalid units, duplicate SKUs and divergent display lists',()=>{
  for(const overrides of [
    {currency:'GBP'}, {currency:'EUR',ckCartCcy:'USD'}, {orderAmount:20.1},
    {goodsSkuList:[sku('17589912345',0)]}, {goodsSkuList:[sku('17589912345'),sku('17589912345')]},
    {displayList:[{goodsList:[sku('17589999999')]}]},
  ])assert.equal(normalize(record(overrides)).length,0,JSON.stringify(overrides));
  assert.equal(normalize(record({currency:'EUR',orderAmount:undefined,orderAmountUsd:2000})).length,0,'USD value is never silently interpreted as EUR');
});
test('discounted net amount stays separate from gross, list-price savings and currency',()=>{
  const [cart]=normalize(record({orderAmount:4694,orderAmountUsd:4694,totalGoodsAmountUsd:10154,goodsDiscountAmount:5460,discountAmountUsd:0,totalSaveAmount:12192}));
  assert.equal(cart.minor,4694);assert.equal(cart.beforeMinor,10154);assert.equal(cart.discountMinor,5460);
  const [bad]=normalize(record({orderAmount:4694,totalGoodsAmountUsd:10154,goodsDiscountAmount:9999}));
  assert.equal(bad.beforeMinor,null);assert.equal(bad.discountMinor,null);
  const [eur]=normalize(record({currency:'EUR',orderAmount:2092,totalGoodsAmount:2899,goodsDiscountAmount:807,discountAmount:0}));
  assert.equal(eur.beforeMinor,2899);assert.equal(eur.minor,2092);assert.equal(eur.currency,'EUR');
});

test('checkout amount records need no SKU list; account facts do not depend on cart parsing',()=>{
  const financial={k:now+'-4-session-EUR-ar',v:{orderAmount:2092,totalGoodsAmount:2899,goodsDiscountAmount:807,ckCartLoginStatus:'1'}};
  const [cart]=normalize(financial);
  assert.equal(cart.currency,'EUR');assert.equal(cart.minor,2092);
  const facts=scope.self.__tembyCart.authFacts(financial);
  assert.equal(scope.self.__tembyCart.accountStatus(facts,now).status,1);
  assert.equal(scope.self.__tembyCart.accountStatus([...facts,{status:0,time:now+1000}],now+1000).status,0);
  assert.equal(scope.self.__tembyCart.accountStatus([...facts,{status:0,time:now}],now),null);
});

test('cache reader uses the original IndexedDB open method for the scoped entries store',async()=>{
  let opened='',mode='',direction='';
  const row=record();
  const database={objectStoreNames:['entries','unrelated'],close(){},transaction(store:string,value:string){
    assert.equal(store,'entries');mode=value;
    const tx:any={objectStore(){return {openCursor(_query:any,order:string){
      direction=order;const request:any={};let visited=false;
      const advance=()=>queueMicrotask(()=>{request.result=visited?null:{value:row,key:row.k,continue(){visited=true;advance();}};request.onsuccess();if(visited&&request.result===null)tx.oncomplete();});
      advance();return request;
    }}}};return tx;
  }};
  const page:any={__uv:{meta:{url:{origin:'https://www.temu.com'}}},indexedDB:{open(){throw Error('Wrapped open must not run');}},document:{hidden:false},addEventListener(){},removeEventListener(){},setInterval(){return 1;},clearInterval(){}};
  let stop:Function|undefined;
  const result=await new Promise<any>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Cache read timed out')),2000);
    stop=scope.self.__tembyCart.observe(page,(carts:any)=>{clearTimeout(timer);resolve(carts);},undefined,{
      databases:async()=>[{name:'https://www.temu.com@scdb'},{name:'scdb'}],
      open(name:string){opened=name;const request:any={};queueMicrotask(()=>{request.result=database;request.onsuccess();});return request;}
    });
  });
  stop?.();assert.equal(opened,'https://www.temu.com@scdb');assert.equal(mode,'readonly');assert.equal(direction,'prev');assert.equal(result[0].minor,2000);
});

const canonical=()=>({k:now+'-4-example-EUR-ar',d:{success:true,result:{
  cartListInfo:{checkoutExtendMap:{ckCartCcy:'EUR',ckCartLoginStatus:'1'},invalidGoodsLines:0,
    goodsSkuList:[{isSelected:1,baseGoodsInfo:{goodsId:601000001,goodsName:'Example',price:489,thumbUrl:'https://img.kwcdn.com/example.jpg'},
      skuInfo:{skuId:175000001,amount:2,skuQuantity:99,skuPrice:407,skuSpec:[{specKey:'Color',specValue:'Blue'}]}}]},
  cartTransferMap:{currency:'EUR',orderAmount:'2092',totalSaveAmount:'3060'},
  discountInfo:{amountRocVo:{orderAmountUsd:2400,totalGoodsAmountUsd:3300,discountAmountUsd:0},
    orderAmountDto:{totalGoodsAmount:2899,orderAmount:2092,orderAmountOrderCcy:2092,goodsDiscountAmount:807}},
  checkoutLayerTrackInfo:{strongThreshold:1000},sideBarCachedResponse:'{"orderAmount":99999}'
}}});

test('real nested cart shape uses order currency, DTO discount and selected amount rather than stock',()=>{
  const row=canonical();const carts=normalize(row,'sc_cache');assert.equal(carts.length,1);
  const cart=carts[0];assert.equal(cart.currency,'EUR');assert.equal(cart.minor,2092);
  assert.equal(cart.beforeMinor,2899);assert.equal(cart.discountMinor,807);
  assert.equal(cart.items[0].quantity,2);assert.equal(cart.items[0].unitMinor,407);
  assert.equal(cart.items[0].specs,'Color: Blue');assert.equal(cart.minimum,1000);
  assert.equal(scope.self.__tembyCart.accountStatus(scope.self.__tembyCart.authFacts(row),now).status,1);
  assert.ok(!JSON.stringify(cart).includes('3060'));assert.ok(!JSON.stringify(cart).includes('2400'));
});

test('canonical parser rejects failed responses and contradictory totals or currencies without mining children',()=>{
  for(const mutate of [
    (r:any)=>r.d.success=false,
    (r:any)=>r.d.result.cartTransferMap.orderAmount='2093',
    (r:any)=>r.d.result.cartTransferMap.currency='USD',
    (r:any)=>r.d.result.discountInfo.orderAmountDto.orderAmountOrderCcy=2093,
  ]){const row=canonical();mutate(row);assert.equal(normalize(row).length,0);}
  const row:any=canonical();delete row.d.result.cartListInfo.goodsSkuList[0].skuInfo.amount;
  const [summary]=normalize(row);assert.equal(summary.minor,2092);assert.equal(summary.items.length,0);
});

test('UV accessors and unrelated sensitive snapshots are never read',()=>{
  const row=canonical();let reads=0;
  Object.defineProperty(row,'__uv$location',{enumerable:true,get(){reads++;throw Error('Do not evaluate');}});
  Object.defineProperty(row.d.result,'unrelatedAccessor',{enumerable:true,get(){reads++;throw Error('Do not evaluate');}});
  assert.equal(normalize(row).length,1);assert.equal(scope.self.__tembyCart.authFacts(row).length,1);assert.equal(reads,0);
});

test('mobile bare cart endpoint is recognized without accepting lookalikes or other ports',()=>{
 const api=scope.self.__tembyCart;
 assert.equal(api.responseURL('https://www.temu.com/api/bg/bg-uranus-api/uranus_cart/cart_modify'),true);
 assert.equal(api.responseURL('https://www.temu.com/api/bg/bg-uranus-api/uranus_cart/merge'),true);
 assert.equal(api.responseURL('https://www.temu.com/api/bg/bg-uranus-api/uranus_cart/user_cart_num'),true);
 assert.equal(api.responseURL('https://www.temu.com/api/bg/uranus_cart_extra/query'),false);
 for(const url of ['https://www.temu.com/api/cart_modify_extra','https://www.temu.com:444/api/cart_modify','https://user@www.temu.com/api/cart_modify'])assert.equal(api.responseURL(url),false,url);
});

test('minimum numeric strings normalize consistently and malformed thresholds remain unknown',()=>{
 for(const [value,expected] of [['3000',3000],['0',0],['30.00',null],[-1,null],['not-money',null]] as const){
  const row:any=canonical();row.d.result.checkoutLayerTrackInfo.strongThreshold=value;
  assert.equal(normalize(row)[0].minimum,expected);
 }
});

test('database discovery works without enumeration, aborts missing scoped DB, then recovers legacy storage',async()=>{
 for(const enumeration of [undefined,async()=>{throw Error('Enumeration denied');},async()=>new Promise(()=>{})]){
  const opened:string[]=[];let aborted=false,closed=false;
  const page:any={indexedDB:{},document:{hidden:false},__uv:{meta:{url:{origin:'https://www.temu.com'}}},addEventListener(){},removeEventListener(){},setInterval(){return 1;},clearInterval(){}};
  let stop:Function|undefined;
  await new Promise<void>((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Reader stalled')),2000);
   stop=scope.self.__tembyCart.observe(page,()=>{clearTimeout(timeout);resolve();},undefined,{databases:enumeration,open(name:string){
    opened.push(name);const req:any={};
    queueMicrotask(()=>{if(name.includes('@')){req.transaction={abort(){aborted=true;queueMicrotask(()=>req.onerror());}};req.onupgradeneeded();}else{req.result={objectStoreNames:[],close(){closed=true;}};req.onsuccess();}});
    return req;
   }});
  });stop?.();
  assert.deepEqual(opened,['https://www.temu.com@scdb','scdb']);assert.equal(aborted,true);assert.equal(closed,true);
 }
});

test('response/database selection needs no page text and chooses newest timestamp without a source window',()=>{
 const api=scope.self.__tembyCart;
 const live=api.responseFacts(canonical().d,now).carts[0];
 const cached={...live,live:false,time:now+1000,minor:2500};
 for(const elapsed of [1000,121000]){
  const cart=select([cached,live],now+elapsed);
  assert.equal(cart.minor,2500);assert.equal(cart.source,'scdb');
 }
 assert.equal(select([cached,{...live,time:now+2000}],now+2000).source,'response');
 assert.equal(select([live,{...live,live:false}],now).source,'response','equal matching records prefer live');
 assert.equal(select([live,{...live,minor:2500}],now),null,'equal conflicting totals rejected');
 assert.equal(select([live,{...live,currency:'USD'}],now),null,'equal conflicting currencies rejected');
 assert.equal(select([live,{...live,minimum:5000}],now),null,'equal conflicting minimums rejected');
 assert.equal(select([live,{...live,invalid:1}],now),null,'equal conflicting eligibility rejected');
 assert.equal(select([live],now+1800000),null,'local age bound is still enforced');
 assert.equal(select([live],now-10001),null);
 assert.equal(select([live],now,{minTime:now+1}),null);
 assert.equal(select(normalize(record()),now),null,'generic money fragments do not qualify without a complete response');
 assert.equal(select([],now),null,'absence is not an invented empty cart');
});

test('minimum is at least 20 USD or EUR and retains a higher merchant minimum',()=>{
 for(const currency of ['EUR','USD'])for(const threshold of [undefined,0,1000,2000,3000]){
  const row:any=canonical();row.k=now+'-4-example-'+currency+'-ar';row.d.result.cartListInfo.checkoutExtendMap.ckCartCcy=currency;
  row.d.result.cartTransferMap.currency=currency;row.d.result.checkoutLayerTrackInfo.strongThreshold=threshold;
  const cart=select(normalize(row),now);
  assert.equal(cart.minimum,Math.max(2000,threshold??0));
  assert.equal(cart.merchantMinimum,threshold??null);
 }
});

test('only explicit successful zero carts are empty; item selection comes exclusively from response data',()=>{
 const api=scope.self.__tembyCart;const row:any=canonical();
 const cart=select(api.responseFacts(row.d,now).carts,now);
 assert.equal(cart.quantity,2);assert.equal(cart.selectionKnown,true);
 row.d.result.cartListInfo.goodsSkuList[0].isSelected=undefined;
 assert.equal(select(api.responseFacts(row.d,now).carts,now).quantity,null);
 row.d.result.cartListInfo.goodsSkuList=[];row.d.result.cartTransferMap.orderAmount='0';
 Object.assign(row.d.result.discountInfo.orderAmountDto,{orderAmount:0,orderAmountOrderCcy:0,totalGoodsAmount:0,goodsDiscountAmount:0});
 assert.equal(select(api.responseFacts(row.d,now).carts,now).quantity,0);
 assert.equal(api.responseFacts({...row.d,success:false},now),null);
 assert.equal(api.responseFacts({success:true,result:{orderAmount:2000}},now),null);
 assert.equal(typeof scope.self.__tembyPageReader,'undefined','page reader is removed');
});

test('unselected sold-out zero-quantity line preserves all seven lines and six selected items',()=>{
 const row:any=canonical();const base=row.d.result.cartListInfo.goodsSkuList[0];
 row.d.result.cartListInfo.goodsSkuList=Array.from({length:7},(_,i)=>({...base,baseGoodsInfo:{...base.baseGoodsInfo,goodsId:601000000+i},skuInfo:{...base.skuInfo,skuId:175000000+i,amount:1}}));
 const sold=row.d.result.cartListInfo.goodsSkuList[5];sold.isSelected=0;sold.skuInfo.amount=0;sold.skuInfo.skuQuantity=0;sold.invalidDescVo={invalidType:'SKU_SOLD_OUT'};
 row.d.result.cartListInfo.invalidGoodsLines=1;
 row.d.result.cartTransferMap.orderAmount='2699';
 Object.assign(row.d.result.discountInfo.orderAmountDto,{orderAmount:2699,orderAmountOrderCcy:2699});
 const cart=select(normalize(row),now);
 assert.equal(cart.minor,2699);assert.equal(cart.items.length,7);assert.equal(cart.quantity,6);
 assert.equal(cart.selectedInvalid,0);assert.equal(cart.unselectedInvalid,1);
 assert.equal(cart.items[5].unavailableReason,'SKU_SOLD_OUT');
 sold.isSelected=1;sold.skuInfo.amount=1;
 assert.equal(select(normalize(row),now).selectedInvalid,1,'selected unavailable line still blocks');
 row.d.result.cartListInfo.invalidGoodsLines=2;sold.isSelected=0;sold.skuInfo.amount=0;
 assert.equal(select(normalize(row),now).selectedInvalid,1,'unexplained problem lines are not silently ignored');
});

test('merchant request timestamp orders cached copies independently from later cache writes',()=>{
 const row:any=canonical();row.k=String(now+5000);row.d.result.cartTransferMap.lastRequestTime=String(now);
 row.d.result.serverTime=Math.floor(now/1000);
 const cart=normalize(row)[0];assert.equal(cart.time,now);assert.equal(cart.observedAt,now+5000);
 assert.equal(cart.merchantRequestTime,now);assert.equal(cart.serverTime,Math.floor(now/1000));
 const live=scope.self.__tembyCart.responseFacts(canonical().d,now+1000).carts[0];
 assert.equal(select([cart,live],now+5000).source,'response');
});
test('a later live cart edit wins even when the merchant timestamp moves backward',()=>{
 const api=scope.self.__tembyCart,earlier:any=canonical(),later:any=canonical();
 earlier.d.result.cartTransferMap.lastRequestTime=String(now+5000);
 later.d.result.cartTransferMap.lastRequestTime=String(now-5000);
 later.d.result.cartTransferMap.orderAmount='2699';later.d.result.discountInfo.orderAmountDto.orderAmount=2699;later.d.result.discountInfo.orderAmountDto.orderAmountOrderCcy=2699;
 const first=api.responseFacts(earlier.d,now).carts[0];
 const second=api.responseFacts(later.d,now+1000).carts[0];
 assert.equal(first.time,now);assert.equal(second.time,now+1000);
 assert.equal(second.merchantRequestTime,now-5000);
 assert.equal(api.select([first,second],now+1000).minor,2699);
});

test('cart console diagnostics retain summaries but exclude URL, tokens and raw objects',()=>{
 const logs:any[]=[];scope.self.__tembyCart.trace({console:{info:(...args:any[])=>logs.push(args)}},'selected',{source:'scdb',totalMinor:2699,currency:'EUR',items:7,token:'secret',url:'https://temu.com/?token=secret',body:{cookie:'secret'}});
 assert.equal(logs.length,1);assert.ok(JSON.stringify(logs).includes('2699'));assert.ok(!JSON.stringify(logs).includes('secret'));assert.ok(!JSON.stringify(logs).includes('https:'));
});

test('unrelated rich product metadata cannot exhaust the cart parsing budget before totals',()=>{
 const row:any=canonical();const item=row.d.result.cartListInfo.goodsSkuList[0];
 item.unrelatedRichMetadata=Array.from({length:12000},(_,i)=>({style:{number:i}}));
 row.d.result.unrelatedAccessor='not-needed';
 const cart=select(normalize(row),now);
 assert.equal(cart.minor,2092);assert.equal(cart.items.length,1);assert.equal(cart.quantity,2);
});

test('returning to a visible mobile tab rescans storage without waiting for a throttled interval',async()=>{
 const listeners:Record<string,Function>={};let opened=0;
 const page:any={indexedDB:{},document:{hidden:true,addEventListener:(name:string,fn:Function)=>listeners[name]=fn,removeEventListener:(name:string)=>delete listeners[name]},addEventListener(){},removeEventListener(){},setInterval(){return 1;},clearInterval(){}};
 let notify:()=>void=()=>{};
 const changed=()=>notify();
 const first=new Promise<void>(resolve=>notify=resolve);
 const stop=scope.self.__tembyCart.observe(page,changed,undefined,{open(){opened++;const request:any={};queueMicrotask(()=>{request.result={objectStoreNames:[],close(){}};request.onsuccess();});return request;}});
 await first;await new Promise(resolve=>setImmediate(resolve));assert.equal(opened,1);
 const resumed=new Promise<void>(resolve=>notify=resolve);page.document.hidden=false;listeners.visibilitychange();await resumed;
 assert.equal(opened,2);stop();assert.equal(listeners.visibilitychange,undefined);
});
