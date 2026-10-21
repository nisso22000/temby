import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {CookieJar} from 'tough-cookie';
const versions=[{name:'v23',origin:'http://localhost:3023'},{name:'v24',origin:'http://127.0.0.1:3024'}];
const rows=[];
for(const v of versions){v.jar=new CookieJar();const r=await fetch(v.origin+'/uv/');await r.arrayBuffer();v.sid=r.headers.get('set-cookie').split(';')[0];}
async function measure(v,kind){
 const start=performance.now();let r;
 if(kind==='homepage')r=await fetch(v.origin+'/_relay',{method:'POST',headers:{origin:v.origin,cookie:v.sid,'content-type':'application/json','x-temby-wire':'binary-v1'},body:JSON.stringify({url:'https://www.temu.com/',method:'GET',engine:'ultraviolet',destination:'document',headers:{accept:'text/html','accept-language':'ar-DZ,ar;q=0.9',cookie:await v.jar.getCookieString('https://www.temu.com/')}}),signal:AbortSignal.timeout(35000)});
 else r=await fetch(v.origin+kind,{headers:{cookie:v.sid},signal:AbortSignal.timeout(35000)});
 const headersMs=performance.now()-start;const bytes=Buffer.from(await r.arrayBuffer());const totalMs=performance.now()-start;
 let status=r.status,bodyBytes=bytes.length,setCookieCount=0;
 if(kind==='homepage'&&r.ok){const n=bytes.readUInt32BE(0);const meta=JSON.parse(bytes.subarray(4,4+n));status=meta.status;bodyBytes=bytes.length-4-n;for(const [k,value]of Object.entries(meta.headers))if(k.toLowerCase()==='set-cookie'){const cs=Array.isArray(value)?value:[value];setCookieCount=cs.length;for(const c of cs)await v.jar.setCookie(c,'https://www.temu.com/').catch(()=>{});}}
 const row={version:v.name,kind,status,headersMs:Math.round(headersMs),totalMs:Math.round(totalMs),bodyBytes,setCookieCount};rows.push(row);console.log(JSON.stringify(row));
}
for(let round=0;round<4;round++)for(const v of round%2?[...versions].reverse():versions)await measure(v,'homepage');
for(let round=0;round<6;round++)for(const v of round%2?[...versions].reverse():versions)for(const file of ['/uv/config.js','/uv/bundle.js','/uv/sw.js'])await measure(v,file);
const summary=[];
for(const v of versions)for(const kind of ['homepage','/uv/config.js','/uv/bundle.js','/uv/sw.js']){const samples=rows.filter(r=>r.version===v.name&&r.kind===kind);const median=key=>{const a=samples.map(r=>r[key]).sort((a,b)=>a-b);return (a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2;};summary.push({version:v.name,kind,samples:samples.length,statuses:samples.map(r=>r.status),medianHeadersMs:median('headersMs'),medianTotalMs:median('totalMs'),minMs:Math.min(...samples.map(r=>r.totalMs)),maxMs:Math.max(...samples.map(r=>r.totalMs))});}
await writeFile(new URL('./speed-results.json',import.meta.url),JSON.stringify({scope:'HTTP delivery only; no browser rendering, UV rewriting or IndexedDB cookie commit timing',rows,summary},null,2));console.log('SUMMARY '+JSON.stringify(summary));
