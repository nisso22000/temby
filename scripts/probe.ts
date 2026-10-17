import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { upstream, boundedBody, dispatcher } from '../src/transport.js';
import { temu } from '../src/cart.js';
// One ordinary request, no fingerprint spoofing, no challenge execution and no retries.
try {
  const url=new URL('https://www.temu.com/'); const start=Date.now();
  const response=await upstream(url,'GET',{'user-agent':'Temby-Local-Proxy-PoC/0.1','accept':'text/html'});
  const body=await boundedBody(response);
  const result={observedAt:new Date().toISOString(),url:url.href,status:response.status,location:response.headers.get('location')?new URL(response.headers.get('location')!,url).origin:null,contentType:response.headers.get('content-type'),bytes:body.length,sha256:createHash('sha256').update(body).digest('hex'),elapsedMs:Date.now()-start,challenge:temu.challenge(body.toString('utf8'),response.status),challengeLoaderMarker:body.toString('utf8').includes('/assets/chl/js/'),note:'No raw body, cookies, headers containing tokens or credentials are persisted. No challenge execution.'};
  await mkdir('artifacts',{recursive:true});await writeFile('artifacts/temu-probe.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch{console.error('Probe transport failed; no raw request data logged.');process.exitCode=1;}
finally{await dispatcher.close();}
