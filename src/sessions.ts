import { randomBytes } from 'node:crypto';
import { CookieJar } from 'tough-cookie';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {SessionStore} from './session-store.js';

export interface Event { time: string; host: string; method: string; status: number; type: string; bytes: number; outcome: string; cookiesSent?: number; virtualCookies?: number; setCookies?: number; destination?: string; omittedHeaders?: string[]; route?:string; errorCode?:number; applicationFailed?:boolean; elapsedMs?:number; }
export interface Session { jar: CookieJar; touched: number; events: Event[]; failures:Event[]; mailbox?:{address:string;checked:number}; }
export class Sessions {
  private entries = new Map<string, Session>();
  private timer:ReturnType<typeof setTimeout>|undefined;
  constructor(private ttl = 24 * 60 * 60 * 1000,private store?:SessionStore) {
    const saved=store?.load();
    if(Array.isArray(saved))for(const row of saved.slice(0,100)){
      if(!row||!/^[a-f0-9]{64}$/.test(row.id)||!Number.isSafeInteger(row.touched)||Date.now()-row.touched<0||Date.now()-row.touched>ttl)continue;
      try{const session:Session={jar:CookieJar.deserializeSync(row.jar),touched:row.touched,events:[],failures:[]};
        if(/^temby-[a-f0-9]{36}@catchmail\.io$/.test(row.mailbox?.address)&&Number.isSafeInteger(row.mailbox?.checked))session.mailbox=row.mailbox;
        this.entries.set(row.id,session);
      }catch{}
    }
  }
  flush(){
    if(this.timer){clearTimeout(this.timer);this.timer=undefined;}
    this.store?.save([...this.entries].filter(([,s])=>Date.now()-s.touched<=this.ttl).map(([id,s])=>({id,touched:s.touched,jar:s.jar.serializeSync(),mailbox:s.mailbox})));
  }
  private persist(){if(!this.store||this.timer)return;this.timer=setTimeout(()=>{this.timer=undefined;try{this.flush();}catch{console.error('Local session persistence failed; restart continuity is unavailable.');}},150);this.timer.unref();}
  get(req: IncomingMessage, res: ServerResponse): Session {
    const now = Date.now();
    for (const [id, s] of this.entries) if (now - s.touched > this.ttl) this.entries.delete(id);
    let id = /(?:^|;\s*)temby_sid=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    let session = id ? this.entries.get(id) : undefined;
    if (!session) {
      if (this.entries.size >= 100) throw new Error('SESSION_CAPACITY');
      id = randomBytes(32).toString('hex');
      session = { jar: new CookieJar(), touched: now, events: [], failures:[] };
      this.entries.set(id, session);
    }
    // Keep the browser cookie lifetime aligned with the sliding server TTL.
    // Previously active browsing lost its cookie 30 minutes after creation.
    res.setHeader('Set-Cookie', `temby_sid=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.ceil(this.ttl / 1000)}`);
    session.touched = now;
    // Save again after response cookies or a mailbox association are committed.
    res.once?.('finish',()=>this.persist());this.persist();return session;
  }
  health(){
    const groups=new Map<string,{host:string;route?:string;status:number;errorCode?:number;outcome:string;count:number;lastSeen:string}>();
    for(const session of this.entries.values())for(const event of session.failures){
      const key=JSON.stringify([event.host,event.route,event.status,event.errorCode,event.outcome]);
      const item=groups.get(key)||{host:event.host,route:event.route,status:event.status,errorCode:event.errorCode,outcome:event.outcome,count:0,lastSeen:event.time};
      item.count++;if(event.time>item.lastSeen)item.lastSeen=event.time;groups.set(key,item);
    }
    return [...groups.values()].sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen)).slice(0,100);
  }
}
export function record(s: Session, event: Omit<Event, 'time'>) {
  const entry={time:new Date().toISOString(),...event};s.events.push(entry);
  if(event.status>=400||event.applicationFailed){s.failures.push(entry);if(s.failures.length>40)s.failures.shift();}
  if (s.events.length > 100) s.events.shift();
}
