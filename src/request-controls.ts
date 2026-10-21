import {createHash,randomBytes} from 'node:crypto';
import type {Session} from './sessions.js';

type Headers=Record<string,string|string[]>;
export class Cooldowns {
  private sessions=new WeakMap<Session,string>();
  private entries=new Map<string,{until:number;headers:Headers;body:Buffer}>();
  private bytes=0;
  constructor(private maxBytes=4*1024*1024,private maxEntries=256,private now=Date.now){}
  key(session:Session,url:URL,method:string,headers:Record<string,string>,body?:Buffer){
    let id=this.sessions.get(session);if(!id){id=randomBytes(16).toString('hex');this.sessions.set(session,id);}
    // Hash operation and credential context. Never persist raw query strings,
    // cookies, authorization or request bodies in diagnostic keys.
    return createHash('sha256').update(id).update(method).update(url.href)
      .update(JSON.stringify(Object.entries(headers).sort(([a],[b])=>a.localeCompare(b))))
      .update(body||Buffer.alloc(0)).digest('hex');
  }
  private remove(key:string){const entry=this.entries.get(key);if(entry){this.bytes-=entry.body.length;this.entries.delete(key);}}
  get(key:string){
    for(const [name,entry]of this.entries)if(entry.until<=this.now())this.remove(name);
    return this.entries.get(key);
  }
  put(key:string,headers:Headers,body:Buffer){
    const retry=String(headers['retry-after']||'').trim();
    const until=/^\d+$/.test(retry)?this.now()+Number(retry)*1000:Date.parse(retry);
    if(!Number.isFinite(until)||until<=this.now())return;
    // Keep original small refusals; larger bodies are not retained. Explicit
    // cooldown metadata is still honored with a labelled local refusal.
    const retained=body.length<=64*1024&&body.length<=this.maxBytes?Buffer.from(body):Buffer.from('{"error":"Merchant cooldown active; retry after the indicated time."}');
    const kept={...headers};delete kept['set-cookie'];
    if(retained.length!==body.length||!retained.equals(body))kept['content-type']='application/json';
    this.remove(key);this.get(key);
    while(this.entries.size&&(this.bytes+retained.length>this.maxBytes||this.entries.size>=this.maxEntries))this.remove(this.entries.keys().next().value!);
    if(retained.length>this.maxBytes)return;
    this.entries.set(key,{until,headers:kept,body:retained});this.bytes+=retained.length;
  }
  stats(){return {entries:this.entries.size,bytes:this.bytes};}
}

const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
export type StaticFlight={eligible:ReturnType<typeof deferred<boolean>>;done:ReturnType<typeof deferred<void>>};
export class StaticFlights {
  private entries=new Map<string,StaticFlight>();
  begin(key:string){
    const existing=this.entries.get(key);if(existing)return {flight:existing,owner:false};
    if(this.entries.size>=128)return null;
    const flight={eligible:deferred<boolean>(),done:deferred<void>()};this.entries.set(key,flight);return {flight,owner:true};
  }
  end(key:string,flight:StaticFlight){flight.eligible.resolve(false);flight.done.resolve();if(this.entries.get(key)===flight)this.entries.delete(key);}
}
export function waitFor<T>(promise:Promise<T>,signal:AbortSignal){
  signal.throwIfAborted();
  return new Promise<T>((resolve,reject)=>{
    const aborted=()=>{cleanup();reject(signal.reason);};const cleanup=()=>signal.removeEventListener('abort',aborted);
    signal.addEventListener('abort',aborted,{once:true});
    promise.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
}
