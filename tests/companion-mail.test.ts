import test from 'node:test';
import assert from 'node:assert/strict';
import {companionMail} from '../src/companion-mail.js';
import type {Session} from '../src/sessions.js';

test('test inboxes are session-bound and never accept arbitrary mailbox input',async()=>{
  const first={} as Session,second={} as Session;
  const origin='http://localhost:3001';
  const call=async(session:Session,method:string,headers:Record<string,string>={},fetcher:any=()=>{throw Error('Network should not be called');})=>{
    let status=0,body:any;
    const res={writeHead(code:number){status=code;},end(value:string){body=JSON.parse(value);}};
    await companionMail({method,headers:{origin,'x-temby-companion':'1',...headers}} as any,res as any,session,origin,fetcher);
    return {status,body};
  };
  assert.equal((await call(first,'POST',{'x-temby-companion':''})).status,403);
  assert.equal((await call(first,'POST',{origin:'https://evil.test'})).status,403);
  assert.equal((await call(first,'DELETE')).status,405);
  assert.equal((await call(first,'GET')).status,409);
  const a=await call(first,'POST'),b=await call(second,'POST');
  assert.match(a.body.address,/^temby-[a-f0-9]{36}@catchmail\.io$/);
  assert.notEqual(a.body.address,b.body.address);
  assert.equal((await call(first,'POST')).body.address,a.body.address);
  const urls:string[]=[];
  const checked=await call(first,'GET',{},async(url:string)=>{urls.push(url);return new Response(JSON.stringify({messages:[]}));});
  assert.equal(checked.status,200);assert.deepEqual(checked.body.messages,[]);
  assert.ok(urls[0].includes(encodeURIComponent(a.body.address)));
  assert.equal((await call(first,'GET')).status,429);
});
