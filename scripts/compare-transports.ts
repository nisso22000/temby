import { connect } from 'node:http2';
import { upstream, boundedBody, dispatcher } from '../src/transport.js';
import { safeLookup } from '../src/policy.js';

// Compare standard HTTP versions without impersonating a browser, executing a
// challenge, or persisting response bodies, cookies or URL query strings.
const target=new URL('https://www.temu.com/');
const headers={'user-agent':'Temby-Local-Proxy/0.3','accept':'text/html','accept-encoding':'identity'};
const summarize=(protocol:string,status:number,type:string,body:Buffer,cookieCount:number)=>({protocol,status,type,bytes:body.length,verificationLoader:body.includes(Buffer.from('/assets/chl/js/')),setCookies:cookieCount});
try{
  const response=await upstream(target,'GET',headers);
  console.log(JSON.stringify(summarize('HTTP/1.1',response.status,response.headers.get('content-type')||'',await boundedBody(response),response.headers.getSetCookie().length)));
  const connection=connect(target.origin,{lookup:safeLookup});
  connection.on('error',()=>{});
  const timeout=setTimeout(()=>connection.destroy(new Error('Timeout')),25000);
  try{
    const request=connection.request({':method':'GET',':path':'/',...headers});
    let status=0,type='',cookieCount=0;
    request.on('response',h=>{status=Number(h[':status']);type=String(h['content-type']||'');cookieCount=Array.isArray(h['set-cookie'])?h['set-cookie'].length:0;});
    const parts:Buffer[]=[];let size=0;
    for await(const chunk of request){size+=chunk.length;if(size>12*1024*1024)throw new Error('Body limit');parts.push(Buffer.from(chunk));}
    console.log(JSON.stringify(summarize('HTTP/2',status,type,Buffer.concat(parts),cookieCount)));
  }finally{clearTimeout(timeout);connection.destroy();}
}catch{console.error('Transport comparison failed; sensitive details omitted.');process.exitCode=1;}
finally{await dispatcher.close();}
