import { Agent, fetch,Response } from 'undici';
import { safeLookup, targetAllowed } from './policy.js';
import {ConcurrencyGate} from './concurrency.js';
import {browserMetadataDispatcher} from './fetch-metadata.js';
const gate=new ConcurrencyGate();
export const dispatcher = new Agent({ connect: { lookup: safeLookup, timeout: 15000 }, headersTimeout: 20000, bodyTimeout: 20000 });
export async function upstream(url: URL, method: string, headers: Record<string, string>, body?: Buffer, signal?:AbortSignal) {
  if (!targetAllowed(url)) throw new Error('TARGET_DENIED');
  const timeout=AbortSignal.timeout(25000);
  const combined=signal?AbortSignal.any([timeout,signal]):timeout;
  const release=await gate.acquire(url.origin,combined);
  const done=()=>{combined.removeEventListener('abort',done);release();};
  combined.addEventListener('abort',done,{once:true});
  try{
    combined.throwIfAborted();
    const requestDispatcher=browserMetadataDispatcher(dispatcher,headers['sec-fetch-mode']);
    const response=await fetch(url,{dispatcher:requestDispatcher,method,headers,body:body as any,redirect:'manual',signal:combined});
    if(!response.body){done();return response;}
    const reader=response.body.getReader();
    const stream=new ReadableStream<Uint8Array>({
      async pull(controller){try{const next=await reader.read();if(next.done){done();reader.releaseLock();controller.close();}else controller.enqueue(next.value);}catch(error){done();controller.error(error);}},
      async cancel(reason){try{await reader.cancel(reason);}finally{done();}},
    });
    return new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
  }catch(error){done();throw error;}
}
export type Transport = typeof upstream;
export async function boundedBody(response: Awaited<ReturnType<Transport>>, max = 12 * 1024 * 1024): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(); const parts: Buffer[] = []; let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new Error('RESPONSE_TOO_LARGE'); }
      parts.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
