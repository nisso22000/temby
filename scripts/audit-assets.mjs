// Bounded public-CDN delivery probe from an owned origin, without UV interception.
// Does not execute downloaded merchant JavaScript or import customer sessions.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {writeFile,mkdir} from 'node:fs/promises';
import {upstream,boundedBody,dispatcher} from '../src/transport.ts';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Mecro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=new URL('../artifacts/audit-2026-10-19/',import.meta.url);await mkdir(out,{recursive:true});
const root=await upstream(new URL('https://www.temu.com/'),'GET',{'user-agent':'Mozilla/5.0','accept':'text/html'});
const html=(await boundedBody(root)).toString();
const urls=[...new Set((html.match(/https:\/\/[^\s"'<>\\]+/g)||[]).map(v=>v.replaceAll('&amp;','&')))];
const samples=[];
for(const [kind,pattern] of [['image',/\.(?:png|jpe?g|webp|avif|gif)(?:\?|$)/i],['style',/\.css(?:\?|$)/i],['script',/\.js(?:\?|$)/i],['font',/\.(?:woff2?|ttf|otf)(?:\?|$)/i]]){
  const candidate=urls.find(value=>{try{return new URL(value).hostname.endsWith('.kwcdn.com')&&pattern.test(value);}catch{return false;}});
  if(candidate)samples.push({kind,url:candidate});
}
const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Owned direct-CDN delivery probe</title><h1>Owned diagnostic page</h1>');});
server.listen(4150,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({channel:'msedge',headless:true});
const results={generatedAt:new Date().toISOString(),scope:'Single public HTML fetch and one sample per available CDN resource category; no merchant JS execution',rootStatus:root.status,discoveredCategories:samples.map(s=>s.kind),samples:[]};
try{
  const context=await browser.newContext();const page=await context.newPage();
  const allowed=new Set(samples.map(s=>s.url));
  await page.route('**/*',route=>{const url=route.request().url();return url.startsWith('http://localhost:4150/')||allowed.has(url)?route.continue():route.abort();});
  await page.goto('http://localhost:4150/');
  for(const sample of samples){
    const result={kind:sample.kind,host:new URL(sample.url).hostname};
    const headersResponse=await upstream(new URL(sample.url),'GET',{'accept':'*/*'});
    result.status=headersResponse.status;
    result.headers=Object.fromEntries(['content-type','cache-control','access-control-allow-origin','cross-origin-resource-policy','accept-ranges','content-encoding','content-length','vary'].map(k=>[k,headersResponse.headers.get(k)]));
    await headersResponse.body?.cancel();
    result.browser=await page.evaluate(async({kind,url})=>{
      const result={};
      const started=performance.now();
      try{const response=await fetch(url,{mode:'cors',credentials:'omit',signal:AbortSignal.timeout(10000)});result.cors={ok:response.ok,type:response.type,status:response.status};await response.body?.cancel();}catch(e){result.cors={ok:false,error:e.name};}
      result.corsHeadersMs=Math.round(performance.now()-started);
      if(kind==='image'||kind==='style')result.element=await new Promise(resolve=>{const el=document.createElement(kind==='image'?'img':'link');const timer=setTimeout(()=>{el.remove();resolve({loaded:false,timeout:true});},10000);el.onload=()=>{clearTimeout(timer);resolve({loaded:true});};el.onerror=()=>{clearTimeout(timer);resolve({loaded:false});};if(kind==='image')el.src=url;else{el.rel='stylesheet';el.href=url;}document.body.append(el);});
      return result;
    },sample);
    results.samples.push(result);
  }
  await context.close();
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await dispatcher.close();}
await writeFile(new URL('direct-assets-results.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
