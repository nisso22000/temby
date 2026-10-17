import type { IncomingMessage,ServerResponse } from 'node:http';
import { readBody } from './proxy.js';
import { boundedBody,type Transport } from './transport.js';
import { record,type Session } from './sessions.js';

const cooldown=new WeakMap<Session,number>();
export async function forwardCspReport(req:IncomingMessage,res:ServerResponse,s:Session,transport:Transport){
  const local=new URL(req.url||'/','http://localhost');
  if(req.method!=='POST'||!/^\/api\/sec-csp\/\d+\/enforce$/.test(local.pathname))return false;
  const type=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  if(!['application/csp-report','application/reports+json'].includes(type)){res.writeHead(415);res.end('Expected a browser CSP report');return true;}
  const now=Date.now(),until=cooldown.get(s)||0;
  if(until>now){res.writeHead(429,{'retry-after':String(Math.ceil((until-now)/1000))});res.end();return true;}
  // Browser report requests cannot reliably follow the previous 307 recovery.
  // Forward the known endpoint directly, without altering merchant policy.
  try{
    const url=new URL(local.pathname+local.search,'https://www.temu.com');
    const headers:Record<string,string>={'content-type':type,'user-agent':req.headers['user-agent']||'Temby-Local-Proxy','origin':url.origin};
    const cookies=await s.jar.getCookieString(url.href);if(cookies)headers.cookie=cookies;
    const response=await transport(url,'POST',headers,await readBody(req));
    const body=await boundedBody(response);
    if(response.status===429){
      const retry=response.headers.get('retry-after')||'';
      const parsed=/^\d+$/.test(retry)?now+Number(retry)*1000:Date.parse(retry);
      cooldown.set(s,Number.isFinite(parsed)?parsed:now+60000);
    }
    for(const cookie of response.headers.getSetCookie())await s.jar.setCookie(cookie,url.href,{ignoreError:true});
    record(s,{host:url.hostname,method:'POST',status:response.status,type:response.headers.get('content-type')||'',bytes:body.length,outcome:'CSP report forwarded without redirect'});
    const result:Record<string,string>={'cache-control':'no-store','content-type':response.headers.get('content-type')||'application/octet-stream'};
    if(response.headers.has('retry-after'))result['retry-after']=response.headers.get('retry-after')!;
    res.writeHead(response.status,result);res.end(body);
  }catch{res.writeHead(502);res.end('CSP report transport failed');}
  return true;
}
