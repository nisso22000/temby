import test from 'node:test';
import assert from 'node:assert/strict';
import { CookieJar } from 'tough-cookie';
import { Response } from 'undici';
import { gzipSync } from 'node:zlib';
import { createServer, get } from 'node:http';
import { once } from 'node:events';
import { targetAllowed, publicAddress, safeLookup } from '../src/policy.js';
import { createServers } from '../src/server.js';
import { boundedBody, dispatcher, type Transport } from '../src/transport.js';
import { Agent, fetch as undiciFetch } from 'undici';

test('allowlist rejects SSRF targets, credentials, bad ports and lookalike suffixes',()=>{
  for(const u of ['http://www.temu.com','https://www.temu.com:444','https://www.temu.com.evil.test','https://eviltemu.com','https://127.0.0.1','https://[::1]','https://a:b@www.temu.com','file:///etc/passwd']) assert.equal(targetAllowed(new URL(u)),false,u);
  assert.equal(targetAllowed(new URL('https://www.temu.com/dz-en/?q=bag')),true);
});
test('address policy rejects private, mapped IPv4, link-local, multicast and special-use addresses',()=>{
  for(const address of ['127.0.0.1','10.0.0.1','192.168.1.1','172.16.0.1','169.254.169.254','0.0.0.0','100.64.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1','224.0.0.1','not-an-ip']) assert.equal(publicAddress(address),false,address);
  assert.equal(publicAddress('8.8.8.8'),true);
});
test('connection lookup rejects nonallowlisted hosts before DNS',async()=>{
  await assert.rejects(new Promise((resolve,reject)=>safeLookup('localhost',{},(e,a,f)=>e?reject(e):resolve([a,f]))),/HOST_DENIED/);
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

test('active server isolates sessions, enforces local boundaries and removes retired routes',async()=>{
  let calls=0;const transport:Transport=async()=>{calls++;return new Response('owned') as any;};
  const {app,merchant}=createServers(3910,3911,transport);app.listen(3910,'127.0.0.1');merchant.listen(3911,'127.0.0.1');await Promise.all([once(app,'listening'),once(merchant,'listening')]);
  const appURL='http://localhost:3910',store='http://localhost:3911';
  try{
    const first=await fetch(appURL,{redirect:'manual'});const second=await fetch(appURL,{redirect:'manual'});
    const sid=first.headers.get('set-cookie')!.split(';')[0];const sid2=second.headers.get('set-cookie')!.split(';')[0];assert.notEqual(sid,sid2);assert.match(first.headers.get('set-cookie')!,/HttpOnly; SameSite=Strict/);
    for(const path of ['/engine/','/engine/sw.js','/plain-launch/','/plain-sw.js','/_p/www.temu.com/','/_fixture/checkout','/service/old'])assert.equal((await fetch(store+path,{redirect:'manual'})).status,404,path);
    assert.equal(calls,0,'retired routes never contact a merchant');
    const fixture=await fetch(store+'/_relay',{method:'POST',headers:{origin:store,'content-type':'application/json'},body:JSON.stringify({url:'https://fixture.temby.invalid/api/cart',method:'GET'})});assert.equal((await fixture.json()).status,403);assert.equal(calls,0,'test fixtures are disabled in the default server');
    assert.equal((await fetch(store+'/_relay',{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:'{}'})).status,403);
    const invalidHost=await new Promise<number|undefined>((resolve,reject)=>get(appURL+'/api/state',{headers:{host:'evil.test'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject));assert.equal(invalidHost,403);
    const state=await(await fetch(appURL+'/api/state',{headers:{cookie:sid}})).json();assert.deepEqual(Object.keys(state),['events']);assert.equal((await fetch(appURL+'/api/state')).headers.get('access-control-allow-origin'),null);
  }finally{app.closeAllConnections();merchant.closeAllConnections();app.close();merchant.close();}
});

test.after(async()=>{await dispatcher.close();});
