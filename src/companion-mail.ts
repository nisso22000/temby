import {randomBytes} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Session} from './sessions.js';

// Disposable test mailboxes only. No inbox address, OTP or message is logged.
const mailboxes=new WeakMap<Session,{address:string;busy:boolean;checked:number}>();
let nextRequest=0;
export type MailFetch=typeof fetch;
async function request(path:string,fetcher:MailFetch){
  const now=Date.now();
  if(now<nextRequest)await new Promise(resolve=>setTimeout(resolve,nextRequest-now));
  nextRequest=Date.now()+1100;
  const response=await fetcher('https://api.catchmail.io/api/v1/'+path,{signal:AbortSignal.timeout(10000),redirect:'error',headers:{accept:'application/json'}});
  if(!response.ok){await response.body?.cancel();throw Error('MAIL_PROVIDER');}
  const reader=response.body?.getReader();if(!reader)throw Error('MAIL_PROVIDER');
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256*1024)throw Error('MAIL_SIZE');chunks.push(value);}}finally{await reader.cancel();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
// Global sequential queue respects Catchmail's per-IP anonymous limit.
let pending:Promise<unknown>=Promise.resolve();
const queued=(path:string,fetcher:MailFetch)=>{const result=pending.catch(()=>{}).then(()=>request(path,fetcher));pending=result;return result;};
export async function companionMail(req:IncomingMessage,res:ServerResponse,session:Session,origin:string,fetcher:MailFetch=fetch){
  const reply=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
  if(req.headers['x-temby-companion']!=='1'||(req.headers.origin&&req.headers.origin!==origin)){reply(403,{error:'Local companion request required'});return;}
  if(!['GET','POST'].includes(req.method||'')){reply(405,{error:'Method unsupported'});return;}
  if(!mailboxes.has(session)&&session.mailbox)mailboxes.set(session,{...session.mailbox,busy:false});
  if(req.method==='POST'){
    let entry=mailboxes.get(session);
    // Reuse rather than orphaning an account's recovery inbox on repeated clicks.
    if(!entry){entry={address:'temby-'+randomBytes(18).toString('hex')+'@catchmail.io',busy:false,checked:0};mailboxes.set(session,entry);}
    session.mailbox={address:entry.address,checked:entry.checked};
    reply(200,{address:entry.address});return;
  }
  const entry=mailboxes.get(session);
  if(!entry){reply(409,{error:'Create a test inbox first. Server restarts clear test inbox sessions.'});return;}
  if(entry.busy||Date.now()-entry.checked<5000){reply(429,{error:'Wait a few seconds before checking again.'});return;}
  entry.busy=true;entry.checked=Date.now();
  session.mailbox={address:entry.address,checked:entry.checked};
  try{
    const mailbox=encodeURIComponent(entry.address);
    const listing=await queued('mailbox?address='+mailbox+'&page_size=1',fetcher);
    if(!Array.isArray(listing.messages))throw Error('MAIL_FORMAT');
    const messages=[];
    const item=listing.messages[0];
    if(item){
      if(typeof item.id!=='string'||item.id.length>200)throw Error('MAIL_FORMAT');
      const detail=await queued('message/'+encodeURIComponent(item.id)+'?mailbox='+mailbox,fetcher);
      // Never render remote email HTML or execute links from an OTP email.
      messages.push({from:String(detail.from||'').slice(0,300),subject:String(detail.subject||'').slice(0,500),text:typeof detail.body?.text==='string'?detail.body.text.slice(0,12000):'This email has no plain-text body. Read it on Catchmail directly.'});
    }
    reply(200,{address:entry.address,messages});
  }catch{reply(502,{error:'Catchmail could not be reached or returned an unsupported response. Try again later.'});}
  finally{entry.busy=false;}
}
