import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const scope:any={self:{},URL};
vm.runInNewContext(await readFile(new URL('../public/companion-cart.js',import.meta.url),'utf8'),scope);
const {normalize,select}=scope.self.__tembyCart;
const now=1792333154238;
const sku=(id:string,quantity=1)=>({goodsId:'60109912345',skuId:id,goodsName:'Earbuds',quantity,salePrice:1299,marketPrice:2500,thumbUrl:'https://aimg.kwcdn.com/item.jpg',skuSpecVo:[{specKey:'Color',specValue:'Black'}]});
const record=(overrides:any={})=>({k:now+'-4-session-USD-en',v:JSON.stringify({goodsSkuList:[sku('17589912345',2)],currency:'USD',orderAmount:2000,orderAmountUsd:2000,cartMorganToken:'must-never-leave-adapter',ckCartLoginStatus:'1',invalidGoodsLines:0,...overrides})});
test('scdb adapter extracts cents, variants and quantities, retaining no merchant credentials',()=>{
  const [cart]=normalize(record());assert.ok(cart);
  assert.equal(cart.minor,2000);assert.equal(cart.currency,'USD');assert.equal(cart.time,now);assert.equal(cart.login,1);
  assert.equal(cart.items[0].quantity,2);assert.equal(cart.items[0].unitMinor,1299);assert.equal(cart.items[0].specs,'Color: Black');
  assert.ok(!JSON.stringify(cart).includes('must-never'));assert.ok(!JSON.stringify(cart).includes('marketPrice'));
  const matched=select([cart],{minor:2000,currency:'USD',quantity:2},now+5000);
  assert.equal(matched.source,'scdb');assert.equal(matched.selectionKnown,true);
});
test('scdb cache is rejected when stale, from the future, wrong currency, wrong selection or conflicting',()=>{
  const [cart]=normalize(record());const dom={minor:2000,currency:'USD',quantity:2};
  assert.equal(select([cart],dom,now+1800001),null);assert.equal(select([cart],dom,now-10001),null);
  assert.equal(select([cart],null,now),null);
  assert.equal(select([cart],{...dom,currency:'EUR'},now),null);
  assert.equal(select([cart],{...dom,minor:2001},now),null);
  assert.equal(select([cart],{...dom,quantity:3},now).selectionKnown,false);
  assert.equal(select([cart,{...cart,minor:1999}],dom,now),null);
  assert.equal(select([{...cart,time:0}],dom,now),null);
});
test('scdb adapter rejects ambiguous currency, invalid units, duplicate SKUs and divergent display lists',()=>{
  for(const overrides of [
    {currency:'GBP'}, {currency:'EUR',ckCartCcy:'USD'}, {orderAmount:20.1},
    {goodsSkuList:[sku('17589912345',0)]}, {goodsSkuList:[sku('17589912345'),sku('17589912345')]},
    {displayList:[{goodsList:[sku('17589999999')]}]},
  ])assert.equal(normalize(record(overrides)).length,0,JSON.stringify(overrides));
  assert.equal(normalize(record({currency:'EUR',orderAmount:undefined,orderAmountUsd:2000})).length,0,'USD value is never silently interpreted as EUR');
});
test('selected lines are counted independently from saved or unchecked lines',()=>{
  const [cart]=normalize(record({goodsSkuList:[{...sku('17589912345',2),selected:true},{...sku('17589912346',3),selected:false}]}));
  assert.ok(select([cart],{minor:2000,currency:'USD',quantity:2},now));
  assert.equal(select([cart],{minor:2000,currency:'USD',quantity:5},now).selectionKnown,false);
});

test('discounted net amount stays separate from gross, list-price savings and currency',()=>{
  const [cart]=normalize(record({orderAmount:4694,orderAmountUsd:4694,totalGoodsAmountUsd:10154,goodsDiscountAmount:5460,discountAmountUsd:0,totalSaveAmount:12192}));
  assert.equal(cart.minor,4694);assert.equal(cart.beforeMinor,10154);assert.equal(cart.discountMinor,5460);
  assert.equal(select([cart],{minor:10154,currency:'USD',quantity:2,role:'subtotal'},now).minor,4694);
  assert.equal(select([cart],{minor:10154,currency:'USD',quantity:2,role:'final'},now),null);
  const [bad]=normalize(record({orderAmount:4694,totalGoodsAmountUsd:10154,goodsDiscountAmount:9999}));
  assert.equal(bad.beforeMinor,null);assert.equal(bad.discountMinor,null);
  const [eur]=normalize(record({currency:'EUR',orderAmount:2092,totalGoodsAmount:2899,goodsDiscountAmount:807,discountAmount:0}));
  assert.equal(eur.beforeMinor,2899);assert.equal(eur.minor,2092);assert.equal(eur.currency,'EUR');
});

test('checkout amount records need no SKU list; account facts do not depend on cart parsing',()=>{
  const financial={k:now+'-4-session-EUR-ar',v:{orderAmount:2092,totalGoodsAmount:2899,goodsDiscountAmount:807,ckCartLoginStatus:'1'}};
  const [cart]=normalize(financial);
  assert.equal(cart.currency,'EUR');assert.equal(cart.minor,2092);
  assert.ok(select([cart],{minor:2092,currency:'EUR',quantity:null,role:'final'},now));
  assert.equal(select([cart],{minor:2092,currency:'EUR',quantity:null,role:'final'},now).quantity,null,'missing details do not mean an empty cart');
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
  assert.equal(select(carts,{currency:'EUR',minor:2092,quantity:2,role:'final'},now).selectionKnown,true);
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

test('pages without cart totals may show a labelled canonical cache estimate, never an ambiguous or stale quote',()=>{
  const carts=normalize(canonical());
  assert.equal(select(carts,null,now),null,'cache-only estimates require explicit opt-in');
  const estimate=select(carts,null,now,{allowCacheOnly:true});
  assert.equal(estimate.source,'scdb-estimate');assert.equal(estimate.minor,2092);assert.equal(estimate.quantity,2);
  assert.equal(select(carts,null,now+1800000,{allowCacheOnly:true}),null);
  assert.equal(select(normalize(record()),null,now,{allowCacheOnly:true}),null,'generic nested money is insufficient');
  assert.equal(select([...carts,{...carts[0],minor:2000}],null,now,{allowCacheOnly:true}),null);
  assert.equal(select(carts,{currency:'EUR',minor:2093},now,{allowCacheOnly:true}),null,'visible disagreement cannot bypass validation');
  assert.equal(select(carts,{currency:'USD',minor:2092},now,{allowCacheOnly:true}),null);
});
