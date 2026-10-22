import { randomBytes } from 'node:crypto';
import { CookieJar } from 'tough-cookie';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface Event { time: string; host: string; method: string; status: number; type: string; bytes: number; outcome: string; cookiesSent?: number; virtualCookies?: number; setCookies?: number; destination?: string; omittedHeaders?: string[]; route?:string; errorCode?:number; applicationFailed?:boolean; elapsedMs?:number;cartObservation?:string; }
export interface Session { jar: CookieJar; touched: number; events: Event[]; failures:Event[];metrics?:Record<string,number>;apiEvents?:Event[]; }
export class Sessions {
  private entries = new Map<string, Session>();
  constructor(private ttl = 60 * 60 * 1000, private secureCookie = false) {}
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
    res.setHeader('Set-Cookie', `temby_sid=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.ceil(this.ttl / 1000)}${this.secureCookie ? '; Secure' : ''}`);
    session.touched = now; return session;
  }
  health(selected?:Session){
    const groups=new Map<string,{host:string;route?:string;status:number;errorCode?:number;outcome:string;count:number;lastSeen:string}>();
    for(const session of selected?[selected]:this.entries.values())for(const event of session.failures){
      const key=JSON.stringify([event.host,event.route,event.status,event.errorCode,event.outcome]);
      const item=groups.get(key)||{host:event.host,route:event.route,status:event.status,errorCode:event.errorCode,outcome:event.outcome,count:0,lastSeen:event.time};
      item.count++;if(event.time>item.lastSeen)item.lastSeen=event.time;groups.set(key,item);
    }
    return [...groups.values()].sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen)).slice(0,100);
  }
}
export function record(s: Session, event: Omit<Event, 'time'>) {
  const source=/^Coalesced/.test(event.outcome)?'coalesced':/^Public cache/.test(event.outcome)?'cache':/^Merchant cooldown/.test(event.outcome)?'cooldown':/^Optional telemetry/.test(event.outcome)?'blocked':/^Client canceled/.test(event.outcome)?'canceled':event.outcome==='Rewriting engine relay'||event.outcome==='Binary static stream'?'upstream':event.method==='DIAGNOSTIC'?'browser':'local';
  s.metrics??={};s.metrics[source]=Math.min(Number.MAX_SAFE_INTEGER,(s.metrics[source]||0)+1);
  const entry={time:new Date().toISOString(),...event};s.events.push(entry);
  // Keep successful API calls as well as refusals. Resource bursts must not
  // erase the flow leading from an item lookup/add to login or verification.
  if(event.route){s.apiEvents??=[];s.apiEvents.push(entry);if(s.apiEvents.length>100)s.apiEvents.shift();}
  if(event.status>=400||event.applicationFailed){s.failures.push(entry);if(s.failures.length>40)s.failures.shift();}
  if (s.events.length > 100) s.events.shift();
}
