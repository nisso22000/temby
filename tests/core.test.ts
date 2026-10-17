import test from 'node:test';
import assert from 'node:assert/strict';
import { CookieJar } from 'tough-cookie';
import { Response } from 'undici';
import { gzipSync } from 'node:zlib';
import { createServer, get } from 'node:http';
import { once } from 'node:events';
import { targetAllowed, publicAddress, toProxy, fromProxy, safeLookup } from '../src/policy.js';
import { rewriteHTML } from '../src/rewrite.js';
import { temu, unavailable, extractFixture } from '../src/cart.js';
import { createServers } from '../src/server.js';
import { boundedBody, dispatcher, type Transport } from '../src/transport.js';
import { Agent, fetch as undiciFetch } from 'undici';

test('allowlist rejects SSRF targets, credentials, bad ports and lookalike suffixes',()=>{
  for(const u of ['http://www.temu.com','https://www.temu.com:444','https://www.temu.com.evil.test','https://eviltemu.com','https://127.0.0.1','https://[::1]','https://a:b@www.temu.com','file:///etc/passwd']) assert.equal(targetAllowed(new URL(u)),false,u);
  assert.equal(targetAllowed(new URL('https://www.temu.com/dz-en/?q=bag')),true);
  assert.throws(()=>fromProxy('/_p/evil.test/'));
});
test('address policy rejects private, mapped IPv4, link-local, multicast and special-use addresses',()=>{
  for(const address of ['127.0.0.1','10.0.0.1','192.168.1.1','172.16.0.1','169.254.169.254','0.0.0.0','100.64.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1','224.0.0.1','not-an-ip']) assert.equal(publicAddress(address),false,address);
  assert.equal(publicAddress('8.8.8.8'),true);
});
test('connection lookup rejects nonallowlisted hosts before DNS',async()=>{
  await assert.rejects(new Promise((resolve,reject)=>safeLookup('localhost',{},(e,a,f)=>e?reject(e):resolve([a,f]))),/HOST_DENIED/);
});
test('URL and HTML rewriting handles absolute, relative, forms, CDN, srcset, meta refresh and targets',()=>{
  const base=new URL('https://www.temu.com/dz-en/index.html');
  assert.equal(toProxy('../cart.html?x=1',base),'/_p/www.temu.com/cart.html?x=1');
  const html=rewriteHTML('<a href="https://www.temu.com/product.html?q=x" target="_top">item</a><form action="/cart"></form><img src="//img.kwcdn.com/a.png" srcset="/a.png 1x, /b.png 2x"><meta http-equiv="refresh" content="0;url=https://www.temu.com/dz-en/"><script integrity="sha256-test">location.assign("https://www.temu.com/")</script>',base);
  for(const value of ['/_p/www.temu.com/product.html?q=x','target="_self"','action="/_p/www.temu.com/cart"','/_p/img.kwcdn.com/a.png','/_p/www.temu.com/b.png 2x','0;url=/_p/www.temu.com/dz-en/','integrity="sha256-test"','location.assign("https://www.temu.com/")']) assert.ok(html.includes(value),value);
});
test('real adapter recognizes observed challenge and never fabricates cart',()=>{
  assert.match(temu.challenge('<script src="https://static.kwcdn.com/upload-static/assets/chl/js/a.js"></script>',200)!,/challenge/);
  assert.ok(temu.challenge('',403)); assert.equal(temu.extract(new URL('https://www.temu.com/cart'),{total:123}),null);
  assert.equal(unavailable().total,null); assert.equal(unavailable().complete,false);
});
test('fixture extraction keeps missing values unknown and validates checkout confirmation',()=>{
  const partial=extractFixture({items:[{quantity:'2'}],total:'25',currency:'$'});
  assert.equal(partial.total,null);assert.equal(partial.currency,null);assert.equal(partial.items[0].quantity,null);assert.equal(partial.complete,false);
  const data={stage:'checkout',currency:'USD',items:[{productId:'p',skuId:'s',title:'Pouch',quantity:2,unitPrice:12.5,variants:{color:'Black'}}],subtotal:25,shipping:3,discount:0,total:28};
  assert.equal(extractFixture(data).complete,true);
  assert.equal(extractFixture({...data,total:99}).complete,false);
  assert.equal(extractFixture({...data,stage:'cart'}).complete,false);
  assert.equal(extractFixture({...data,items:[{...data.items[0],unitPrice:1}]}).complete,false);
});
test('cookie jar enforces domain, Secure, expiry and customer separation',async()=>{
  const a=new CookieJar(), b=new CookieJar();
  await a.setCookie('secret=value; Domain=temu.com; Path=/; Secure; HttpOnly','https://www.temu.com/');
  assert.equal(await a.getCookieString('https://www.temu.com/cart'),'secret=value');
  assert.equal(await a.getCookieString('http://www.temu.com/'),'');
  assert.equal(await a.getCookieString('https://img.kwcdn.com/'),'');
  assert.equal(await b.getCookieString('https://www.temu.com/'),'');
  await a.setCookie('secret=gone; Domain=temu.com; Path=/; Max-Age=0','https://www.temu.com/');
  assert.equal(await a.getCookieString('https://www.temu.com/'),'');
});
test('decompression returns correct body and bounded reader limits decompressed bytes',async()=>{
  const fixture=createServer((_,r)=>{r.writeHead(200,{'content-encoding':'gzip'});r.end(gzipSync('compressed payload'));});
  fixture.listen(0,'127.0.0.1');await once(fixture,'listening');
  const agent=new Agent();
  try {const port=(fixture.address() as any).port; const response=await undiciFetch(`http://127.0.0.1:${port}`,{dispatcher:agent}); assert.equal((await boundedBody(response)).toString(),'compressed payload');
    await assert.rejects(boundedBody(new Response('12345') as any,4),/RESPONSE_TOO_LARGE/);
  }finally{await agent.close();fixture.close();}
});

