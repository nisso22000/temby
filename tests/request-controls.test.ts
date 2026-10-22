import test from 'node:test';
import assert from 'node:assert/strict';
import {Cooldowns} from '../src/request-controls.js';
import {ConcurrencyGate,CapacityError} from '../src/concurrency.js';
import {NetworkFilter} from '../src/network-filter.js';
import {CookieJar} from 'tough-cookie';
import type {Session} from '../src/sessions.js';

test('cooldowns isolate operation bodies, credentials and sessions, respect expiry and bound retained bytes',()=>{
 let now=100000;const store=new Cooldowns(1024,2,()=>now);
 const session=():Session=>({jar:new CookieJar(),touched:now,events:[],failures:[]});
 const a=session(),b=session(),url=new URL('https://www.temu.com/api/example?token=secret');
 const key=store.key(a,url,'POST',{cookie:'secret'},Buffer.from('first'));
 assert.match(key,/^[a-f0-9]{64}$/);assert.ok(!key.includes('secret'));
 store.put(key,{'retry-after':'10','set-cookie':['private=value'],'content-type':'application/json'},Buffer.from('original'));
 assert.equal(store.get(key)?.body.toString(),'original');assert.equal(store.get(key)?.headers['set-cookie'],undefined);
 for(const other of [store.key(b,url,'POST',{cookie:'secret'},Buffer.from('first')),store.key(a,url,'POST',{cookie:'changed'},Buffer.from('first')),store.key(a,url,'POST',{cookie:'secret'},Buffer.from('different'))])assert.equal(store.get(other),undefined);
 now+=10001;assert.equal(store.get(key),undefined);
 store.put(key,{'retry-after':'10'},Buffer.alloc(100000));assert.ok(store.stats().bytes<=1024);assert.match(store.get(key)!.body.toString(),/cooldown/);
 for(const k of ['one','two','three'])store.put(k,{'retry-after':'10'},Buffer.alloc(800));
 assert.ok(store.stats().bytes<=1024);assert.ok(store.stats().entries<=2);
 store.put('absent',{},Buffer.from('none'));assert.equal(store.get('absent'),undefined);
});

test('concurrency bounds origins and total work, cancels queued work and releases idempotently',async()=>{
 const gate=new ConcurrencyGate(2,1,2),signal=new AbortController().signal;
 const a=await gate.acquire('a',signal),b=await gate.acquire('b',signal);
 let started=false;const pending=gate.acquire('a',signal).then(release=>{started=true;return release;});
 const cancel=new AbortController();const canceled=gate.acquire('c',cancel.signal);const rejection=assert.rejects(canceled);cancel.abort();await rejection;
 assert.equal(started,false);b();b();assert.equal(started,false,'free global capacity does not exceed per-origin capacity');
 a();const release=await pending;assert.equal(started,true);release();assert.deepEqual(gate.stats(),{active:0,queued:0});
 const tight=new ConcurrencyGate(1,1,0);const held=await tight.acquire('a',signal);await assert.rejects(tight.acquire('b',signal),CapacityError);held();
});

test('explicit optional rules match host boundaries and paths without blocking documents',()=>{
 const filter=new NetworkFilter('balanced');
 for(const url of ['https://eu.pftk.temu.com/report','https://eu.thtk.temu.com/report','https://www.temu.com/api/adx/cm/ttc','https://adtk-eu.temu.com/c/ad'])assert.equal(filter.blocked(new URL(url),'empty'),true,url);
 for(const url of ['https://www.temu.com/api/cart','https://static.kwcdn.com/app.js','https://pftk.temu.com.evil.test/'])assert.equal(filter.blocked(new URL(url),'empty'),false,url);
 assert.equal(filter.blocked(new URL('https://eu.pftk.temu.com/'),'document'),false);
 assert.equal(new NetworkFilter('off').blocked(new URL('https://eu.pftk.temu.com/'),'empty'),false);
 assert.equal(new NetworkFilter().blocked(new URL('https://eu.pftk.temu.com/'),'empty'),false,'default leaves verification-adjacent traffic untouched');
 assert.throws(()=>new NetworkFilter('full' as any));
});
