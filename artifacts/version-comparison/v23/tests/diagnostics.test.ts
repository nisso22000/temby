import test from 'node:test';
import assert from 'node:assert/strict';
import { responseMetadata } from '../src/diagnostics.js';
import { Sessions,record } from '../src/sessions.js';

test('API diagnostics retain endpoint names and numeric errors without sensitive values',()=>{
  const metadata=responseMetadata(new URL('https://www.temu.com/api/bg/items/12345?token=do-not-retain'),'application/json',Buffer.from('{"success":false,"error_code":40002,"message":"do-not-retain","token":"secret"}'));
  assert.deepEqual(metadata,{route:'/api/bg/items/[value]',errorCode:40002,applicationFailed:true});assert.ok(!JSON.stringify(metadata).includes('secret'));
  assert.equal(responseMetadata(new URL('https://www.temu.com/api/example'),'application/json',Buffer.from('{"success":true,"error_code":1000000}')).applicationFailed,undefined);
});
test('failed requests survive successful image bursts in bounded health metadata',()=>{
  const sessions=new Sessions();const session=sessions.get({headers:{}} as any,{setHeader(){}} as any);
  record(session,{host:'www.temu.com',method:'POST',status:200,type:'application/json',bytes:25,outcome:'relay',route:'/api/bg/example',errorCode:40002,applicationFailed:true});
  for(let i=0;i<150;i++)record(session,{host:'img.kwcdn.com',method:'GET',status:200,type:'image/avif',bytes:100,outcome:'relay'});
  assert.equal(session.events.length,100);assert.equal(session.failures.length,1);assert.equal(sessions.health()[0].errorCode,40002);assert.equal(sessions.health()[0].count,1);
});
