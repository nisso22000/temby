// Isolated Edge browser diagnostics. Synthetic by default; --live permits
// two bounded fresh-session storefront visits, without login or CAPTCHA work.
// Run: node --import tsx scripts/audit-browser.mjs [--live]
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createServers} from '../src/server.ts';
import {upstream,dispatcher} from '../src/transport.ts';
const require=createRequire(import.meta.url);
const {chromium,devices}=require('C:/Users/Mecro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder=process.env.TEMBY_AUDIT_DIR||'audit-2026-10-19';if(!/^[a-z0-9-]+$/.test(folder))throw Error('Invalid audit directory');
const out=new URL('../artifacts/'+folder+'/',import.meta.url);await mkdir(out,{recursive:true});
const results={generatedAt:new Date().toISOString(),scope:'Isolated browser contexts; no customer credentials or cookies imported',synthetic:[],live:[]};
const payload={success:true,result:{cartListInfo:{checkoutExtendMap:{ckCartCcy:'EUR',ckCartLoginStatus:'1'},invalidGoodsLines:0,goodsSkuList:[{isSelected:1,baseGoodsInfo:{goodsId:601000001,goodsName:'Synthetic item'},skuInfo:{skuId:175000001,amount:1,skuPrice:2092}}]},cartTransferMap:{currency:'EUR',orderAmount:'2092'},discountInfo:{orderAmountDto:{orderAmount:2092,totalGoodsAmount:2092}},checkoutLayerTrackInfo:{strongThreshold:3000}}};
const transport=async url=>{
  if(url.pathname.startsWith('/api/'))return Response.json(payload);
  const alternate=url.searchParams.has('alternate');
  const endpoint=alternate?'/api/example/cart_modify':'/api/example/cart_modify/query';
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Owned diagnostic cart</title><h1>Synthetic cart, not Temu</h1><main class="g_p_sum_wr"><div><span>Total</span><b>€20.92</b></div></main><script>fetch(${JSON.stringify(endpoint)}).then(r=>r.json()).then(()=>document.body.dataset.received='yes')</script>`,{headers:{'content-type':'text/html; charset=utf-8'}});
};
const servers=createServers(4130,4131,transport);
const pathInfo=value=>{try{const u=new URL(value);return {host:u.hostname,route:u.pathname.startsWith('/api/')?u.pathname.split('/').map(x=>/^[a-z_-]{1,40}$/i.test(x)?x:x?'[value]':'').join('/'):/\.html$/.test(u.pathname)?u.pathname.replace(/[^/]*goods[^/]*\.html$/,'[product].html'):u.pathname==='/'?'/':'[resource]',queryNames:[...new Set(u.searchParams.keys())].slice(0,15)};}catch{return {host:'invalid'};}};
const cartState=()=>{const host=document.getElementById('temby-companion');return {companion:!!host,source:host?.getAttribute('data-price-source'),cache:host?.getAttribute('data-cart-cache'),updating:host?.getAttribute('data-updating'),amount:host?.shadowRoot?.getElementById('amount')?.textContent,received:document.body.dataset.received,secureContext:isSecureContext,serviceWorker:!!navigator.serviceWorker?.controller,hasDatabaseEnumeration:typeof indexedDB.databases==='function'};};
const listen=async group=>{group.app.listen(group===servers?4130:4140,'127.0.0.1');group.merchant.listen(group===servers?4131:4141,'127.0.0.1');await Promise.all([once(group.app,'listening'),once(group.merchant,'listening')]);};
const close=async group=>{for(const server of [group.app,group.merchant]){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  await listen(servers);
  for(const mobile of [false,true]){
    const context=await browser.newContext(mobile?devices['Pixel 7']:{viewport:{width:1366,height:900}});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.name));
    await page.goto('http://localhost:4131/uv/');
    await page.waitForURL('**/uv-service/**');
    await page.goto('http://localhost:4131/uv-service/'+encodeURIComponent('https://www.temu.com/shopping_cart.html'));
    await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-price-source')==='response',{},{timeout:15000}).catch(()=>{});
    const initial=await page.evaluate(cartState);
    // Tampering stays inside the owned fixture; no merchant data is modified.
    await page.evaluate(()=>{document.querySelector('main b').textContent='€0.01';});
    await page.waitForTimeout(650);
    const structuredAfterDomTamper=await page.evaluate(cartState);
    await page.goto('http://localhost:4131/uv-service/'+encodeURIComponent('https://www.temu.com/shopping_cart.html?alternate=1'));
    await page.waitForFunction(()=>document.body.dataset.received==='yes');
    await page.waitForFunction(()=>document.getElementById('temby-companion')?.getAttribute('data-price-source')==='page',{},{timeout:5000}).catch(()=>{});
    const domFallback=await page.evaluate(cartState);
    await page.evaluate(()=>{document.querySelector('main b').textContent='€0.01';});await page.waitForTimeout(1200);
    const domFallbackAfterTamper=await page.evaluate(cartState);
    results.synthetic.push({mode:mobile?'mobile-emulation':'desktop',initial,structuredAfterDomTamper,domFallback,domFallbackAfterTamper,pageErrors:errors});
    await page.screenshot({path:new URL((mobile?'mobile':'desktop')+'-owned.png',out).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
    await context.close();
  }
  await close(servers);
  if(process.argv.includes('--live')){
    let current;let active=0;const assetSamples=new Map();
    const liveTransport=async(url,method,headers,body,signal)=>{
      if(!current||current.requests>=100)return new Response('Diagnostic request budget reached',{status:503});
      const run=current;run.requests++;active++;run.peakConcurrency=Math.max(run.peakConcurrency,active);
      const started=Date.now();const signature=createHash('sha256').update(method+' '+url.href).digest('hex').slice(0,16);
      run.duplicates[signature]=(run.duplicates[signature]||0)+1;
      try{
        const response=await upstream(url,method,headers,body,signal);
        const event={...pathInfo(url.href),method,status:response.status,type:response.headers.get('content-type')?.split(';')[0],headersMs:Date.now()-started,retryAfter:response.headers.get('retry-after'),cookieCount:(headers.cookie||'').split(';').filter(Boolean).length,setCookieCount:response.headers.getSetCookie().length};
        if(url.hostname.endsWith('.kwcdn.com')&&method==='GET'&&response.status===200){
          const kind=event.type?.startsWith('image/')?'image':event.type==='text/css'?'style':event.type?.startsWith('font/')?'font':null;
          if(kind&&!assetSamples.has(kind))assetSamples.set(kind,url.href);
        }
        if(/cart|checkout/i.test(url.pathname)&&event.type?.includes('json')){
          const reader=response.clone().body?.getReader();const parts=[];let bytes=0;
          try{if(reader)for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>2*1024*1024)break;parts.push(next.value);}if(bytes<=2*1024*1024){const value=JSON.parse(Buffer.concat(parts).toString());event.cartSchema={success:value.success,resultKeys:Object.keys(value.result||{}).slice(0,30),hasCartListInfo:!!value.result?.cartListInfo,currency:value.result?.cartListInfo?.checkoutExtendMap?.ckCartCcy,thresholdType:typeof value.result?.checkoutLayerTrackInfo?.strongThreshold};}}catch{}finally{void reader?.cancel().catch(()=>{});}
        }
        run.events.push(event);return response;
      }catch(e){run.events.push({...pathInfo(url.href),method,status:0,error:e.name});throw e;}finally{active--;}
    };
    const live=createServers(4140,4141,liveTransport);await listen(live);
    try{
      for(const mobile of process.argv.includes('--cart-only')?[true]:[false,true]){
        current={mode:mobile?'mobile-emulation':'desktop',requests:0,peakConcurrency:0,duplicates:{},events:[],consoleErrors:0,pageErrors:[],stoppedForChallenge:false};
        const context=await browser.newContext(mobile?devices['Pixel 7']:{viewport:{width:1366,height:900}});const page=await context.newPage();
        page.on('console',m=>{if(m.type()==='error')current.consoleErrors++;});page.on('pageerror',e=>current.pageErrors.push(e.name));
        try{
          const entry=process.argv.includes('--cart-only')?'http://localhost:4141/uv-service/'+encodeURIComponent('https://www.temu.com/shopping_cart.html'):'http://localhost:4141/uv/';
          await page.goto(entry,{waitUntil:'domcontentloaded',timeout:30000});
          for(let i=0;i<12;i++){
            await page.waitForTimeout(1000);const info=pathInfo(page.url());
            const challenged=await page.locator('body').innerText({timeout:1500}).then(t=>/verify you are human|security verification|complete the puzzle|slide.*puzzle|vérification de sécurité|التحقق الأمني|التحقق من أنك/i.test(t)).catch(()=>false);
            if(challenged||/verification|captcha/.test(info.route||'')){current.stoppedForChallenge=true;break;}
            if(current.requests>=100){current.requestBudgetReached=true;break;}
            if(process.argv.includes('--cart-only')&&current.events.some(e=>e.cartSchema)){current.stoppedAfterCartResponse=true;break;}
          }
          current.finalLocation=pathInfo(page.url().includes('/uv-service/')?decodeURIComponent(page.url().split('/uv-service/')[1]):page.url());
          current.companion=await page.evaluate(cartState);
          // resource sizes only; URLs/bodies/credentials are not persisted.
          current.resourceSummary=await page.evaluate(()=>performance.getEntriesByType('resource').reduce((out,e)=>{const k=e.initiatorType;out[k]??={count:0,transferBytes:0,durationMs:0};out[k].count++;out[k].transferBytes+=e.transferSize;out[k].durationMs+=e.duration;return out;},{}));
        }catch(e){current.navigationError=e.name;}
        current.repeatedRequestCounts=Object.values(current.duplicates).filter(n=>n>1);delete current.duplicates;
        await context.close();results.live.push(current);
      }
      if(process.argv.includes('--cart-only')){
        // Probe native browser delivery from our owned app origin. The browser
        // route blocks any extra CSS dependencies; merchant scripts do not run.
        const context=await browser.newContext();const page=await context.newPage();
        const allowed=new Set(assetSamples.values());
        await page.route('**/*',route=>route.request().url()==='http://localhost:4140/direct-probe'?route.fulfill({contentType:'text/html',body:'<!doctype html><title>Owned direct asset probe</title>'}):allowed.has(route.request().url())?route.continue():route.abort());
        await page.goto('http://localhost:4140/direct-probe');results.directAssetProbes=[];
        for(const [kind,url]of assetSamples){
          const native=await page.evaluate(async({kind,url})=>{
            const result={};try{const response=await fetch(url,{mode:'cors',credentials:'omit',signal:AbortSignal.timeout(8000)});result.cors={status:response.status,ok:response.ok,type:response.type};await response.body?.cancel();}catch(e){result.cors={ok:false,error:e.name};}
            if(kind==='image'||kind==='style')result.element=await new Promise(resolve=>{const el=document.createElement(kind==='image'?'img':'link');const timer=setTimeout(()=>{el.remove();resolve({loaded:false,timeout:true});},8000);el.onload=()=>{clearTimeout(timer);resolve({loaded:true});};el.onerror=()=>{clearTimeout(timer);resolve({loaded:false});};if(kind==='image')el.src=url;else{el.rel='stylesheet';el.href=url;}document.body.append(el);});return result;
          },{kind,url});results.directAssetProbes.push({kind,host:new URL(url).hostname,native});
        }
        await context.close();
      }
    }finally{await close(live);}
  }
}finally{await browser.close();await dispatcher.close();}
const filename=process.argv.includes('--cart-only')?'browser-live-cart-results.json':process.argv.includes('--live')?'browser-live-results.json':'browser-synthetic-results.json';
await writeFile(new URL(filename,out),JSON.stringify(results,null,2));
console.log(JSON.stringify({filename,synthetic:results.synthetic,live:results.live.map(run=>({...run,events:run.events.filter(e=>e.cartSchema||e.status>=400),pageErrors:run.pageErrors.length})),directAssetProbes:results.directAssetProbes},null,2));
