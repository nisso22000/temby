import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const context:any={self:{}};
vm.runInNewContext(await readFile(new URL('../public/companion-core.js',import.meta.url),'utf8'),context);
const {money,quote,consensus}=context.self.__tembyCompanionCore;
test('payment fees are separately configured for final review',()=>{
  const {paymentFee}=context.self.__tembyCompanionCore;
  assert.equal(paymentFee(2700000,'card'),54000);
  assert.equal(paymentFee(2700000,'baridimob'),13500);
  assert.throws(()=>paymentFee(100,'unknown'));
});
test('cart money parsing supports Temu bilingual formats and rejects ambiguous prices',()=>{
  for(const value of ['Subtotal €1,234.56','المجموع الفرعي ؜١٢٣٤٫٥٦€','Sous-total 1.234,56 EUR','€1 234,56'])assert.equal(money(value).minor,123456,value);
  for(const value of ['€1.2','€1.2345','€-1.00','€2.00 €3.00','CAD $2.00','£2.00','2.00','€1,23,456','€1.00 USD', '€1.00 (2)'])assert.equal(money(value),null,value);
  assert.equal(money('Subtotal $0.01').minor,1);
});
test('DZD estimate keeps card fees out of bubble and rounds integer minor units',()=>{
  const usd=quote(10000,'USD');
  assert.equal(usd.converted,2500000);assert.equal(usd.service,200000);assert.equal(usd.bubble,2700000);assert.equal(usd.card,54000);assert.equal(usd.total,2754000);
  assert.equal(quote(10000,'EUR').bubble,2970000);
  assert.equal(quote(1,'EUR').bubble,297);
  for(const invalid of [-1,0.01,NaN,Infinity,100000001])assert.throws(()=>quote(invalid,'EUR'));
  assert.throws(()=>quote(100,'GBP'));assert.throws(()=>quote(100,'USD',{USD:0}));
});
test('cart reader refuses conflicting totals, missing counts and transient zero subtotals',()=>{
  assert.equal(consensus(['Subtotal €10.00','المجموع الفرعي 10.00€'],'Checkout (٢)').quantity,2);
  for(const [labels,count] of [[['€10.00','€11.00'],'Checkout (2)'],[['€0.00'],'Checkout (2)'],[['€10.00'],'Checkout (0)'],[['€10.00'],'Checkout'],[[],'Checkout (0)']])assert.equal(consensus(labels,count),null);
  assert.equal(consensus(['Subtotal €0.00'],'Checkout (0)').minor,0);
});
