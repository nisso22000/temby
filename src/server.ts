import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Sessions, SessionBusyError, SessionCapacityError, SessionStoreUnavailableError, record } from './sessions.js';
import type { SessionManager } from './session-manager.js';
import { message, readBody } from './http.js';
import { upstream, type Transport } from './transport.js';
import { engineAsset, engineRelay } from './engine.js';
import { recoverNavigation } from './navigation.js';
import { forwardCspReport } from './reports.js';
import { companionMail } from './companion-mail.js';
import {NetworkFilter,type FilterMode} from './network-filter.js';

export interface ServerOptions { ownedFixtures?:boolean; filterMode?:FilterMode; directAssets?:boolean; appOrigin?:string; merchantOrigin?:string; secureCookies?:boolean; sessionCapacity?:number; sessions?:SessionManager; }
export function createServers(port = 3000, merchantPort = 3001, transport: Transport = upstream, options:ServerOptions={}) {
  const sessions: SessionManager = options.sessions || new Sessions(undefined,options.secureCookies===true,options.sessionCapacity);
  const filter=new NetworkFilter(options.filterMode||'off');
  const appOrigin = options.appOrigin || `http://localhost:${port}`; const merchantOrigin = options.merchantOrigin || `http://localhost:${merchantPort}`;
  const appHost = new URL(appOrigin).host; const merchantHost = new URL(merchantOrigin).host;
  function guard(req: IncomingMessage, res: ServerResponse, expected: number) {
    const allowedHosts=expected===port?[appHost,`localhost:${expected}`,`127.0.0.1:${expected}`]:[merchantHost,`localhost:${expected}`,`127.0.0.1:${expected}`];
    if (!allowedHosts.includes(req.headers.host || '')) { res.writeHead(403); res.end('Invalid host'); return false; }
    res.setHeader('Cache-Control','no-store');
    if (req.headers['sec-fetch-site'] === 'cross-site') { res.writeHead(403); res.end('Cross-site requests blocked'); return false; }
    if (!['GET','HEAD'].includes(req.method || '') && ![appOrigin,merchantOrigin].includes(req.headers.origin || '')) { res.writeHead(403); res.end('Origin required'); return false; }
    return true;
  }
  const handle = (merchant: boolean) => async (req: IncomingMessage, res: ServerResponse) => {
    if (!guard(req,res,merchant?merchantPort:port)) return;
    let session;
    try {
      const url=new URL(req.url || '/',appOrigin);
      // Deliberately cookie-free: this is the only endpoint intended for the
      // reverse proxy/container health check.
      if (!merchant && url.pathname==='/healthz') {if(!sessions.ready?.()){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{"status":"degraded"}');return;}res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end('{"status":"ok"}');return;}
      // The launcher only redirects into the merchant origin. Do not consume a
      // session slot or set an unused cookie before actual browsing begins.
      if (!merchant && url.pathname==='/' && ['GET','HEAD'].includes(req.method||'')) {res.writeHead(302,{location:merchantOrigin+'/uv/'});res.end();return;}
      // Assets have no per-user server state. Serving them without allocating
      // a session prevents scanners and parallel asset loads from exhausting
      // the bounded merchant-session store.
      if (merchant && url.pathname!=='/uv/' && await engineAsset(url.pathname,res,req,{directAssets:options.directAssets===true,blockTelemetry:options.filterMode==='balanced'})) return;
      const s = session = await sessions.get(req,res);
      if (merchant) {
        if(url.pathname==='/_companion/mail')return await companionMail(req,res,s,merchantOrigin);
        if (await engineAsset(url.pathname,res,req,{directAssets:options.directAssets===true,blockTelemetry:options.filterMode==='balanced'})) return;
        if (url.pathname==='/_state') {res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({events:s.events}));return;}
        if (url.pathname==='/_relay') return await engineRelay(req,res,s,transport,options.ownedFixtures===true,filter);
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
      if(url.pathname==='/api/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({failures:sessions.health(s)}));return;}
      if(url.pathname==='/api/metrics'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({counts:s.metrics||{}}));return;}
      if (url.pathname==='/api/state') {
        res.writeHead(200,{'content-type':'application/json','x-content-type-options':'nosniff'});
        res.end(JSON.stringify({events:s.events,apiEvents:s.apiEvents||[]})); return;
      }
      const file = {'/diagnostics':'diagnostics.html','/diagnostics.js':'diagnostics.js'}[url.pathname];
      if (!file) {res.writeHead(404);res.end();return;}
      const data=(await readFile(new URL(`../public/${file}`,import.meta.url),'utf8')).replaceAll('__MERCHANT_ORIGIN__',merchantOrigin);
      res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8','content-security-policy':`default-src 'self'; frame-src ${merchantOrigin}; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`});
      res.end(data);
    } catch (error) {
      // Keep logs useful without recording URLs, cookies, request bodies, or
      // upstream response data. Detailed diagnostics remain session-scoped.
      const details=error as {name?:unknown;code?:unknown};
      const capacity=error instanceof SessionCapacityError;
      const unavailable=error instanceof SessionStoreUnavailableError;
      const busy=error instanceof SessionBusyError;
      console.error(JSON.stringify({time:new Date().toISOString(),level:'error',event:capacity?'session_capacity_reached':unavailable?'session_store_unavailable':busy?'session_busy':'request_failed',errorName:typeof details?.name==='string'?details.name:'UnknownError',errorCode:typeof details?.code==='string'?details.code:undefined}));
      if(capacity)return message(res,503,'Temporarily busy','This service has reached its active-session limit. Please try again later.');
      if(unavailable)return message(res,503,'Temporarily unavailable','The session service is temporarily unavailable. Please try again shortly.');
      if(busy)return message(res,503,'Please retry','Another request from this browser is still being processed. Please try again shortly.');
      if (!res.headersSent) message(res,500,'Local request failed','The local diagnostic request could not be completed.'); else res.end();
    } finally {
      if(session) try { await sessions.commit?.(session); }
      catch (error) {
        const details=error as {name?:unknown;code?:unknown};
        console.error(JSON.stringify({time:new Date().toISOString(),level:'error',event:'session_commit_failed',errorName:typeof details?.name==='string'?details.name:'UnknownError',errorCode:typeof details?.code==='string'?details.code:undefined}));
      }
    }
  };
  const app=createServer(handle(false)); const merchant=createServer(handle(true));
  for (const server of [app,merchant]) { server.requestTimeout=30000; server.headersTimeout=10000; server.on('upgrade',(_,socket)=>socket.destroy()); }
  return {app,merchant};
}
