import { createServers } from './server.js';
import { dispatcher } from './transport.js';
const port=Number(process.env.PORT || 3000); const merchantPort=Number(process.env.MERCHANT_PORT || 3001);
if (![port,merchantPort].every(n=>Number.isInteger(n)&&n>1023&&n<65536)||port===merchantPort) throw new Error('Invalid ports');
const filterMode=process.env.TEMBY_FILTER_MODE||'off';
if(!['off','balanced'].includes(filterMode))throw Error('Invalid TEMBY_FILTER_MODE');
const sessionCapacity=Number(process.env.SESSION_CAPACITY||100);
if(!Number.isInteger(sessionCapacity)||sessionCapacity<1||sessionCapacity>100000)throw Error('Invalid SESSION_CAPACITY');
const production=process.env.NODE_ENV==='production';
const appOrigin=process.env.PUBLIC_APP_ORIGIN;
const merchantOrigin=process.env.PUBLIC_MERCHANT_ORIGIN;
if(production&&(!appOrigin||!merchantOrigin))throw new Error('PUBLIC_APP_ORIGIN and PUBLIC_MERCHANT_ORIGIN are required in production');
for(const value of [appOrigin,merchantOrigin])if(value){const url=new URL(value);if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash)throw new Error('Public origins must be bare HTTPS origins');}
if(appOrigin&&merchantOrigin&&appOrigin===merchantOrigin)throw new Error('Public origins must be distinct');
const log=(event:string,fields:Record<string,unknown>={})=>console.log(JSON.stringify({time:new Date().toISOString(),level:'info',event,...fields}));
const {app,merchant}=createServers(port,merchantPort,undefined,{filterMode:filterMode as 'off'|'balanced',directAssets:process.env.TEMBY_DIRECT_ASSETS==='1',appOrigin,merchantOrigin,secureCookies:production,sessionCapacity});
for (const server of [app,merchant]) server.on('error',(error)=>{ console.error(JSON.stringify({time:new Date().toISOString(),level:'error',event:'listener_error',message:error.message}));process.exitCode=1;void shutdown('listener_error'); });
app.listen(port,'0.0.0.0',()=>log('app_listening',{port}));
merchant.listen(merchantPort,'0.0.0.0',()=>log('merchant_listening',{port:merchantPort}));
let stopping=false;
async function shutdown(reason:string){
  if(stopping)return;stopping=true;log('shutdown_started',{reason});
  const force=setTimeout(()=>{for(const server of [app,merchant])server.closeAllConnections();},25000);force.unref();
  await Promise.all([new Promise<void>(resolve=>app.close(()=>resolve())),new Promise<void>(resolve=>merchant.close(()=>resolve()))]);
  clearTimeout(force);await dispatcher.close();log('shutdown_complete');
}
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>void shutdown(signal));
