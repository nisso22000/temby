import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {once} from 'node:events';
import {createServers} from '../src/server.js';
import type {Transport} from '../src/transport.js';

test('worker commits response cookies before initialization and broadcasts only committed state',async()=>{
  const hooks:Record<string,Function>={};let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const ready=new Promise<void>(resolve=>{started=resolve;});
  const notices:any[]=[];const db:any[]=[];
  const self:any={addEventListener(){},clients:{matchAll:async()=>[{postMessage(value:any){notices.push(value);}}]}};
  class Engine {on(name:string,callback:Function){hooks[name]=callback;}}
  const context={self,UVServiceWorker:Engine,location:{origin:'http://localhost:3001'},__uv$config:{},importScripts(){},URL,Response,encodeURIComponent};
  vm.runInNewContext(await readFile(new URL('../public/uv-request.js',import.meta.url),'utf8'),context);vm.runInNewContext(await readFile(new URL('../public/uv-sw.js',import.meta.url),'utf8'),context);
  const uv:any={meta:{url:new URL('https://www.temu.com/login.html')},cookie:{db:async()=>db,setCookies:async()=>{started();await gate;db.push({name:'owned',value:'fresh'},{name:'private',value:'hidden',httpOnly:true});},getCookies:async()=>db,serialize(values:any[],_meta:unknown,scriptOnly:boolean){assert.equal(scriptOnly,true);return values.filter(value=>!value.httpOnly).map(value=>value.name+'='+value.value).join('; ');}}};
  const pending=self.__tembyApplyResponseCookies(uv,['owned=fresh']);await ready;assert.equal(uv.__tembyResponseCookieString,undefined);assert.equal(notices.length,0);release();await pending;
  assert.equal(uv.__tembyResponseCookieString,'owned=fresh');assert.equal(notices.length,1);assert.equal(notices[0].msg,'updateCookies');assert.ok(!JSON.stringify(notices).includes('hidden'));
  const headers={'set-cookie':['owned=fresh'],'content-security-policy':"default-src 'self'"};hooks.beforemod({data:{ultraviolet:uv,headers,request:{request:{destination:'empty'},url:new URL('https://www.temu.com/api/owned')}}});
  assert.equal('set-cookie' in headers,false);assert.equal(headers['content-security-policy'],"default-src 'self'");
});

test('UV cookie expiry/deletion is authoritative while server HttpOnly and legacy fallback remain intact',async()=>{
  const transport:Transport=async(url,_method,headers)=>{
    const responseHeaders=new Headers({'content-type':'application/json'});
    if(url.pathname==='/owned-set'){responseHeaders.append('set-cookie','readable=server; Path=/; Secure');responseHeaders.append('set-cookie','private=server; Path=/; Secure; HttpOnly');}
    return new Response(JSON.stringify({received:headers.cookie||''}),{headers:responseHeaders}) as any;
  };
  const {app,merchant}=createServers(3960,3961,transport);app.listen(3960,'127.0.0.1');merchant.listen(3961,'127.0.0.1');await Promise.all([once(app,'listening'),once(merchant,'listening')]);
  const origin='http://localhost:3961';
  try{
    const entry=await fetch(origin+'/_state');const cookie=entry.headers.get('set-cookie')!.split(';')[0];
    const relay=async(path:string,virtualCookie='',engine:string|undefined='ultraviolet')=>{
      const response=await fetch(origin+'/_relay',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({url:'https://www.temu.com/'+path,method:'GET',engine,headers:{cookie:virtualCookie}})});
      const wire=await response.json();return JSON.parse(Buffer.from(wire.body,'base64').toString()).received as string;
    };
    await relay('owned-set');assert.equal(await relay('owned-read','readable=updated; private=shadow'),'readable=updated; private=server');
    assert.equal(await relay('owned-read'),'private=server','deleted script-visible cookies must not be resurrected by the server jar');
    assert.match(await relay('owned-read','', 'legacy'),/readable=server/);
  }finally{app.closeAllConnections();merchant.closeAllConnections();app.close();merchant.close();}
});
