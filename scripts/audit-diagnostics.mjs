// Reproducible, synthetic diagnostics. No request in this file reaches Temu.
// Run: node --import tsx scripts/audit-diagnostics.mjs
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import {createServers} from '../src/server.ts';

const folder=process.env.TEMBY_AUDIT_DIR||'audit-2026-10-19';if(!/^[a-z0-9-]+$/.test(folder))throw Error('Invalid audit directory');
const output=new URL('../artifacts/'+folder+'/',import.meta.url);
await mkdir(output,{recursive:true});
const results={scope:'Synthetic diagnostics, not a merchant performance benchmark',generatedAt:new Date().toISOString(),checks:[],benchmarks:[]};
const check=(name,evidence)=>results.checks.push({name,...evidence});
const cartScope={self:{},URL};
vm.runInNewContext(await readFile(new URL('../public/companion-cart.js',import.meta.url),'utf8'),cartScope);
const adapter=cartScope.self.__tembyCart;
const now=Date.now();
const payload={success:true,result:{cartListInfo:{checkoutExtendMap:{ckCartCcy:'EUR',ckCartLoginStatus:'1'},invalidGoodsLines:0,goodsSkuList:[]},cartTransferMap:{currency:'EUR',orderAmount:'2092'},discountInfo:{orderAmountDto:{orderAmount:2092,totalGoodsAmount:2092}},checkoutLayerTrackInfo:{strongThreshold:3000}}};
const canonical=adapter.responseFacts(payload,now).carts;
check('Cart response is a snapshot, not a price delta',{total:canonical[0].minor,minimum:canonical[0].minimum});
const modified=structuredClone(payload);modified.result.discountInfo.orderAmountDto.orderAmount=1;modified.result.cartTransferMap.orderAmount='1';
check('Locally modified structured data is accepted by the client parser',{acceptedModifiedMinor:adapter.responseFacts(modified,now).carts[0].minor,securityImplication:'Client parser is validation for consistency, not proof of merchant origin'});
const stringThreshold=structuredClone(payload);stringThreshold.result.checkoutLayerTrackInfo.strongThreshold='3000';
check('Numeric-string minimum handling',{numberMinimum:canonical[0].minimum,stringMinimum:adapter.responseFacts(stringThreshold,now).carts[0].minimum});
const older=adapter.responseFacts(payload,now-1000).carts[0];
const newer=structuredClone(older);newer.time=now;newer.live=false;newer.minor=100;
check('Newer-timestamp cache versus live precedence',{selectedMinor:adapter.select([older,newer],now)?.minor});
let opened=[];
const page={indexedDB:{open(name){opened.push(name);const req={};queueMicrotask(()=>req.onerror?.());return req;}},__uv:{meta:{url:{origin:'https://www.temu.com'}}},document:{hidden:false},setInterval(){return 1;},clearInterval(){},addEventListener(){},removeEventListener(){}};
const stop=adapter.observe(page,()=>{});await new Promise(r=>setTimeout(r,20));stop();
check('IndexedDB without databases()',{opened,expectedScopedName:'https://www.temu.com@scdb',missesScopedDatabase:!opened.includes('https://www.temu.com@scdb')});
check('Live endpoint recognition',{supported:adapter.responseURL('https://www.temu.com/api/example/cart_modify/query'),observedMobileBareEndpoint:adapter.responseURL('https://www.temu.com/api/bg/bg-uranus-api/uranus_cart/cart_modify'),otherCartRoute:adapter.responseURL('https://www.temu.com/api/example/shopping_cart')});
const otherCurrency=structuredClone(payload);otherCurrency.result.cartListInfo.checkoutExtendMap.ckCartCcy='GBP';otherCurrency.result.cartTransferMap.currency='GBP';
check('Unsupported currency',{GBPResponseAccepted:!!adapter.responseFacts(otherCurrency,now)});

