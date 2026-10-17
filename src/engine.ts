import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { targetAllowed } from './policy.js';
import { readBody } from './proxy.js';
import { boundedBody, upstream, type Transport } from './transport.js';
import { record, type Session } from './sessions.js';
import { temu } from './cart.js';
import { parse } from 'parse5';
import { createHash } from 'node:crypto';
import { responseMetadata } from './diagnostics.js';
import { StaticCache } from './static-cache.js';
const staticCache=new StaticCache();
const binaryResponses=new WeakSet<ServerResponse>();

// Rate limiting belongs to a request, not to the entire browsing session.
// Retain the original response during its cooldown rather than retrying it or
// replacing unrelated pages with a local boundary document.
const rateLimits=new WeakMap<Session,Map<string,{until:number;headers:Record<string,string|string[]>;body:Buffer}>>();

function markupPolicies(html:string){
  let metaCsp=false,integrity=false;
  const visit=(node:any)=>{
    const attrs=new Map<string,string>((node.attrs||[]).map((a:any)=>[a.name,a.value]));
    if(node.tagName==='meta'&&attrs.get('http-equiv')?.trim().toLowerCase()==='content-security-policy')metaCsp=true;
    if(['script','link'].includes(node.tagName)&&attrs.get('integrity')?.trim())integrity=true;
    for(const child of node.childNodes||[])visit(child);
  };
  visit(parse(html));return {metaCsp,integrity};
}

