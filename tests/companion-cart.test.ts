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
  assert.equal(select([cart],dom,now+120001),null);assert.equal(select([cart],dom,now-10001),null);
  assert.equal(select([cart],null,now),null);
  assert.equal(select([cart],{...dom,currency:'EUR'},now),null);
  assert.equal(select([cart],{...dom,minor:2001},now),null);
  assert.equal(select([cart],{...dom,quantity:1},now),null);
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
  assert.equal(select([cart],{minor:2000,currency:'USD',quantity:5},now),null);
});
