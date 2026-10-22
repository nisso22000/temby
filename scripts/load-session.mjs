#!/usr/bin/env node
// Safe HTTPS/session load generator. It never calls Temu or a relay endpoint.
// Each virtual user receives its own opaque TEMBY cookie and exercises only
// local engine assets plus the harmless session diagnostic endpoint.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const args=process.argv.slice(2);
const option=(name,fallback)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
const number=(name,fallback,min,max)=>{const value=Number(option(name,fallback));if(!Number.isFinite(value)||value<min||value>max)throw new Error(`Invalid ${name}`);return value;};
const baseUrl=option('--base-url','').replace(/\/$/,'');
const users=number('--vus','25',1,10_000);
const durationSeconds=number('--duration-seconds','30',1,3_600);
const rampSeconds=number('--ramp-seconds','10',0,900);
const thinkMs=number('--think-ms','750',0,60_000);
const statefulEvery=number('--stateful-every','4',1,100);
const out=option('--out','');
if(!baseUrl.startsWith('https://'))throw new Error('--base-url must be an HTTPS origin, for example https://merchant.temudz.store');
if(!args.includes('--confirm'))throw new Error('Refusing to generate traffic without --confirm. Start with --vus 25 --duration-seconds 30.');

const startedAt=new Date().toISOString();const started=Date.now();const deadline=started+durationSeconds*1000;
const latencies=[];const statuses=new Map();const errors=new Map();
let completed=0,bytes=0,staticCookieViolations=0,stopping=false;
process.on('SIGINT',()=>{stopping=true;});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const record=(duration,status,size,error)=>{
  completed++;bytes+=size;
  if(latencies.length<100_000)latencies.push(duration);else if(Math.random()<100_000/completed)latencies[Math.floor(Math.random()*latencies.length)]=duration;
  if(status)statuses.set(String(status),(statuses.get(String(status))||0)+1);
  if(error)errors.set(error,(errors.get(error)||0)+1);
};
async function request(path,{cookie='',method='GET',body,origin,expect}={}){
  const headers={accept:'*/*'};if(cookie)headers.cookie=cookie;if(origin)headers.origin=origin;if(body){headers['content-type']='application/json';}
  const begin=performance.now();
  try{
    const response=await fetch(baseUrl+path,{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(15_000)});
    const payload=await response.arrayBuffer();const duration=performance.now()-begin;
    record(duration,response.status,payload.byteLength,response.status===expect?undefined:`HTTP_${response.status}`);
    const setCookies=typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[];
    return {ok:response.status===expect,cookie:setCookies.map(value=>value.match(/(?:^|;)\s*temby_sid=([a-f0-9]{64})/i)?.[0]).find(Boolean)?.split(';')[0]||'',setCookies};
  }catch(error){record(performance.now()-begin,0,0,error instanceof Error?error.name:'RequestError');return {ok:false,cookie:'',setCookies:[]};}
}
async function virtualUser(id){
  if(rampSeconds)await delay(Math.floor(id*1000*rampSeconds/users));
  if(stopping||Date.now()>=deadline)return;
  // This first static request deliberately has no cookie. A Set-Cookie here is
  // a regression of the static-assets-consuming-sessions incident.
  const staticProbe=await request('/uv/boot.js',{expect:200});
  if(staticProbe.setCookies.some(value=>/temby_sid=/i.test(value)))staticCookieViolations++;
  const initial=await request('/uv/',{expect:200});let cookie=initial.cookie;let cycle=0;
  while(!stopping&&Date.now()<deadline){
    await request('/uv/boot.js',{cookie,expect:200});cycle++;
    if(cycle%statefulEvery===0&&cookie){
      await request('/_runtime',{cookie,method:'POST',origin:baseUrl,body:'{"phase":"document-ready"}',expect:204});
      await request('/_state',{cookie,expect:200});
    }
    if(thinkMs)await delay(thinkMs);
  }
}
await Promise.all(Array.from({length:users},(_,index)=>virtualUser(index)));
const elapsed=Math.max(1,Date.now()-started);latencies.sort((a,b)=>a-b);
const percentile=percent=>latencies.length?Math.round(latencies[Math.min(latencies.length-1,Math.ceil(latencies.length*percent)-1)]*100)/100:0;
const summary={
  scope:'Safe local TEMBY endpoints only; no Temu or relay request was made.',startedAt,finishedAt:new Date().toISOString(),
  configuration:{baseUrl,virtualUsers:users,durationSeconds,rampSeconds,thinkMs,statefulEvery},
  requests:{completed,requestsPerSecond:Math.round(completed/(elapsed/1000)*100)/100,responseBytes:bytes,statuses:Object.fromEntries(statuses),errors:Object.fromEntries(errors),staticCookieViolations},
  latencyMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:percentile(1)},
};
const rendered=JSON.stringify(summary,null,2);console.log(rendered);
if(out){await mkdir(dirname(out),{recursive:true});await writeFile(out,rendered+'\n',{mode:0o600});}
if(summary.requests.staticCookieViolations||Object.keys(summary.requests.errors).length)process.exitCode=1;
