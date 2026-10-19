import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {LocalSessionStore} from '../src/session-store.js';
import {Sessions} from '../src/sessions.js';

test('encrypted local sessions restore cookie jars and test inboxes without plaintext customer state',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'temby-session-'));
  try{
    const key=randomBytes(32),store=new LocalSessionStore(directory,key);
    const sessions=new Sessions(undefined,store);let cookie='';
    const res:any={setHeader(_name:string,value:string){cookie=value.split(';')[0]!;}};
    const session=sessions.get({headers:{}} as any,res);const originalCookie=cookie;
    session.jar.setCookieSync('account=private-cookie; Secure; HttpOnly; Path=/','https://www.temu.com/');
    session.mailbox={address:'temby-'+ 'a'.repeat(36)+'@catchmail.io',checked:0};sessions.flush();
    const bytes=await readFile(join(directory,'sessions.enc'));assert.ok(!bytes.includes(Buffer.from('private-cookie')));assert.ok(!bytes.includes(Buffer.from('catchmail.io')));
    const restored=new Sessions(undefined,new LocalSessionStore(directory,key));
    const next=restored.get({headers:{cookie:originalCookie}} as any,res);
    assert.equal(cookie,originalCookie);assert.equal(next.jar.getCookieStringSync('https://www.temu.com/'),'account=private-cookie');assert.equal(next.mailbox?.address,session.mailbox.address);
    assert.equal(next.events.length,0,'diagnostic history is not persisted');
    assert.throws(()=>new LocalSessionStore(directory,randomBytes(32)).load(),'wrong key cannot restore customer data');restored.flush();
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('idle session expiration does not restore another customer or revive expired records',()=>{
  const past=Date.now()-10000;let saved:any=[{id:'b'.repeat(64),touched:past,jar:{cookies:[]}}];
  const sessions=new Sessions(5000,{load:()=>saved,save:value=>{saved=value;}});let header='';
  const session=sessions.get({headers:{cookie:'temby_sid='+'b'.repeat(64)}} as any,{setHeader(_name:string,value:string){header=value;}} as any);
  assert.ok(!header.startsWith('temby_sid='+'b'.repeat(64)));assert.equal(session.jar.getCookieStringSync('https://www.temu.com/'),'');sessions.flush();assert.equal(saved.length,1);
});

test('Windows DPAPI key survives reopening without a plaintext key file',{skip:process.platform!=='win32'},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'temby-dpapi-'));
  try{new LocalSessionStore(directory).save([{example:'synthetic-session'}]);assert.deepEqual(new LocalSessionStore(directory).load(),[{example:'synthetic-session'}]);const protectedKey=await readFile(join(directory,'session-key.dpapi'));assert.ok(protectedKey.length>32);}finally{await rm(directory,{recursive:true,force:true});}
});
