import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MessagePort,MessageChannel} from 'node:worker_threads';
import vm from 'node:vm';

test('real UV CSS rewriting preserves permitted resource origins for dynamic styles',async()=>{
  const self:any={navigator:{},location:{origin:'http://localhost:3001'}};
  const context={self,URL,location:self.location,navigator:self.navigator,MessagePort,MessageChannel,WebSocket,EventTarget,Event,Headers,Request,Response,Blob,fetch,TextEncoder,TextDecoder,crypto,atob,btoa,encodeURIComponent,decodeURIComponent};
  vm.createContext(context);
  vm.runInContext(await readFile(new URL('../node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.bundle.js',import.meta.url),'utf8'),context);
  const meta={origin:self.location.origin,url:new URL('https://www.temu.com/dz/home.html'),base:new URL('https://www.temu.com/dz/home.html')};
  const config={prefix:'/uv-service/',encodeUrl:encodeURIComponent,decodeUrl:decodeURIComponent};
  const original=new self.Ultraviolet(config);original.meta=meta;
  assert.match(original.rewriteCSS('url(/owned.png)',{context:'value',...meta}),/localhost:3001\/uv-service\//,'reproduce the original dynamic-CSS origin mismatch');
  vm.runInContext(await readFile(new URL('../public/uv-config.js',import.meta.url),'utf8'),context);
  const uv=new self.Ultraviolet(config);uv.meta=meta;
  for(const [css,expected]of [
    ['url(/owned.png)','https://www.temu.com/owned.png'],
    ['url(../owned.png)','https://www.temu.com/owned.png'],
    ['url(https://img.kwcdn.com/owned.png?format=avif)','https://img.kwcdn.com/owned.png?format=avif'],
    ['url(data:image/png;base64,AA==)','data:image/png;base64,AA=='],
  ]){
    const rewritten=uv.rewriteCSS(css,{context:'value',...meta});assert.ok(rewritten.includes(expected),rewritten);assert.ok(!rewritten.includes('localhost'));
  }
  const declaration=uv.rewriteCSS('.owned{background-image:url(/owned.png)}');assert.ok(declaration.includes('https://www.temu.com/owned.png'));assert.ok(!declaration.includes('localhost'));
  self.__tembyInlineHelpers={};
  vm.runInContext(await readFile(new URL('../public/uv-url.js',import.meta.url),'utf8'),context);
  const documentUV=new self.Ultraviolet(config);documentUV.meta=meta;documentUV.__tembyResponseCookieString='owned=fresh';
  const injected=documentUV.createHtmlInject('handler','bundle','client','config','owned=stale','referrer');
  const text=injected.flatMap((node:any)=>(node.childNodes||[]).map((child:any)=>child.value||'')).join('\n');assert.ok(text.includes('owned=fresh'));assert.ok(!text.includes('owned=stale'));
  const search='https://www.temu.com/search_result.html?search_key=pc';const physical=meta.origin+'/uv-service/'+encodeURIComponent(search);
  const login='https://www.temu.com/login.html?from='+encodeURIComponent(physical);
  const decoded=documentUV.sourceUrl(meta.origin+'/uv-service/'+encodeURIComponent(login));assert.equal(new URL(decoded).searchParams.get('from'),search);
});
