import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const context:any={self:{},setTimeout,clearTimeout,TextEncoder};
vm.runInNewContext(await readFile(new URL('../public/companion-cart.js',import.meta.url),'utf8'),context);
const api=context.self.__tembyCartState;

test('cart identity digest follows authentication, not unrelated tracking cookies',async()=>{
  const first=await api.scope('PDDAccessToken=owned-secret; tracking=one',webcrypto);
  assert.match(first,/^[a-f0-9]{64}$/);assert.ok(!first.includes('owned-secret'));
  assert.equal(first,await api.scope('tracking=two; PDDAccessToken=owned-secret',webcrypto));
  assert.notEqual(first,await api.scope('PDDAccessToken=different-account',webcrypto));
  assert.equal(await api.scope('tracking=one',webcrypto),null,'unknown identity never restores a saved account');
});

test('verification proofs can rotate during a cart request without changing cart identity',async()=>{
  const scope=(header:string)=>api.scope(header,webcrypto);
  const guest=await scope('api_uid=guest-cart; AccessToken=; user_uin=; verifyAuthToken=before');
  assert.equal(guest,await scope('api_uid=guest-cart; verifyAuthToken=after; _nano_fp=changed-device-proof'));
  assert.notEqual(guest,await scope('api_uid=another-guest; verifyAuthToken=after'));
  const account=await scope('AccessToken=account-a; user_uin=123; api_uid=guest-before; verifyAuthToken=before');
  assert.equal(account,await scope('AccessToken=account-a; user_uin=123; api_uid=guest-after; verifyAuthToken=after; csrfToken=rotated'));
  assert.notEqual(account,await scope('AccessToken=account-b; user_uin=456; api_uid=guest-after'));
  assert.notEqual(account,await scope('user_uin=123; api_uid=guest-after'),'remembered account ID after logout cannot restore the signed-in cart');
  assert.equal(await scope('verifyAuthToken=proof-only'),null,'verification alone never establishes cart ownership');
});

test('cart state falls back safely when storage is denied and rejects old responses after logout',async()=>{
  const store=api.create({open(){throw Error('Storage denied');}});
  const origin='https://www.temu.com',snapshot={startedAt:100,data:{owned:true}};
  assert.equal(await store.put(origin,'account-a',snapshot),true);
  assert.equal((await store.get(origin,'account-a')).startedAt,100);
  await store.problem(origin,'account-a',{reason:'http-error',time:110,status:403});
  assert.equal((await store.get(origin,'account-a')).issue.status,403,'a navigation cannot erase a known update failure');
  assert.equal(await store.get(origin,'account-b'),null);
  await store.markAttempt(origin,'account-a',150);assert.equal(await store.attempted(origin,'account-a',151),true);
  assert.equal(await store.attempted(origin,'account-a',30150),false,'a refusal can be retried after the shared cooldown');
  assert.equal(await store.revalidate(origin,'account-a',151),false);
  assert.equal(await store.put(origin,'account-a',{startedAt:160,data:{owned:true}}),true);
  assert.equal(await store.revalidate(origin,'account-a',15160),false,'saving the answer keeps the read cooldown');
  assert.equal(await store.revalidate(origin,'account-a',30150),true,'a new tab rechecks an old saved cart after the cooldown');
  await store.clear(origin,200);
  assert.equal(await store.attempted(origin,'account-a'),false,'logout invalidates the previous initialization attempt too');
  assert.equal(await store.put(origin,'account-a',snapshot),false);
  assert.equal(await store.put(origin,'account-a',{startedAt:201,requestStartedAt:199,data:{owned:true}}),false,'a pre-logout request cannot restore the cart when its response arrives later');
  assert.equal(await store.get(origin,'account-a'),null);
  assert.equal(await store.put(origin,'account-b',{startedAt:201,data:{owned:true}}),true);
  assert.equal(await store.get(origin,'account-a'),null);
});
