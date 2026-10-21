import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const context:any={self:{},URL,Date,setTimeout,clearTimeout,TextEncoder};
vm.runInNewContext(await readFile(new URL('../public/companion-cart.js',import.meta.url),'utf8'),context);
const reader=context.self.__tembyCartClient;
const fixture=JSON.parse(await readFile(new URL('./fixtures/mobile-cart-bootstrap.json',import.meta.url),'utf8'));

test('merchant client is discovered at mobile homepage and cart store locations',async()=>{
 for(const nested of [false,true]){
  let calls=0;
  const service={async postRisk(this:any){assert.equal(this,service);calls++;return fixture;}};
  const page:any={__INITIAL_PROPS__:nested?{stores:{store:{$service:service}}}:{store:{$service:service}},document:{readyState:'complete'},setTimeout};
  Object.defineProperty(page.document,'cookie',{get(){throw Error('The bridge must not extract merchant credentials');}});
  const result=await reader.read(page,0);assert.equal(result.available,true);assert.equal(result.accepted,true);assert.equal(calls,1);assert.deepEqual(Object.keys(result).sort(),['accepted','available']);
 }
});

test('client lookup waits for merchant hydration without sending speculative requests',async()=>{
 const page:any={rawData:{stores:{store:{}}},document:{readyState:'complete'},setTimeout};let calls=0;
 const timer=setTimeout(()=>{page.__INITIAL_PROPS__={stores:{store:{$service:{async postRisk(){calls++;return fixture;}}}}};},20);
 try{const result=await reader.read(page,500);assert.equal(result.accepted,true);assert.equal(calls,1);}finally{clearTimeout(timer);}
});

test('absent clients, refusals and count-only replies are distinguished from full cart data',async()=>{
 assert.equal((await reader.read({document:{readyState:'complete'},setTimeout},0)).available,false);
 for(const value of [{success:false},{success:true,result:{count:7}},null]){
  let calls=0;const result=await reader.read({__INITIAL_PROPS__:{stores:{store:{$service:{async postRisk(){calls++;return value;}}}}},setTimeout},0);
  assert.equal(result.available,true);assert.equal(result.accepted,false);assert.equal(calls,1);
 }
 const failed=await reader.read({__INITIAL_PROPS__:{store:{$service:{async postRisk(){throw Error('private error must not leave the page');}}}},setTimeout},0);
 assert.equal(failed.available,true);assert.equal(failed.accepted,false);assert.ok(!JSON.stringify(failed).includes('private'));
});
