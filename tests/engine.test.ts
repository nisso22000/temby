import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Response } from 'undici';
import { createServers } from '../src/server.js';
import type { Transport } from '../src/transport.js';

test('full engine relay preserves challenge bytes, limits destinations, isolates cookies and respects explicit policies',async()=>{
  const seen:{url:string;headers:Record<string,string>;body?:Buffer}[]=[];
  const challenge='<script src="/assets/chl/js/test.js"></script>';
  const transport:Transport=async(url,method,headers,body)=>{
    seen.push({url:url.href,headers,body});
    if(url.pathname==='/policy')return new Response('protected',{headers:{'content-type':'text/html','content-security-policy':"default-src 'self'",'set-cookie':'verified=owned; Secure; HttpOnly; Path=/'}}) as any;
    if(url.pathname==='/policy-text')return new Response('<script>element.integrity = "example";</script>',{headers:{'content-type':'text/html'}}) as any;
    if(url.pathname==='/policy-attribute')return new Response('<script integrity="sha384-example" src="/owned.js"></script>',{headers:{'content-type':'text/html'}}) as any;
    if(url.pathname==='/escape')return new Response('',{status:302,headers:{location:'https://evil.test/'}}) as any;
    if(url.pathname==='/denied')return new Response('{"error":"owned-access-denied"}',{status:403,headers:{'content-type':'application/json'}}) as any;
    if(url.pathname==='/limited')return new Response('{"error":"owned-rate-limit"}',{status:429,headers:{'content-type':'application/json','retry-after':'120'}}) as any;
    return new Response(url.pathname==='/challenge'?challenge:'<h1>Owned relay response</h1>',{headers:{'content-type':'text/html','set-cookie':'private=test; Secure; HttpOnly; Path=/'}}) as any;
  };
  const {app,merchant}=createServers(3920,3921,transport);
  app.listen(3920,'127.0.0.1');merchant.listen(3921,'127.0.0.1');await Promise.all([once(app,'listening'),once(merchant,'listening')]);
  const origin='http://localhost:3921';
  try{
    const first=await fetch('http://localhost:3920');const cookie=first.headers.get('set-cookie')!.split(';')[0];
    const relay=async(url:string,sid=cookie,virtualCookie='',virtualHeaders:Record<string,string>={},destination?:string)=>await(await fetch(origin+'/_relay',{method:'POST',headers:{origin,cookie:sid,'content-type':'application/json','user-agent':'Owned-engine-test'},body:JSON.stringify({url,method:'GET',headers:{authorization:'never',cookie:virtualCookie,...virtualHeaders},destination})})).json();
    const passed=await relay('https://www.temu.com/challenge');assert.equal(passed.status,200);assert.equal(Buffer.from(passed.body,'base64').toString(),challenge);
    assert.equal(seen[0].headers.origin,undefined,'relay transport Origin must not be added to a virtual navigation');
    await relay('https://www.temu.com/next');assert.equal(seen[1].headers.cookie,'private=test');assert.equal(seen[1].headers.authorization,'never');assert.equal(seen[1].headers['user-agent'],'Owned-engine-test');
    await relay('https://www.temu.com/next','');assert.equal(seen[2].headers.cookie,undefined);
    await relay('https://www.temu.com/next',cookie,'script=value; private=shadow');assert.equal(seen[3].headers.cookie,'script=value; private=test');
    await relay('https://www.temu.com/next',cookie,'',{Origin:'https://www.temu.com',Referer:'https://www.temu.com/product'});
    assert.equal(seen[4].headers.origin,'https://www.temu.com');assert.equal(seen[4].headers.referer,'https://www.temu.com/product');
    await relay('https://www.temu.com/next',cookie,'',{Origin:origin,Referer:'http://127.0.0.1/private'});
    assert.equal(seen[5].headers.origin,undefined);assert.equal(seen[5].headers.referer,undefined);
    await relay('https://www.temu.com/next',cookie,'temby_sid=local-only',{ 'x-verification-proof':'owned-proof-unchanged','sec-ch-ua':'owned-browser-hint',host:'evil.test',connection:'x-hop-only','x-hop-only':'must-not-forward','x-forwarded-for':'must-not-forward'});
    assert.equal(seen[6].headers['x-verification-proof'],'owned-proof-unchanged');assert.equal(seen[6].headers['sec-ch-ua'],'owned-browser-hint');
    assert.equal(seen[6].headers.host,undefined);assert.equal(seen[6].headers['x-hop-only'],undefined);assert.equal(seen[6].headers['x-forwarded-for'],undefined);assert.ok(!seen[6].headers.cookie.includes('local-only'));
    const policyDocument=await relay('https://www.temu.com/policy');assert.equal(policyDocument.status,200);assert.equal(policyDocument.headers['content-security-policy'],"default-src 'self'");
    const policyFetch=await relay('https://www.temu.com/policy',cookie,'',{},'empty');assert.equal(policyFetch.status,200);assert.equal(policyFetch.headers['content-security-policy'],"default-src 'self'");assert.equal(Buffer.from(policyFetch.body,'base64').toString(),'protected');
    assert.equal((await relay('https://www.temu.com/policy-text',cookie,'',{},'document')).status,200);assert.equal((await relay('https://www.temu.com/policy-attribute',cookie,'',{},'document')).status,412);
    const beforeCookies=seen.length;await relay('https://www.temu.com/next');assert.ok(seen[beforeCookies].headers.cookie.includes('verified=owned'));
    const loginPage=await relay('https://www.temu.com/login.html');
    assert.equal(loginPage.status,200);assert.match(Buffer.from(loginPage.body,'base64').toString(),/Owned relay response/);
    const beforeSubmission=seen.length;
    const loginSubmission=await fetch(origin+'/_relay',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({url:'https://www.temu.com/login.html',method:'POST',body:Buffer.from('owned-test-body').toString('base64')})});
    assert.equal((await loginSubmission.json()).status,200);assert.equal(seen.length,beforeSubmission+1,'normal form requests use the same generic relay');
    assert.equal((await relay('https://www.temu.com/escape')).status,403);
    const before=seen.length;assert.equal((await relay('https://127.0.0.1/')).status,403);assert.equal(seen.length,before);
    const fixture=await relay('https://fixture.temby.invalid/api/cart');assert.equal(JSON.parse(Buffer.from(fixture.body,'base64').toString()).synthetic,true);assert.equal(seen.length,before);
    const denied=await relay('https://www.temu.com/denied');assert.equal(denied.status,403);assert.equal(Buffer.from(denied.body,'base64').toString(),'{"error":"owned-access-denied"}');const deniedCount=seen.length;assert.equal((await relay('https://www.temu.com/next')).status,200);assert.equal(seen.length,deniedCount+1);
    const limited=await relay('https://www.temu.com/limited');assert.equal(limited.status,429);assert.equal(limited.headers['retry-after'],'120');
    const limitedCount=seen.length;const held=await relay('https://www.temu.com/limited');assert.equal(held.status,429);assert.equal(held.body,limited.body);assert.equal(seen.length,limitedCount,'do not retry the rate-limited endpoint during Retry-After');
    assert.equal((await relay('https://www.temu.com/next')).status,200);assert.equal(seen.length,limitedCount+1,'unrelated requests remain usable after a 429');
    const script=await fetch(origin+'/engine/sw.js');assert.equal(script.status,200);assert.equal(script.headers.get('service-worker-allowed'),'/');
    const clientConfig=await(await fetch(origin+'/uv/config.js')).text();assert.ok(clientConfig.includes('self.Ultraviolet.BareClient=RelayClient'));assert.ok(clientConfig.indexOf('self.Ultraviolet.BareClient=RelayClient')<clientConfig.indexOf('self.UVClient=class'));
    let count=seen.length;assert.equal((await fetch(origin+'/.well-known/appspecific/com.chrome.devtools.json')).status,404);assert.equal(seen.length,count);
    const escaped=await fetch(origin+'/search_result.html?search_key=blue%20shoes',{redirect:'manual',headers:{referer:origin+'/uv-service/'+encodeURIComponent('https://www.temu.com/')}});
    assert.equal(escaped.status,307);assert.equal(escaped.headers.get('location'),'/uv-service/'+encodeURIComponent('https://www.temu.com/search_result.html?search_key=blue%20shoes'));assert.equal(seen.length,count);
    for(const path of ['/search_result.html?search_key=%D8%A7%D9%84%D9%87%D8%A7%D8%AA%D9%81','/bgn_verification.html?verifyCode=owned-test-value&from=https%3A%2F%2Fwww.temu.com%2F']){
      const recovered=await fetch(origin+path,{redirect:'manual'});assert.equal(recovered.status,307);assert.equal(recovered.headers.get('location'),'/uv-service/'+encodeURIComponent('https://www.temu.com'+path));
    }
    assert.equal((await fetch(origin+'/unknown.html',{redirect:'manual'})).status,404,'unknown local URLs without a proxy referrer must not fetch merchant content');assert.equal(seen.length,count);
    const report=await fetch(origin+'/api/sec-csp/110000006/enforce',{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/csp-report',referer:origin+'/uv-service/'+encodeURIComponent('https://www.temu.com/')},body:'{"csp-report":{"document-uri":"owned-test"}}'});
    assert.equal(report.status,200);assert.equal(report.headers.get('location'),null);assert.equal(seen.length,count+1);assert.equal(seen[count].url,'https://www.temu.com/api/sec-csp/110000006/enforce');assert.equal(seen[count].body?.toString(),'{"csp-report":{"document-uri":"owned-test"}}');count=seen.length;
    const entry=await fetch('http://localhost:3920/',{redirect:'manual'});assert.equal(entry.status,302);assert.equal(entry.headers.get('location'),origin+'/uv/');
    const cold=await fetch(origin+'/uv-service/'+encodeURIComponent('https://fixture.temby.invalid/product'),{headers:{accept:'text/html'}});
    assert.equal(cold.status,200);assert.match(await cold.text(),/\/uv\/boot.js/);assert.equal(seen.length,count);
    const runtime=await fetch(origin+'/_runtime',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({phase:'page-error',error:'TypeError',message:'private-do-not-record',cookie:'secret'})});assert.equal(runtime.status,204);
    const submission=await fetch(origin+'/_relay',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({url:'https://www.temu.com/register?private=not-recorded',method:'POST'})});
    assert.equal((await submission.json()).status,200);
    const state=await(await fetch('http://localhost:3920/api/state',{headers:{cookie}})).json();assert.equal(state.cart.total,null);
    assert.ok(!JSON.stringify(state.events).includes('private=test'));
    assert.ok(state.events.some((event:{outcome:string})=>event.outcome==='page-error: TypeError'));assert.ok(!JSON.stringify(state.events).includes('private-do-not-record'));
    assert.ok(!JSON.stringify(state.events).includes('Local sensitive-workflow rule'));assert.ok(!JSON.stringify(state.events).includes('not-recorded'));
  }finally{app.closeAllConnections();merchant.closeAllConnections();app.close();merchant.close();}
});
