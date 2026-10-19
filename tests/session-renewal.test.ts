import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { Sessions } from '../src/sessions.js';

test('active sessions renew the same browser cookie rather than expiring at creation time',()=>{
  const sessions=new Sessions(1800000);let header='';
  const response={setHeader(name:string,value:string){assert.equal(name,'Set-Cookie');header=value;}} as unknown as ServerResponse;
  const first=sessions.get({headers:{}} as IncomingMessage,response);
  const cookie=header.split(';')[0];assert.match(header,/Max-Age=1800/);
  header='';
  const next=sessions.get({headers:{cookie}} as IncomingMessage,response);
  assert.equal(next,first);assert.equal(header.split(';')[0],cookie);assert.match(header,/Max-Age=1800/,'renew expiration on existing-session activity');assert.match(header,/HttpOnly; SameSite=Strict/);
});

test('default session cookie expires after one hour idle',()=>{
 let header='';new Sessions().get({headers:{}} as any,{setHeader(_name:string,value:string){header=value;}} as any);
 assert.match(header,/Max-Age=3600/);
});