const assetFiles: Record<string,[string,string]> = {
  '/plain-launch/':['public/plain.html','text/html'],
  '/plain-boot.js':['public/plain-boot.js','text/javascript'],
  '/plain-sw.js':['public/plain-sw.js','text/javascript'],
  '/uv/':['public/uv.html','text/html'],
  '/uv/boot.js':['public/uv-boot.js','text/javascript'],
  '/uv/config.js':['public/uv-config.js','text/javascript'],
  '/uv/transport.js':['public/uv-transport.js','text/javascript'],
  '/uv/diagnostics.js':['public/uv-diagnostics.js','text/javascript'],
  '/uv/sw.js':['public/uv-sw.js','text/javascript'],
  '/uv/request.js':['public/uv-request.js','text/javascript'],
  '/uv/bundle.js':['node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.bundle.js','text/javascript'],
  '/uv/client.js':['node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.client.js','text/javascript'],
  '/uv/handler.js':['node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.handler.js','text/javascript'],
  '/uv/worker.js':['node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.sw.js','text/javascript'],
  '/engine/': ['public/engine.html','text/html'],
  '/engine/boot.js':['public/engine-boot.js','text/javascript'],
  '/engine/sw.js':['public/engine-sw.js','text/javascript'],
  '/engine/toolbar.js':['public/engine-toolbar.js','text/javascript'],
  '/engine/runtime.js':['public/engine-runtime.js','text/javascript'],
  '/engine/core.js':['node_modules/@mercuryworkshop/scramjet/dist/scramjet_bundled.js','text/javascript'],
};
export async function engineAsset(path:string,res:ServerResponse,appOrigin='http://localhost:3000') {
  const asset=assetFiles[path]; if(!asset)return false;
  let data=await readFile(new URL('../'+asset[0],import.meta.url));
  if(path==='/uv/config.js')data=Buffer.concat([await readFile(new URL('../public/uv-transport.js',import.meta.url)),Buffer.from('\n'),await readFile(new URL('../public/uv-network.js',import.meta.url)),Buffer.from('\n'),await readFile(new URL('../public/uv-url.js',import.meta.url)),Buffer.from('\n'),await readFile(new URL('../public/uv-navigation.js',import.meta.url)),Buffer.from('\n'),data,Buffer.from('\n'),await readFile(new URL('../public/uv-diagnostics.js',import.meta.url))]);
  if(path==='/engine/toolbar.js'||path==='/engine/')data=Buffer.from(data.toString().replaceAll('__APP_ORIGIN__',appOrigin));
  res.writeHead(200,{'content-type':asset[1], 'cache-control':'no-store','service-worker-allowed':'/','x-content-type-options':'nosniff'});res.end(data);return true;
}
function wire(res:ServerResponse,status:number,headers:Record<string,string|string[]>,body:Buffer|string){
  if(binaryResponses.has(res)){
    const metadata=Buffer.from(JSON.stringify({status,statusText:'',headers}));
    const prefix=Buffer.alloc(4);prefix.writeUInt32BE(metadata.length);
    res.writeHead(200,{'content-type':'application/x-temby-binary','cache-control':'no-store','x-content-type-options':'nosniff'});
    res.write(prefix);res.write(metadata);res.end(body);return;
  }
  res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify({status,statusText:'',headers,body:Buffer.from(body).toString('base64')}));
}
function denied(res:ServerResponse,reason:string,status=403){wire(res,status,{'content-type':'text/html'},`<!doctype html><title>Temby boundary</title><h1>Temby proxy boundary</h1><p>${reason}</p>`);}
export async function engineRelay(req:IncomingMessage,res:ServerResponse,s:Session,transport:Transport=upstream){
  if(req.headers['x-temby-wire']==='binary-v1')binaryResponses.add(res);
  if(req.method!=='POST'){res.writeHead(405);res.end();return;}
  let input:any;let url:URL;
  try{input=JSON.parse((await readBody(req))!.toString());url=new URL(input.url);}catch{return denied(res,'Invalid relay request',400);}
  const method=String(input.method||'GET').toUpperCase();
  if(!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(method))return denied(res,'Method denied');
  if(url.origin==='https://fixture.temby.invalid'){record(s,{host:url.hostname,method,status:200,type:'owned-fixture',bytes:0,outcome:'Owned fixture '+url.pathname});return engineFixture(url,method,input,res);}
  if(!targetAllowed(url)) {record(s,{host:url.hostname.slice(0,253),method,status:403,type:'',bytes:0,outcome:'Destination outside allowlist'});return denied(res,'The local proxy blocked host '+url.hostname+'. It is outside the configured Temu/CDN and sign-in integration hosts.');}
  const rateKey=method+' '+url.href;
  const limits=rateLimits.get(s);
  const limited=limits?.get(rateKey);
  if(limited&&limited.until>Date.now())return wire(res,429,limited.headers,limited.body);
  limits?.delete(rateKey);
  try{
    const h:Record<string,string>={'user-agent':req.headers['user-agent']||'Temby-Local-Proxy/0.2','accept-encoding':'gzip, deflate, br'};
    // Preserve end-to-end headers produced by the actual page, including
    // opaque verification/signature fields. Never synthesize their values.
    // Transport, local credentials and virtual-origin headers are handled here
    // rather than blindly copying them onto the upstream connection.
    const blocked=new Set(['host','connection','proxy-connection','keep-alive','transfer-encoding','te','trailer','upgrade','content-length','accept-encoding','cookie','proxy-authorization','proxy-authenticate','set-cookie','origin','referer','user-agent','forwarded','expect']);
    const connection=Object.entries(input.headers||{}).find(([name])=>name.toLowerCase()==='connection')?.[1];
    if(typeof connection==='string')for(const name of connection.split(','))blocked.add(name.trim().toLowerCase());
    for(const [name,value]of Object.entries(input.headers||{})){
      const key=name.toLowerCase();
      if(typeof value==='string'&&/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(key)&&!blocked.has(key)&&!key.startsWith('x-forwarded-')&&!key.startsWith('x-temby-'))h[key]=value;
    }
    // Engines have already mapped these headers into the virtual site's URL
    // space. The local relay POST's Origin is unrelated to the original request.
    for(const [name,value]of Object.entries(input.headers||{})){
      const key=name.toLowerCase();
      if(!['origin','referer'].includes(key)||typeof value!=='string')continue;
      if(key==='origin'&&value==='null'){h.origin='null';continue;}
      try{const source=new URL(value);if(targetAllowed(source))h[key]=key==='origin'?source.origin:source.href;}catch{}
    }
    // Scramjet supplies cookies written by the proxied page's document.cookie.
    // Preserve server-set HttpOnly values if a page attempts to shadow them.
    const stored=await s.jar.getCookies(url.href);
    const cookies=new Map<string,string>();
    const browserCookies=Object.entries(input.headers||{}).find(([name])=>name.toLowerCase()==='cookie')?.[1];
    if(typeof browserCookies==='string' && browserCookies.length<=16384)for(const part of browserCookies.split(';')){
      const at=part.indexOf('=');const name=part.slice(0,at).trim();
      if(at>0 && name!=='temby_sid' && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name))cookies.set(name,part.slice(at+1).trim());
    }
    const virtualCookies=cookies.size;
    for(const c of stored)if(c.httpOnly||!cookies.has(c.key))cookies.set(c.key,c.value);
    if(cookies.size)h.cookie=[...cookies].map(([k,v])=>`${k}=${v}`).join('; ');
    const cacheKey=staticCache.key(url,method,String(input.destination||''),h);
    const cached=staticCache.get(cacheKey);
    if(cached){wire(res,200,cached.headers,cached.body);return;}
    const started=Date.now();const response=await transport(url,method,h,input.body?Buffer.from(input.body,'base64'):undefined);
    const data=await boundedBody(response);const type=response.headers.get('content-type')||'application/octet-stream';
    const challenge=temu.challenge(/html|javascript/.test(type)?data.toString():'',response.status);
    const destination=['document','iframe','script','style','image','font','empty','worker','sharedworker','serviceworker'].includes(input.destination)?input.destination:'unknown';
    // Custom header names can also be opaque; don't retain them in metadata.
    const omittedHeaders=[...new Set(Object.keys(input.headers||{}).map(x=>x.toLowerCase()).filter(x=>!(x in h)&&!['origin','referer','cookie','user-agent'].includes(x)).map(x=>blocked.has(x)&&['host','connection','authorization','proxy-authorization','content-length','accept-encoding'].includes(x)?x:'custom-or-hop-by-hop'))].slice(0,10);
    record(s,{host:url.hostname,method,status:response.status,type,bytes:data.length,cookiesSent:cookies.size,virtualCookies,setCookies:response.headers.getSetCookie().length,destination,omittedHeaders,...responseMetadata(url,type,data),elapsedMs:Date.now()-started,outcome:challenge?'Verification response delivered unchanged to generic engine':'Rewriting engine relay'});
    // 401/403 are normal application responses: they must not poison later
    // navigation, login pages, assets or unrelated API calls.
    // Cookie processing is independent of whether the body can be rewritten.
    // In particular, a verification fetch may set the navigation's cookie.
    for(const c of response.headers.getSetCookie())await s.jar.setCookie(c,url.href,{ignoreError:true});
    // Fetch/XHR HTML is data, not a document being rewritten. Its CSP/SRI
    // declarations must not cause us to discard the original response.
    if(!['empty','script','style','image','font'].includes(destination)&&type.includes('text/html')){
      const policy=markupPolicies(data.toString());
      if(response.headers.has('content-security-policy')){
        const csp=response.headers.get('content-security-policy')||'';
        record(s,{host:url.hostname,method,status:response.status,type:'policy-metadata',bytes:0,outcome:'CSP source classes: '+["'self'","'unsafe-inline'","'unsafe-eval'",'https:','http:','data:','blob:'].filter(value=>csp.split(/\s+|;/).includes(value)).join(', ')});
      }
      // Response-header CSP is restored unchanged after the engine's rewrite;
      // let the browser enforce it. Meta policies/SRI still need explicit
      // preservation support before this engine can transform those documents.
      if(policy.metaCsp||(policy.integrity&&input.engine!=='ultraviolet')){
        const kind=policy.metaCsp?'CSP meta element':'resource integrity attribute';
        record(s,{host:url.hostname,method,status:412,type,bytes:0,outcome:'Local protected-document rewriting refusal: '+kind});
        return denied(res,'Merchant document declares '+kind+'. Rewriting this protected document is unsupported.',412);
      }
    }
    const headers:Record<string,string|string[]>={};
    for(const [k,v]of response.headers)if(!['content-encoding','content-length','transfer-encoding','connection','set-cookie'].includes(k))headers[k]=v;
    headers['set-cookie']=response.headers.getSetCookie();
    staticCache.put(cacheKey,response.status,headers,data);
    if(response.status===429){
      const retry=response.headers.get('retry-after');
      const seconds=retry&&/^\d+$/.test(retry)?Number(retry):null;
      const until=seconds!==null?Date.now()+seconds*1000:retry?Date.parse(retry):NaN;
      const entries=rateLimits.get(s)||new Map();
      for(const [key,value]of entries)if(value.until<=Date.now())entries.delete(key);
      if(entries.size<16){
        // Cookie changes have already been applied; don't replay Set-Cookie.
        const cachedHeaders={...headers};delete cachedHeaders['set-cookie'];
        entries.set(rateKey,{until:Number.isFinite(until)?until:Date.now()+60000,headers:cachedHeaders,body:data});
        rateLimits.set(s,entries);
      }
    }
    if(headers.location){const dest=new URL(String(headers.location),url);if(!targetAllowed(dest))return denied(res,'Redirect destination outside merchant allowlist.');}
    wire(res,response.status,headers,data);
  }catch{record(s,{host:url.hostname,method,status:502,type:'',bytes:0,outcome:'Local relay upstream transport failure'});return denied(res,'Upstream transport failure (details omitted to protect session data).',502);}
}

