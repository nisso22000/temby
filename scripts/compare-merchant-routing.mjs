// Two bounded fresh-session observations. Never solves challenges or logs in.
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServers} from '../src/server.ts';
import {upstream,dispatcher} from '../src/transport.ts';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Mecro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=new URL('../artifacts/improvements-v38/',import.meta.url);await mkdir(out,{recursive:true});
const results={scope:'Two fresh proxy contexts; different sessions/time, not a causal A/B test. No user account or challenge interaction.',runs:[]};
const routeInfo=value=>{
 try{const u=new URL(value);return {host:u.hostname,route:u.pathname==='/'?'/':/\/(?:login|shopping_cart|bgn_verification|captcha)\.html$/.test(u.pathname)?u.pathname:u.pathname.startsWith('/api/')?u.pathname.split('/').map(x=>/^[a-z_-]{1,40}$/i.test(x)?x:x?'[value]':'').join('/'):'[resource]'};}catch{return {host:'invalid'};}
};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const optimized of [false,true]){
  const run={mode:optimized?'optional-routing-enabled':'compatibility-default',upstreamRequests:0,stoppedForChallenge:false,budgetReached:false,statuses:{},repeatedOperations:[],events:[],pageErrors:[]};
  const signatures=new Map();let stop=false;
  const transport=async(url,method,headers,body,signal)=>{
   if(stop||run.upstreamRequests>=80){run.budgetReached ||=run.upstreamRequests>=80;return new Response('Diagnostic stopped',{status:503});}
   run.upstreamRequests++;
   const key=createHash('sha256').update(method).update(url.href).update(body||Buffer.alloc(0)).digest('hex');
   const entry=signatures.get(key)||{...routeInfo(url.href),method,count:0};entry.count++;signatures.set(key,entry);
   try{
    const response=await upstream(url,method,headers,body,signal);
    run.statuses[response.status]=(run.statuses[response.status]||0)+1;
    run.events.push({...routeInfo(url.href),method,status:response.status,cookiesSent:(headers.cookie||'').split(';').filter(Boolean).length,setCookies:response.headers.getSetCookie().length});
    return response;
   }catch(e){run.events.push({...routeInfo(url.href),method,status:0,error:e.name});throw e;}
  };
  const servers=createServers(4190,4191,transport,{filterMode:optimized?'balanced':'off',directAssets:optimized});
  servers.app.listen(4190,'127.0.0.1');servers.merchant.listen(4191,'127.0.0.1');await Promise.all([once(servers.app,'listening'),once(servers.merchant,'listening')]);
  const context=await browser.newContext({viewport:{width:1280,height:850}});const page=await context.newPage();
  page.on('pageerror',e=>run.pageErrors.push(e.name));
  try{
   await page.goto('http://localhost:4191/uv/',{waitUntil:'domcontentloaded',timeout:30000});
   for(let i=0;i<12;i++){
    await page.waitForTimeout(1000);
    const text=await page.locator('body').innerText({timeout:1000}).catch(()=>'');
    if(/verify you are human|security verification|complete the puzzle|slide.*puzzle|vérification de sécurité|التحقق الأمني|التحقق من أنك/i.test(text)||/verification|captcha/i.test(decodeURIComponent(page.url()))){run.stoppedForChallenge=true;break;}
    if(run.budgetReached)break;
   }
   const address=page.url();run.finalLocation=routeInfo(address.includes('/uv-service/')?decodeURIComponent(address.split('/uv-service/')[1]):address);
   run.workerCounts=await context.serviceWorkers()[0]?.evaluate(()=>self.__tembyResourceCounts).catch(()=>null);
  }catch(e){run.navigationError=e.name;}
  finally{
   stop=true;await context.close();
   for(const server of [servers.app,servers.merchant]){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  }
  run.repeatedOperations=[...signatures.values()].filter(x=>x.count>1);
  results.runs.push(run);console.log(JSON.stringify({...run,events:run.events.filter(e=>e.status>=400),pageErrors:run.pageErrors.length}));
 }
}finally{await browser.close();await dispatcher.close();}
await writeFile(new URL('merchant-routing-comparison.json',out),JSON.stringify(results,null,2));
