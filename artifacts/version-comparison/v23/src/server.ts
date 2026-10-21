import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Sessions, record } from './sessions.js';
import { message, readBody } from './http.js';
import { upstream, type Transport } from './transport.js';
import { engineAsset, engineRelay } from './engine.js';
import { recoverNavigation } from './navigation.js';
import { forwardCspReport } from './reports.js';

export function createServers(port = 3000, merchantPort = 3001, transport: Transport = upstream, options:{ownedFixtures?:boolean}={}) {
  const sessions = new Sessions();
  const appOrigin = `http://localhost:${port}`; const merchantOrigin = `http://localhost:${merchantPort}`;
  function guard(req: IncomingMessage, res: ServerResponse, expected: number) {
    if (![`localhost:${expected}`,`127.0.0.1:${expected}`].includes(req.headers.host || '')) { res.writeHead(403); res.end('Invalid host'); return false; }
    res.setHeader('Cache-Control','no-store');
    if (req.headers['sec-fetch-site'] === 'cross-site') { res.writeHead(403); res.end('Cross-site requests blocked'); return false; }
    if (!['GET','HEAD'].includes(req.method || '') && ![appOrigin,merchantOrigin].includes(req.headers.origin || '')) { res.writeHead(403); res.end('Origin required'); return false; }
    return true;
  }
  const handle = (merchant: boolean) => async (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req,res,merchant?merchantPort:port)) return;
    try {
      const s = sessions.get(req,res); const url=new URL(req.url || '/',appOrigin);
      if (merchant) {
        if (await engineAsset(url.pathname,res,req)) return;
        if (url.pathname==='/_state') {res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({events:s.events}));return;}
        if (url.pathname==='/_relay') return await engineRelay(req,res,s,transport,options.ownedFixtures===true);
        if(url.pathname==='/_runtime'){
          if(req.method!=='POST'){res.writeHead(405);res.end();return;}
          let event;try{event=JSON.parse((await readBody(req))!.toString());}catch{res.writeHead(400);res.end();return;}
          if(!['config-loaded','document-ready','page-error','promise-rejection','page-leaving','worker-blocked','relay-refused'].includes(event?.phase)){res.writeHead(400);res.end();return;}
          const error=['Error','TypeError','SyntaxError','ReferenceError','RangeError','URIError','EvalError','DOMException'].includes(event.error)?': '+event.error:'';
          record(s,{host:'browser',method:'DIAGNOSTIC',status:0,type:'runtime',bytes:0,outcome:event.phase+error});
          res.writeHead(204);res.end();return;
        }
        if(url.pathname.startsWith('/uv-service/')&&req.method==='GET'&&(req.headers['sec-fetch-dest']==='document'||req.headers.accept?.includes('text/html'))){
          // Bookmarks and fresh browser profiles may arrive before a worker
          // exists. Bootstrap in place, preserving the encoded destination.
          await engineAsset('/uv/',res,req);return;
        }
        if (url.pathname.startsWith('/uv-service/')) return message(res,503,'Rewriting worker not ready','Open http://localhost:'+port+'/ to initialize the proxy in this browser.');
        if (url.pathname==='/favicon.ico') {res.writeHead(204);res.end();return;}
        // Browser service workers would capture later sessions on this shared origin.
        if (req.headers['service-worker']) return message(res,403,'Service worker blocked','Persistent merchant service workers are unsupported.');
        if(await forwardCspReport(req,res,s,transport))return;
        if(['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(req.method||'')){
          // 307 retains the method/body for escaped API and CSP-report POSTs.
          // Only GET/HEAD may use the two fixed paths without a referrer.
          const isRead=['GET','HEAD'].includes(req.method||'');
          const referrer=req.headers.referer;
          const identified=isRead||referrer?.startsWith(merchantOrigin+'/uv-service/');
          const recovered=identified?recoverNavigation(req.url||'/',referrer,merchantOrigin):null;
          if(recovered){res.writeHead(307,{location:recovered});res.end();return;}
        }
        res.writeHead(404,{'content-type':'text/plain'});res.end('No local proxy resource at this path.');return;
      }
      if (req.method!=='GET' && req.method!=='HEAD') { res.writeHead(405); res.end(); return; }
      if(url.pathname==='/'){res.writeHead(302,{location:merchantOrigin+'/uv/'});res.end();return;}
      if(url.pathname==='/api/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({failures:sessions.health()}));return;}
      if (url.pathname==='/api/state') {
        res.writeHead(200,{'content-type':'application/json','x-content-type-options':'nosniff'});
        res.end(JSON.stringify({events:s.events})); return;
      }
      const file = {'/diagnostics':'diagnostics.html','/diagnostics.js':'diagnostics.js'}[url.pathname];
      if (!file) {res.writeHead(404);res.end();return;}
      const data=(await readFile(new URL(`../public/${file}`,import.meta.url),'utf8')).replaceAll('__MERCHANT_ORIGIN__',merchantOrigin);
      res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8','content-security-policy':`default-src 'self'; frame-src ${merchantOrigin}; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`});
      res.end(data);
    } catch { if (!res.headersSent) message(res,500,'Local request failed','The local diagnostic request could not be completed.'); else res.end(); }
  };
  const app=createServer(handle(false)); const merchant=createServer(handle(true));
  for (const server of [app,merchant]) { server.requestTimeout=30000; server.headersTimeout=10000; server.on('upgrade',(_,socket)=>socket.destroy()); }
  return {app,merchant};
}
