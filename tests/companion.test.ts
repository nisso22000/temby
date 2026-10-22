import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const context:any={self:{}};
vm.runInNewContext(await readFile(new URL('../public/companion-core.js',import.meta.url),'utf8'),context);
const {money,quote,consensus}=context.self.__tembyCompanionCore;
test('payment fees are separately configured for final review',()=>{
  const {paymentFee}=context.self.__tembyCompanionCore;
  assert.equal(paymentFee(2700000,'card'),54000);
  assert.equal(paymentFee(2700000,'baridimob'),13500);
  assert.throws(()=>paymentFee(100,'unknown'));
});

test('empty, unreadable and updating carts never advance into account setup',()=>{
  const state=context.self.__tembyCompanionCore.cartState;
  assert.equal(state(null,false,true),'loading');assert.equal(state(null,false,false),'unavailable');
  for(const quantity of [0,null,undefined])assert.equal(state({minor:0,quantity},false),'empty');
  assert.equal(state({minor:0,quantity:1},false),'ready','known selected items remain nonempty even if a promotion makes their price zero');
  assert.equal(state({minor:2000,quantity:0},false),'empty');
  assert.equal(state({minor:2000,quantity:null},false),'ready');
  assert.equal(state({minor:2000,quantity:1,invalid:2,minimum:3000},false),'ready','cart presence is separate from order eligibility');
  assert.equal(state({minor:2000,quantity:1},true),'loading');
});

test('generated passwords use browser randomness and contain required character classes',()=>{
  const create=context.self.__tembyCompanionCore.password;
  const values=new Set<string>();for(let i=0;i<20;i++){const password=create(webcrypto);assert.match(password,/^[A-Za-z0-9]{16}$/);assert.match(password,/[A-Z]/);assert.match(password,/[a-z]/);assert.match(password,/\d/);values.add(password);}
  assert.equal(values.size,20);
});
test('cart money parsing supports Temu bilingual formats and rejects ambiguous prices',()=>{
  for(const value of ['Subtotal €1,234.56','المجموع الفرعي ؜١٢٣٤٫٥٦€','Sous-total 1.234,56 EUR','€1 234,56'])assert.equal(money(value).minor,123456,value);
  for(const value of ['€1.2','€1.2345','€-1.00','€2.00 €3.00','CAD $2.00','£2.00','2.00','€1,23,456','€1.00 USD', '€1.00 (2)'])assert.equal(money(value),null,value);
  assert.equal(money('Subtotal $0.01').minor,1);
});
test('DZD estimate keeps card fees out of bubble and rounds integer minor units',()=>{
  const usd=quote(10000,'USD');
  assert.equal(usd.converted,2500000);assert.equal(usd.service,125000);assert.equal(usd.bubble,2625000);assert.equal(usd.card,52500);assert.equal(usd.total,2677500);
  assert.equal(quote(10000,'EUR').bubble,2887500);
  assert.equal(quote(1,'EUR').bubble,289);
  for(const invalid of [-1,0.01,NaN,Infinity,100000001])assert.throws(()=>quote(invalid,'EUR'));
  assert.throws(()=>quote(100,'GBP'));assert.throws(()=>quote(100,'USD',{USD:0}));
});
test('cart reader refuses conflicting totals, missing counts and transient zero subtotals',()=>{
  assert.equal(consensus(['Subtotal €10.00','المجموع الفرعي 10.00€'],'Checkout (٢)').quantity,2);
  for(const [labels,count] of [[['€10.00','€11.00'],'Checkout (2)'],[['€0.00'],'Checkout (2)'],[['€10.00'],'Checkout (0)'],[['€10.00'],'Checkout'],[[],'Checkout (0)']])assert.equal(consensus(labels,count),null);
  assert.equal(consensus(['Subtotal €0.00'],'Checkout (0)').minor,0);
});

test('order preparation respects Temu minimum and invalid-item flags',()=>{
 const block=context.self.__tembyCompanionCore.cartBlocker;
 assert.equal(block({minor:2092,minimum:3000,invalid:0}),'minimum');
 assert.equal(block({minor:3000,minimum:3000,invalid:0}),null);
 assert.equal(block({minor:4000,minimum:3000,invalid:1}),'problem');
 assert.equal(block({minor:2092}),null);
});

test('prepared account and address skip setup without an intermediate account step',()=>{
 const step=context.self.__tembyCompanionCore.setupStep;
 assert.equal(step({account:{status:1},address:{confirmedAt:1}}),'review');
 assert.equal(step({account:{status:1},address:null}),'shipping');
 assert.equal(step({account:null,address:null}),'account');
});

test('unselected unavailable lines do not block the otherwise valid cart',()=>{
 const block=context.self.__tembyCompanionCore.cartBlocker;
 assert.equal(block({minor:2699,minimum:2000,invalid:1,selectedInvalid:0,unselectedInvalid:1}),null);
 assert.equal(block({minor:2699,minimum:2000,invalid:1,selectedInvalid:1}),'problem');
});

test('OTP extraction requires Temu verification context and refuses ambiguous codes',()=>{
 const extract=context.self.__tembyCompanionCore.emailOtp;
 assert.equal(extract({from:'Temu <notify@temu.com>',subject:'Your verification code is 123456',text:''}),'123456');
 assert.equal(extract({from:'Temu',subject:'Verify',text:'Your verification code:\n654321\nExpires shortly.'}),'654321');
 assert.equal(extract({from:'Temu',subject:'رمز التأكيد ١٢٣٤٥٦',text:''}),'123456');
 assert.equal(extract({from:'Other',subject:'Verification code 123456',text:''}),null);
 assert.equal(extract({from:'Temu',subject:'Order 123456',text:'Order total 1234'}),null);
 assert.equal(extract({from:'Temu',subject:'Verification 123456 or 654321',text:''}),null);
});
