import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('virtual-local and repeatedly encoded product URLs normalize before rewriting',async()=>{
  const context={self:{} as any,URL,decodeURIComponent};
  vm.runInNewContext(await readFile(new URL('../public/uv-url.js',import.meta.url),'utf8'),context);
  const origin='http://localhost:3001';const meta={origin,url:'https://www.temu.com/dz/home.html'};
  const normalize=context.self.__tembyUpstreamURL;
  const upstream='https://www.temu.com/product-g-123.html?variant=blue';
  const encoded=origin+'/uv-service/'+encodeURIComponent(upstream);
  assert.equal(normalize(origin+'/product-g-123.html?variant=blue',meta),upstream);
  assert.equal(normalize(encoded,meta),upstream);
  assert.equal(normalize(origin+'/uv-service/'+encodeURIComponent(encoded),meta),upstream);
  assert.equal(normalize('https://other.test/a',meta),'https://other.test/a');
  assert.equal(normalize('/relative',meta),'/relative');
  for(const special of ['blob:http://localhost:3001/owned-id','blob:https://www.temu.com/owned-id','data:text/plain,owned','about:blank','javascript:void(0)'])assert.equal(normalize(special,meta),special);
  assert.equal(normalize(origin+'/product', {origin,url:'https://fixture.temby.invalid/'}),'https://fixture.temby.invalid/product');
});

test('Ultraviolet config matches emitted dynamic import argument order',async()=>{
  const config=await readFile(new URL('../public/uv-config.js',import.meta.url),'utf8');
  class Engine {
    meta={origin:'http://localhost:3001',base:'https://fixture.temby.invalid/current'};
    rewriteUrl(value:string,meta:{base:string}){return new URL(value,meta.base).href;}
  }
  const context={self:{Ultraviolet:Engine},encodeURIComponent,decodeURIComponent};
  vm.runInNewContext(config,context);
  const instance=new Engine() as Engine&{rewriteImport:(base:string,specifier:string)=>string};
  assert.equal(instance.rewriteImport('https://fixture.temby.invalid/modules/main.js','./child.js'),'https://fixture.temby.invalid/modules/child.js');
  assert.equal(instance.rewriteImport('https://fixture.temby.invalid/','https://fixture.temby.invalid/module.js'),'https://fixture.temby.invalid/module.js');
});

test('inline helper script serialization preserves JavaScript operators and closes tags safely',async()=>{
  const {serialize,parse}=await import('parse5');
  class Engine {
    attrs={isForbidden:()=>true};html={on(){}};
    createHtmlInject():any[]{return [{tagName:'script',nodeName:'script',attrs:[{name:'src',value:'/owned-helper.js'}],childNodes:[],skip:true}];}
  }
  const code='const compare=()=>1<2&&2>1; const tag="</script>";';
  const context={self:{Ultraviolet:Engine,__tembyInlineHelpers:{'/owned-helper.js':code}},encodeURIComponent,decodeURIComponent};
  vm.runInNewContext(await readFile(new URL('../public/uv-config.js',import.meta.url),'utf8'),context);
  const nodes=new context.self.Ultraviolet().createHtmlInject();
  const html=serialize({nodeName:'#document-fragment',childNodes:nodes} as any);
  assert.ok(!html.includes('&gt;'));assert.ok(!html.includes('&amp;'));
  const tree:any=parse(html);const scripts:any[]=[];
  const visit=(n:any)=>{if(n.tagName==='script')scripts.push(n);for(const c of n.childNodes||[])visit(c);};visit(tree);
  assert.equal(scripts.length,1);new vm.Script(scripts[0].childNodes[0].value);
  context.self.__tembyInlineHelpers['/owned-helper.js']='const updated="</script>";';
  const refreshed=new context.self.Ultraviolet().createHtmlInject();assert.equal(refreshed[0].childNodes[0].value,'const updated="<\\/script>";','cached escaping invalidates changed helper content');
});

test('document initialization uses committed response cookies and script writes follow virtual navigation',async()=>{
  let injected:unknown[]=[];const messages:any[]=[];let write:Function|undefined;
  class Engine {attrs={isForbidden:()=>true};html={on(){}};createHtmlInject(...args:unknown[]){injected=args;return [];}}
  class Client {document={on(_type:string,callback:Function){write=callback;}};}
  const self:any={Ultraviolet:Engine,UVClient:Client,__tembyInlineHelpers:{},navigator:{serviceWorker:{controller:{postMessage(value:any){messages.push(value);}}}}};
  vm.runInNewContext(await readFile(new URL('../public/uv-config.js',import.meta.url),'utf8'),{self,location:{pathname:'/uv-service/'+encodeURIComponent('https://www.temu.com/')},encodeURIComponent,decodeURIComponent});
  const uv=new self.Ultraviolet();uv.__tembyResponseCookieString='owned=fresh';uv.createHtmlInject('handler','bundle','client','config','owned=stale','referrer');assert.equal(injected[4],'owned=fresh');
  const page={__uv:{meta:{url:new URL('https://www.temu.com/dz/owned-page')}}};new self.UVClient(page);write!({data:{value:'owned=updated; Path=/'}});
  assert.equal(messages[0].tembyCookieWrite.url,'https://www.temu.com/dz/owned-page');
  page.__uv.meta.url=new URL('https://www.temu.com/search_result.html');write!({data:{value:'owned=deleted; Max-Age=0'}});assert.equal(messages[1].tembyCookieWrite.url,'https://www.temu.com/search_result.html');
});