test('HTTP integration: forwarding, redirects, challenge halt, sessions, fixture cart and security boundaries',async()=>{
  const seen:{url:string;method:string;headers:Record<string,string>;body?:string}[]=[];
  const transport:Transport=async(url,method,headers,body)=>{
    seen.push({url:url.href,method,headers,body:body?.toString()});
    if(url.pathname==='/redirect') return new Response('',{status:302,headers:{location:'https://www.temu.com/dz-en/'}}) as any;
    if(url.pathname==='/escape') return new Response('',{status:307,headers:{location:'https://evil.test/'}}) as any;
    if(url.pathname==='/challenge') return new Response('<script src="/assets/chl/js/test.js"></script>',{headers:{'content-type':'text/html'}}) as any;
    return new Response('<a href="/cart">Cart</a>',{headers:{'content-type':'text/html','set-cookie':'merchant_secret=test; Secure; HttpOnly; Path=/','content-security-policy':"default-src 'self'"}}) as any;
  };
  const {app,merchant}=createServers(3910,3911,transport); app.listen(3910,'127.0.0.1');merchant.listen(3911,'127.0.0.1');await Promise.all([once(app,'listening'),once(merchant,'listening')]);
  const appURL='http://localhost:3910',store='http://localhost:3911';
  try{
    const first=await fetch(appURL); const sid=first.headers.get('set-cookie')!.split(';')[0];
    assert.match(first.headers.get('set-cookie')!,/HttpOnly; SameSite=Strict/);
    const second=await fetch(appURL);const sid2=second.headers.get('set-cookie')!.split(';')[0];assert.notEqual(sid,sid2);
    const headers={cookie:sid,origin:appURL};
    const forwarded=await fetch(store+'/_p/www.temu.com/path?q=one',{method:'POST',headers:{...headers,authorization:'Bearer never-forward','content-type':'text/plain'},body:'quantity=2'});
    assert.equal(forwarded.status,200);assert.match(await forwarded.text(),/\/_p\/www.temu.com\/cart/);
    assert.equal(forwarded.headers.get('content-security-policy'),"default-src 'self'");
    assert.equal(seen[0].body,'quantity=2');assert.ok(seen[0].url.endsWith('?q=one'));
    assert.equal(seen[0].headers.authorization,undefined);assert.equal(seen[0].headers.cookie,undefined);
    assert.equal(seen[0].headers.origin,appURL);
    await fetch(store+'/_p/www.temu.com/next',{headers});assert.equal(seen[1].headers.cookie,'merchant_secret=test');
    await fetch(store+'/_p/www.temu.com/next',{headers:{cookie:sid2}});assert.equal(seen[2].headers.cookie,undefined);
    const redirect=await fetch(store+'/_p/www.temu.com/redirect',{headers,redirect:'manual'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/_p/www.temu.com/dz-en/');
    assert.equal((await fetch(store+'/_p/www.temu.com/escape',{headers,redirect:'manual'})).status,403);
    assert.equal((await fetch(store+'/_p/127.0.0.1/',{headers})).status,403);
    assert.equal((await fetch(store+'/_p/www.temu.com/login',{headers})).status,403);
    assert.equal((await fetch(store+'/_p/www.temu.com/',{headers:{...headers,'service-worker':'script'}})).status,403);
    assert.equal((await fetch(store+'/_fixture/update',{method:'POST',headers:{cookie:sid,origin:'https://evil.test'},body:''})).status,403);
    const invalidHostStatus=await new Promise<number|undefined>((resolve,reject)=>get(appURL+'/api/state',{headers:{host:'evil.test'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject));
    assert.equal(invalidHostStatus,403);
    const update=await fetch(store+'/_fixture/update',{method:'POST',headers,body:'quantity=2&color=Blue',redirect:'manual'});assert.equal(update.status,303);
    let state=await (await fetch(appURL+'/api/state?mode=fixture',{headers})).json(); assert.equal(state.cart.items[0].quantity,2);assert.equal(state.cart.complete,false);
    await fetch(store+'/_fixture/checkout',{headers});
    state=await (await fetch(appURL+'/api/state?mode=fixture',{headers})).json();assert.equal(state.cart.total,28);assert.equal(state.cart.items[0].variants.color,'Blue');assert.equal(state.cart.complete,true);
    const isolated=await (await fetch(appURL+'/api/state?mode=fixture',{headers:{cookie:sid2}})).json();assert.equal(isolated.cart.items.length,0);
    assert.equal((await fetch(store+'/_p/www.temu.com/challenge',{headers})).status,424);
    const before=seen.length; assert.equal((await fetch(store+'/_p/www.temu.com/',{headers})).status,409);assert.equal(seen.length,before);
    const live=await (await fetch(appURL+'/api/state',{headers})).json();assert.equal(live.cart.complete,false);assert.equal(live.cart.total,null);
    const logs=JSON.stringify(live.events);for(const secret of ['merchant_secret','quantity=2','q=one','never-forward',sid])assert.equal(logs.includes(secret),false);
    assert.equal((await fetch(appURL+'/api/state',{headers})).headers.get('access-control-allow-origin'),null);
  }finally{app.closeAllConnections();merchant.closeAllConnections();app.close();merchant.close();}
});
test.after(async()=>{await dispatcher.close();});
