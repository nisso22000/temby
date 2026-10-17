import type { IncomingMessage, ServerResponse } from 'node:http';
import { helperAsset } from './helper-assets.js';
import { binaryHead,streamBinary } from './relay-stream.js';
import { targetAllowed } from './policy.js';
import { readBody } from './http.js';
import { boundedBody, upstream, type Transport } from './transport.js';
import { record, type Session } from './sessions.js';
import { parse } from 'parse5';
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
};
export async function engineAsset(path:string,res:ServerResponse,req?:IncomingMessage) {
  const asset=assetFiles[path]; if(!asset)return false;
  const files=path==='/uv/config.js'?['public/uv-transport.js','public/uv-network.js','public/uv-url.js','public/uv-navigation.js',asset[0],'public/uv-diagnostics.js']:[asset[0]];
  const {data,etag}=await helperAsset(files.map(file=>new URL('../'+file,import.meta.url)));
  const headers={'content-type':asset[1],'cache-control':'no-cache',etag,'service-worker-allowed':'/','x-content-type-options':'nosniff'};
  const unchanged=['GET','HEAD'].includes(req?.method||'GET')&&req?.headers['if-none-match']?.split(',').some(value=>value.trim().replace(/^W\//,'')===etag||value.trim()==='*');
  res.writeHead(unchanged?304:200,headers);res.end(unchanged||req?.method==='HEAD'?undefined:data);return true;
}
function wire(res:ServerResponse,status:number,headers:Record<string,string|string[]>,body:Buffer|string){
  if(binaryResponses.has(res)){
    binaryHead(res,status,headers);res.end(body);return;
  }
  res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify({status,statusText:'',headers,body:Buffer.from(body).toString('base64')}));
}
function denied(res:ServerResponse,reason:string,status=403){wire(res,status,{'content-type':'text/html'},`<!doctype html><title>Temby boundary</title><h1>Temby proxy boundary</h1><p>${reason}</p>`);}
export async function engineRelay(req:IncomingMessage,res:ServerResponse,s:Session,transport:Transport=upstream,ownedFixtures=false){
  if(req.headers['x-temby-wire']==='binary-v1')binaryResponses.add(res);
  if(req.method!=='POST'){res.writeHead(405);res.end();return;}
  let input:any;let url:URL;
  try{input=JSON.parse((await readBody(req))!.toString());url=new URL(input.url);}catch{return denied(res,'Invalid relay request',400);}
  const method=String(input.method||'GET').toUpperCase();
  if(!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(method))return denied(res,'Method denied');
  if(url.origin==='https://fixture.temby.invalid'){
    if(!ownedFixtures)return denied(res,'Owned test fixtures are disabled on this server');
    record(s,{host:url.hostname,method,status:200,type:'owned-fixture',bytes:0,outcome:'Owned fixture '+url.pathname});const {engineFixture}=await import('../test-support/owned-fixtures.js');return engineFixture(url,method,input,res,wire);
  }
  if(!targetAllowed(url)) {record(s,{host:url.hostname.slice(0,253),method,status:403,type:'',bytes:0,outcome:'Destination outside allowlist'});return denied(res,'The local proxy blocked host '+url.hostname+'. It is outside the configured Temu/CDN and sign-in integration hosts.');}
  const rateKey=method+' '+url.href;
  const limits=rateLimits.get(s);
  const limited=limits?.get(rateKey);
  if(limited&&limited.until>Date.now())return wire(res,429,limited.headers,limited.body);
  limits?.delete(rateKey);
  const abort=new AbortController();
  const disconnect=()=>{if(!res.writableFinished)abort.abort();};
  const cancellable=['GET','HEAD'].includes(method);
  if(cancellable){req.once('aborted',disconnect);res.once('close',disconnect);if(res.destroyed)abort.abort();}
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
    // The engine supplies cookies written by the proxied page's document.cookie.
    // Preserve server-set HttpOnly values if a page attempts to shadow them.
    const stored=await s.jar.getCookies(url.href);
    const cookies=new Map<string,string>();
    const browserCookies=Object.entries(input.headers||{}).find(([name])=>name.toLowerCase()==='cookie')?.[1];
    if(typeof browserCookies==='string' && browserCookies.length<=16384)for(const part of browserCookies.split(';')){
      const at=part.indexOf('=');const name=part.slice(0,at).trim();
      if(at>0 && name!=='temby_sid' && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name))cookies.set(name,part.slice(at+1).trim());
    }
    const virtualCookies=cookies.size;
    // UV owns script-visible cookie expiry/deletion. Reintroducing a cookie
    // absent from its current header resurrects stale browser state. Retain
    // server authority for HttpOnly cookies and legacy-engine compatibility.
    for(const c of stored)if(c.httpOnly||(input.engine!=='ultraviolet'&&!cookies.has(c.key)))cookies.set(c.key,c.value);
    if(cookies.size)h.cookie=[...cookies].map(([k,v])=>`${k}=${v}`).join('; ');
    const cacheKey=staticCache.key(url,method,String(input.destination||''),h);
    const cached=staticCache.get(cacheKey);
    if(cached){wire(res,200,cached.headers,cached.body);return;}
    const started=Date.now();const response=await transport(url,method,h,input.body?Buffer.from(input.body,'base64'):undefined,cancellable?abort.signal:undefined);
    const type=response.headers.get('content-type')||'application/octet-stream';
    const destination=['document','iframe','script','style','image','font','empty','worker','sharedworker','serviceworker'].includes(input.destination)?input.destination:'unknown';
    const headers:Record<string,string|string[]>={};
    for(const [k,v]of response.headers)if(!['content-encoding','content-length','transfer-encoding','connection','set-cookie'].includes(k))headers[k]=v;
    headers['set-cookie']=response.headers.getSetCookie();
    for(const c of response.headers.getSetCookie())await s.jar.setCookie(c,url.href,{ignoreError:true});
    if(binaryResponses.has(res)&&method==='GET'&&response.status===200&&((destination==='image'&&/^image\//i.test(type))||(destination==='font'&&/^(font\/|application\/(?:font|x-font|vnd\.ms-fontobject|octet-stream))/i.test(type)))){
      const streamed=await streamBinary(res,response as unknown as Response,headers,abort.signal,staticCache.eligible(cacheKey,response.status,headers));
      if(streamed.body)staticCache.put(cacheKey,response.status,headers,streamed.body);
      record(s,{host:url.hostname,method,status:response.status,type,bytes:streamed.bytes,destination,elapsedMs:Date.now()-started,outcome:'Binary static stream'});return;
    }
    const data=await boundedBody(response);
    // Custom header names can also be opaque; don't retain them in metadata.
    const omittedHeaders=[...new Set(Object.keys(input.headers||{}).map(x=>x.toLowerCase()).filter(x=>!(x in h)&&!['origin','referer','cookie','user-agent'].includes(x)).map(x=>blocked.has(x)&&['host','connection','authorization','proxy-authorization','content-length','accept-encoding'].includes(x)?x:'custom-or-hop-by-hop'))].slice(0,10);
    record(s,{host:url.hostname,method,status:response.status,type,bytes:data.length,cookiesSent:cookies.size,virtualCookies,setCookies:response.headers.getSetCookie().length,destination,omittedHeaders,...responseMetadata(url,type,data),elapsedMs:Date.now()-started,outcome:'Rewriting engine relay'});
    // 401/403 are normal application responses: they must not poison later
    // navigation, login pages, assets or unrelated API calls.
    // Cookie processing is independent of whether the body can be rewritten.
    // In particular, a verification fetch may set the navigation's cookie.
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
  }catch{
    if(abort.signal.aborted){if(!res.destroyed)res.destroy();return;}
    record(s,{host:url.hostname,method,status:502,type:'',bytes:0,outcome:'Local relay upstream transport failure'});
    if(res.headersSent||res.destroyed){res.destroy();return;}
    return denied(res,'Upstream transport failure (details omitted to protect session data).',502);
  }finally{req.removeListener('aborted',disconnect);res.removeListener('close',disconnect);}
}