let calls=0,active=0,peak=0;const body=Buffer.alloc(512*1024,97);
const slowResponse=type=>new Response(new ReadableStream({async start(controller){for(let i=0;i<4;i++){await new Promise(r=>setTimeout(r,40));controller.enqueue(body.subarray(i*131072,(i+1)*131072));}controller.close();}}),{headers:{'content-type':type,'cache-control':'private'}});
const transport=async(url,method,headers,requestBody)=>{
  calls++;active++;peak=Math.max(peak,active);
  try{
    if(url.pathname.includes('limited'))return new Response(JSON.stringify({requestBody:requestBody?.toString()}),{status:429,headers:{'content-type':'application/json','retry-after':'60'}});
    if(url.pathname.includes('burst')){await new Promise(r=>setTimeout(r,60));return new Response('synthetic-public',{headers:{'content-type':'image/png','cache-control':'public, max-age=60','content-length':'16'}});}
    const type=url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.json')?'application/json':'image/png';
    return slowResponse(type);
  }finally{active--;}
};
const {app,merchant}=createServers(4120,4121,transport);
const direct=createServer((_req,res)=>{res.writeHead(200,{'content-type':'application/octet-stream'});let i=0;const tick=setInterval(()=>{res.write(body.subarray(i*131072,++i*131072));if(i===4){clearInterval(tick);res.end();}},40);res.on('close',()=>clearInterval(tick));});
app.listen(4120,'127.0.0.1');merchant.listen(4121,'127.0.0.1');direct.listen(4122,'127.0.0.1');
await Promise.all([once(app,'listening'),once(merchant,'listening'),once(direct,'listening')]);
const origin='http://localhost:4121';
const first=await fetch(origin+'/uv/');const cookie=first.headers.get('set-cookie').split(';')[0];await first.arrayBuffer();
const relay=(path,destination='image',extra={})=>fetch(origin+'/_relay',{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-temby-wire':'binary-v1'},body:JSON.stringify({url:'https://img.kwcdn.com'+path,method:'GET',destination,headers:{},engine:'ultraviolet',...extra})});
const decode=async response=>{const bytes=Buffer.from(await response.arrayBuffer());const length=bytes.readUInt32BE(0);return {metadata:JSON.parse(bytes.subarray(4,4+length)),body:bytes.subarray(4+length)};};
async function measure(label,operation,binary){
  const samples=[];
  for(let run=0;run<3;run++){
    const start=performance.now();const response=await operation(run);const headersAt=performance.now();const reader=response.body.getReader();
    let all=Buffer.alloc(0),firstPayloadAt=null,payloadStart=binary?null:0;
    for(;;){const next=await reader.read();if(next.done)break;all=Buffer.concat([all,Buffer.from(next.value)]);if(binary&&payloadStart===null&&all.length>=4)payloadStart=4+all.readUInt32BE(0);if(firstPayloadAt===null&&payloadStart!==null&&all.length>payloadStart)firstPayloadAt=performance.now();}
    samples.push({headersMs:Math.round(headersAt-start),firstBodyMs:Math.round(firstPayloadAt-start),completeMs:Math.round(performance.now()-start),wireBytes:all.length});
  }
  results.benchmarks.push({label,samples});
}
try{
  await measure('Current image streaming',i=>relay('/paced-'+i+'.png'),true);
  await measure('CSS relay (current policy)',i=>relay('/paced-'+i+'.css','style'),true);
  await measure('Current JS buffering',i=>relay('/paced-'+i+'.js','script'),true);
  await measure('Current JSON buffering',i=>relay('/paced-'+i+'.json','empty'),true);
  const relayBefore=calls;
  await measure('Direct local fixture, bypassing relay',()=>fetch('http://localhost:4122/resource'),false);
  check('Direct path relay load',{relayCallsDuringDirectBenchmark:calls-relayBefore,note:'Local mechanism demonstration, not CDN connectivity validation'});
  const before=calls;peak=0;
  await Promise.all(Array.from({length:20},()=>relay('/burst-public.png').then(decode)));
  const cold=calls-before;await decode(await relay('/burst-public.png'));
  check('Identical concurrent public-cache misses',{browserRequests:20,coldUpstreamCalls:cold,peakUpstreamHeadersInFlight:peak,warmExtraCalls:calls-before-cold});
  const a=await decode(await relay('/limited','empty',{method:'POST',body:Buffer.from('first').toString('base64')}));
  const beforeSecond=calls;
  const b=await decode(await relay('/limited','empty',{method:'POST',body:Buffer.from('different').toString('base64')}));
  check('Cooldown distinguishes POST body',{first:a.body.toString(),second:b.body.toString(),secondReachedUpstream:calls>beforeSecond});
  const state=await(await fetch(origin+'/_state',{headers:{cookie}})).json();
  check('Replay observability',{recorded429s:state.events.filter(e=>e.status===429).length,client429s:2});
}finally{for(const server of [app,merchant,direct]){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
await writeFile(new URL('synthetic-results.json',output),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
