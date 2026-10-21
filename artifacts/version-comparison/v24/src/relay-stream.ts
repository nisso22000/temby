import type {ServerResponse} from 'node:http';
import {once} from 'node:events';

export function binaryHead(res:ServerResponse,status:number,headers:Record<string,string|string[]>){
  const metadata=Buffer.from(JSON.stringify({status,statusText:'',headers}));
  const prefix=Buffer.alloc(4);prefix.writeUInt32BE(metadata.length);
  res.writeHead(200,{'content-type':'application/x-temby-binary','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.write(prefix);res.write(metadata);
}

// Only used for successful image/font responses: no executable rewriting.
// Cache collection is optional and stops above 2 MiB. Never cache partial data.
export async function streamBinary(res:ServerResponse,response:Response,headers:Record<string,string|string[]>,signal:AbortSignal,collect=false,max=12*1024*1024){
  const reader=response.body?.getReader();let bytes=0;let parts:Buffer[]|null=collect?[]:null;
  const cancel=()=>{void reader?.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try{
    signal.throwIfAborted();
    binaryHead(res,response.status,headers);
    if(reader)for(;;){
      signal.throwIfAborted();const next=await reader.read();signal.throwIfAborted();if(next.done)break;
      bytes+=next.value.byteLength;if(bytes>max)throw new Error('RESPONSE_TOO_LARGE');
      if(parts){if(bytes<=2*1024*1024)parts.push(Buffer.from(next.value));else parts=null;}
      if(!res.write(next.value))await once(res,'drain',{signal});
    }
    signal.throwIfAborted();res.end();
    return {bytes,body:parts?Buffer.concat(parts):undefined};
  }catch(error){await reader?.cancel().catch(()=>{});res.destroy();throw error;}
  finally{signal.removeEventListener('abort',cancel);reader?.releaseLock();}
}