function engineFixture(url:URL,method:string,input:any,res:ServerResponse){
  if(url.pathname==='/blob-context-check')return wire(res,200,{'content-type':'text/html','content-security-policy':"default-src https://fixture.temby.invalid 'unsafe-inline' 'unsafe-eval' blob: data:"},`<!doctype html><title>Owned blob worker test</title><h1>Internal worker test: NOT TEMU</h1><p id="result">Starting</p><script>const blob=new Blob(["self.onmessage=async()=>{try{const r=await fetch('https://fixture.temby.invalid/api/cart');self.postMessage((await r.json()).total);}catch{self.postMessage('failed');}};"],{type:'text/javascript'});const worker=new Worker(URL.createObjectURL(blob));worker.onmessage=e=>{document.getElementById('result').textContent='Blob worker relay response: '+e.data;worker.terminate();};worker.onerror=()=>document.getElementById('result').textContent='Blob worker failed';worker.postMessage('owned');</script>`);
  const headers={'content-type':'text/html'};
  if(url.pathname==='/api/pages'){const page=Math.min(3,Math.max(1,Number(url.searchParams.get('page'))||1));const referrer=Object.entries(input.headers||{}).find(([key])=>key.toLowerCase()==='referer')?.[1];return wire(res,200,{'content-type':'application/json'},JSON.stringify({page,virtualReferrerCorrect:referrer==='https://fixture.temby.invalid/infinite-check',items:Array.from({length:4},(_,i)=>'Owned item '+((page-1)*4+i+1))}));}
  if(url.pathname==='/owned-pixel.svg')return wire(res,200,{'content-type':'image/svg+xml'},'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="green"/></svg>');
  if(url.pathname==='/infinite-check')return wire(res,200,{'content-type':'text/html','content-security-policy':"default-src https://fixture.temby.invalid 'unsafe-inline' 'unsafe-eval' data: blob:"},`<!doctype html><title>Owned pagination and image test</title><h1>Owned pagination check: NOT TEMU</h1><p id="status">Starting</p><p id="image-status">Image pending</p><img id="responsive"><div style="height:700px">Scroll down to load more</div><div id="items"></div><div id="sentinel">Loading sentinel</div><script>let page=0,busy=false;const status=document.getElementById('status');const image=document.getElementById('responsive');image.onload=()=>document.getElementById('image-status').textContent='Dynamic srcset loaded';image.onerror=()=>document.getElementById('image-status').textContent='Dynamic srcset failed';image.srcset='/owned-pixel.svg 1x';async function load(){if(busy||page>=3)return;busy=true;try{const original=new Request('https://fixture.temby.invalid/api/pages?page='+(page+1));const clone=new Request(original);const response=await fetch(clone);const data=await response.json();if(!data.virtualReferrerCorrect)throw new Error("Owned referrer check failed");for(const label of data.items){const item=document.createElement('p');item.textContent=label;item.style.height='140px';document.getElementById('items').append(item);}page=data.page;status.textContent='Pages loaded: '+page+'; items: '+document.getElementById('items').children.length;}catch{status.textContent='Pagination request failed';}finally{busy=false;}}new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))load();}).observe(document.getElementById('sentinel'));load();</script>`);
  if(url.pathname==='/frame-check')return wire(res,200,headers,`<!doctype html><title>Owned frame policy test</title><h1>Owned frame policy test: NOT TEMU</h1><iframe id="opaque" sandbox="" srcdoc="<p>Owned opaque frame</p>"></iframe><p id="frame-result">Pending</p><script>window.addEventListener('load',()=>{try{document.getElementById('frame-result').textContent='Native cross-origin document is null: '+(document.getElementById('opaque').contentDocument===null);}catch{document.getElementById('frame-result').textContent='Frame getter threw';}});</script>`);
  if(url.pathname==='/echo-worker.js')return wire(res,200,{'content-type':'text/javascript'},"self.onmessage=async()=>{try{const r=await fetch('https://fixture.temby.invalid/api/cart');self.postMessage({total:(await r.json()).total});}catch{self.postMessage({failed:true});}};");
  if(url.pathname==='/beacon')return wire(res,200,{'content-type':'application/json'},JSON.stringify({received:Buffer.from(input.body||'','base64').toString()==='owned-beacon'}));
  if(url.pathname==='/transport-check')return wire(res,200,headers,`<!doctype html><title>Owned transport checks</title><h1>Owned transport checks: NOT TEMU</h1><button id="beacon">Check keepalive POST</button><p id="beacon-result">Pending</p><button id="worker">Check dedicated worker</button><p id="worker-result">Pending</p><script>document.getElementById('beacon').onclick=async()=>{try{const r=await fetch('https://fixture.temby.invalid/beacon',{method:'POST',keepalive:true,body:'owned-beacon'});document.getElementById('beacon-result').textContent='Keepalive body preserved: '+(await r.json()).received;}catch{document.getElementById('beacon-result').textContent='Keepalive failed';}};document.getElementById('worker').onclick=()=>{const w=new Worker('https://fixture.temby.invalid/echo-worker.js');w.onmessage=e=>{document.getElementById('worker-result').textContent='Worker API response: '+e.data.total;w.terminate();};w.onerror=()=>document.getElementById('worker-result').textContent='Worker failed';w.postMessage('owned');};</script>`);
  const nativeScript=`document.getElementById('native-assign').onclick=()=>location.assign('https://fixture.temby.invalid/native-assigned');document.getElementById('native-replace').onclick=()=>location.replace('https://fixture.temby.invalid/native-replaced');document.getElementById('native-open').onclick=()=>window.open('https://fixture.temby.invalid/native-popup','_blank');`;
  if(url.pathname==='/native-navigation.js')return wire(res,200,{'content-type':'text/javascript','access-control-allow-origin':'*'},nativeScript);
  if(url.pathname==='/native-navigation')return wire(res,200,headers,'<!doctype html><title>Owned native navigation test</title><h1>Owned native navigation test</h1><p>NOT TEMU. Owned test script is passed through unchanged.</p><button id="native-assign">Native assign</button><button id="native-replace">Native replace</button><button id="native-open">Native new tab</button><script src="https://fixture.temby.invalid/native-navigation.js" crossorigin="anonymous"></script>');
  const sriScript="document.getElementById('sri-result').textContent='SRI preserved: true';";
  if(url.pathname==='/sri.js')return wire(res,200,{'content-type':'text/javascript'},sriScript);
  if(url.pathname==='/csp-check')return wire(res,200,{'content-type':'text/html','content-security-policy':"default-src https://fixture.temby.invalid 'unsafe-inline' 'unsafe-eval' data: blob:"},'<!doctype html><title>Owned CSP and SRI test</title><h1>Owned CSP and integrity test</h1><p id="sri-result">SRI pending</p><p id="fetch-result">Fetch pending</p><button id="fetch">Fetch through CSP</button><script src="https://fixture.temby.invalid/sri.js" crossorigin="anonymous" integrity="sha384-'+createHash('sha384').update(sriScript).digest('base64')+'"></script><script>document.getElementById("fetch").onclick=async()=>{const r=await fetch("https://fixture.temby.invalid/api/cart");document.getElementById("fetch-result").textContent="CSP fetch: "+(await r.json()).total;};</script>');
  if(url.pathname==='/sri-check')return wire(res,200,headers,'<!doctype html><title>Owned SRI check</title><h1>Owned integrity test</h1><p id="sri-result">SRI pending</p><script src="https://fixture.temby.invalid/sri.js" crossorigin="anonymous" integrity="sha384-'+createHash('sha384').update(url.searchParams.has('bad')?'intentionally wrong owned test hash':sriScript).digest('base64')+'"></script>');
  if(url.pathname==='/cookie-check'){
    const expected=url.searchParams.get('cookieValue')||'missing';
    const cookies=String(Object.entries(input.headers||{}).find(([name])=>name.toLowerCase()==='cookie')?.[1]||'');
    return wire(res,200,headers,'<!doctype html><title>Owned cookie navigation check</title><h1>Owned cookie navigation: '+cookies.split(';').some(part=>part.trim()==='fixture_navigation='+expected)+'</h1><p>NOT TEMU. Cookie values are not displayed.</p>');
  }
  if(url.pathname==='/api/cart')return wire(res,200,{'content-type':'application/json'},JSON.stringify({synthetic:true,quantity:2,currency:'USD',total:28,scriptCookieReceived:String(Object.entries(input.headers||{}).find(([name])=>name.toLowerCase()==='cookie')?.[1]||'').includes('fixture_script='+(url.searchParams.get('cookieValue')||'known'))}));
  if(url.pathname==='/module.js')return wire(res,200,{'content-type':'text/javascript'},'export const label="Dynamic import through proxy: OK";');
  if(url.pathname==='/redirect')return wire(res,302,{...headers,location:'https://fixture.temby.invalid/product'},'');
  if(url.pathname==='/style.css')return wire(res,200,{'content-type':'text/css'},'body{font:18px system-ui;background:#f3f8f2;color:#173b32;padding:24px}button,a,input{font:inherit;margin:8px;padding:10px}');
  const path=(url.pathname.slice(1)||'home').replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
  wire(res,200,headers,`<!doctype html><title>OWNED PROXY FIXTURE ${path}</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fixture.temby.invalid/style.css"><h1>Owned proxy fixture: ${path}</h1><p>NOT TEMU. Tests execute through the local rewriting engine.</p><a href="https://fixture.temby.invalid/category">Absolute category link</a><a href="/product">Relative product link</a><a href="/redirect">HTTP redirect</a><button id="assign">JavaScript navigation</button><button id="api">Fetch cart</button><button id="xhr">XHR cart</button><button id="module">Dynamic import</button><button id="spa">SPA route</button><button id="generated">Generated JavaScript</button><button id="cookies">Cookie round trip</button><p id="result">Waiting for action</p><script>
document.querySelector('#assign').onclick=()=>location.assign('https://fixture.temby.invalid/product');
const navCookie=document.createElement('button');navCookie.textContent='Cookie navigation';document.body.append(navCookie);navCookie.onclick=()=>{const value=String(Math.random()).slice(2);document.cookie='fixture_navigation='+value+'; Path=/; Secure';location.assign('https://fixture.temby.invalid/cookie-check?cookieValue='+value);};
document.querySelector('#api').onclick=async()=>{const r=await fetch('https://fixture.temby.invalid/api/cart');document.querySelector('#result').textContent='Fetch cart: '+(await r.json()).total;};
document.querySelector('#xhr').onclick=()=>{const x=new XMLHttpRequest();x.open('GET','https://fixture.temby.invalid/api/cart');x.onload=()=>document.querySelector('#result').textContent='XHR cart: '+JSON.parse(x.responseText).total;x.send();};
document.querySelector('#module').onclick=async()=>{document.querySelector('#result').textContent=(await import('https://fixture.temby.invalid/module.js')).label;};
document.querySelector('#cookies').onclick=async()=>{const value=String(Math.random()).slice(2);document.cookie='fixture_script='+value+'; Path=/; Secure';const c=await(await fetch('https://fixture.temby.invalid/api/cart?cookieValue='+value)).json();document.querySelector('#result').textContent='Cookie round trip: '+c.scriptCookieReceived;};
document.querySelector('#generated').onclick=()=>{const run=new Function('return fetch('+JSON.stringify('https://fixture.temby.invalid/api/cart')+').then(r=>r.json())');run().then(c=>document.querySelector('#result').textContent='Generated JavaScript: '+c.total);};
document.querySelector('#spa').onclick=()=>{history.pushState({},'', '/spa');document.querySelector('#result').textContent='SPA route: '+location.pathname;};
</script>`);
}



