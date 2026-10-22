import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type RedisClientType } from 'redis';
import { CookieJar, type SerializedCookieJar } from 'tough-cookie';
import { SessionBusyError, SessionCapacityError, SessionStoreUnavailableError, type Session } from './sessions.js';

export interface SessionManager {
  get(req: IncomingMessage, res: ServerResponse): Session | Promise<Session>;
  commit?(session: Session): void | Promise<void>;
  health(selected?: Session): ReturnType<import('./sessions.js').Sessions['health']>;
  ready?(): boolean;
  close?(): Promise<void>;
}

type StoredSession = {
  version: 1;
  createdAt: number;
  touched: number;
  jar: SerializedCookieJar;
  events: Session['events'];
  failures: Session['failures'];
  metrics?: Session['metrics'];
  apiEvents?: Session['apiEvents'];
};

// `initial` is the exact encrypted-record payload observed at request start.
// It lets a short commit-time lock merge independent concurrent updates instead
// of holding a lock while a merchant request is in flight.
type ActiveSession = { id: string; createdAt: number; initial?: StoredSession };

function cookieKey(cookie: any) { return [cookie.domain || '',cookie.path || '',cookie.key || ''].join('\u0000'); }
function cookieMap(jar: SerializedCookieJar) { return new Map<string,any>((Array.isArray((jar as any).cookies)?(jar as any).cookies:[]).map((cookie:any)=>[cookieKey(cookie),cookie])); }
function equal(value: unknown, other: unknown) { return JSON.stringify(value)===JSON.stringify(other); }
function mergeJar(latest: SerializedCookieJar, before: SerializedCookieJar|undefined, after: SerializedCookieJar) {
  if(!before)return after;
  const base=cookieMap(before),local=cookieMap(after),merged=cookieMap(latest);
  for(const key of new Set([...base.keys(),...local.keys()])) {
    const was=base.get(key),now=local.get(key);
    if(equal(was,now))continue;
    if(now)merged.set(key,now);else merged.delete(key);
  }
  return {...latest,cookies:[...merged.values()]} as SerializedCookieJar;
}
function eventKey(event: unknown) { return JSON.stringify(event); }
function additions<T>(before:T[]|undefined,after:T[]|undefined) {
  const known=new Set((before||[]).map(eventKey));return (after||[]).filter(item=>!known.has(eventKey(item)));
}
function mergeEvents<T extends {time:string}>(latest:T[]|undefined,before:T[]|undefined,after:T[]|undefined,limit:number) {
  const values=[...(latest||[])];const known=new Set(values.map(eventKey));
  for(const item of additions(before,after))if(!known.has(eventKey(item))){values.push(item);known.add(eventKey(item));}
  return values.sort((a,b)=>a.time.localeCompare(b.time)).slice(-limit);
}
function mergeMetrics(latest:Session['metrics'],before:Session['metrics'],after:Session['metrics']) {
  const merged={...(latest||{})};
  for(const [name,value] of Object.entries(after||{})){
    const change=value-(before?.[name]||0);if(change>0)merged[name]=(merged[name]||0)+change;
  }
  return Object.keys(merged).length?merged:undefined;
}

export class RedisSessionManager implements SessionManager {
  private readonly client: RedisClientType;
  private readonly key: Buffer;
  private readonly active = new WeakMap<Session, ActiveSession>();
  private connected = false;

  constructor(private readonly options: {
    url: string;
    password: string;
    encryptionKey: string;
    idleTtlSeconds: number;
    absoluteTtlSeconds: number;
    capacity: number;
    secureCookie: boolean;
  }) {
    this.key = Buffer.from(options.encryptionKey, 'base64');
    if (this.key.length !== 32) throw new Error('SESSION_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    this.client = createClient({ url: options.url, password: options.password, socket: { connectTimeout: 5000, reconnectStrategy: retries => Math.min(1000 * retries, 5000) } });
    this.client.on('error', () => { this.connected = false; });
    this.client.on('ready', () => { this.connected = true; });
    this.client.on('end', () => { this.connected = false; });
  }

  async connect() { await this.client.connect(); this.connected = true; }
  ready() { return this.connected && this.client.isReady; }
  async close() { if (this.client.isOpen) await this.client.quit(); }

  private cookie(req: IncomingMessage) { return /(?:^|;\s*)temby_sid=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1]; }
  private setCookie(res: ServerResponse, id: string, maxAge: number) {
    res.setHeader('Set-Cookie', `temby_sid=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${this.options.secureCookie ? '; Secure' : ''}`);
  }
  private sessionKey(id: string) { return `temby:session:${id}`; }
  private lockKey(id: string) { return `temby:session-lock:${id}`; }

  private encrypt(value: StoredSession) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`;
  }
  private decrypt(value: string): StoredSession {
    const [version, iv, tag, body] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !body) throw new Error('SESSION_DECRYPT_FAILED');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const parsed = JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')) as StoredSession;
    if (parsed.version !== 1 || !Number.isSafeInteger(parsed.createdAt) || !parsed.jar) throw new Error('SESSION_RECORD_INVALID');
    return parsed;
  }

  private async reserve(id: string, now: number) {
    const oldest = now - this.options.idleTtlSeconds * 1000;
    const accepted = await this.client.eval(
      "redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1]); if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end; redis.call('ZADD', KEYS[1], ARGV[3], ARGV[4]); return 1",
      { keys: ['temby:active-sessions'], arguments: [String(oldest), String(this.options.capacity), String(now), id] },
    );
    if (Number(accepted) !== 1) throw new SessionCapacityError();
  }

  private async acquireLock(id: string) {
    const token = randomBytes(24).toString('base64url');
    // This protects only the Redis read/merge/write critical section. It must
    // never cover an upstream merchant request, which could take many seconds.
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const acquired = await this.client.set(this.lockKey(id), token, { NX: true, PX: 10_000 });
      if (acquired === 'OK') return token;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new SessionBusyError();
  }

  private async releaseLock(id: string, token: string) {
    await this.client.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
      { keys: [this.lockKey(id)], arguments: [token] },
    );
  }

  private async newSession(now: number, res: ServerResponse) {
    const id = randomBytes(32).toString('hex');
    await this.reserve(id, now);
    const session: Session = { jar: new CookieJar(), touched: now, events: [], failures: [] };
    this.active.set(session, { id, createdAt: now });
    this.setCookie(res, id, this.options.idleTtlSeconds);
    return session;
  }

  async get(req: IncomingMessage, res: ServerResponse): Promise<Session> {
    if (!this.ready()) throw new SessionStoreUnavailableError();
    const now = Date.now(); const id = this.cookie(req);
    try {
      if (!id) return await this.newSession(now, res);
      const raw = await this.client.get(this.sessionKey(id));
      if (!raw) return await this.newSession(now, res);
      const stored = this.decrypt(raw); const remaining = stored.createdAt + this.options.absoluteTtlSeconds * 1000 - now;
      if (remaining <= 0) {
        await this.client.del(this.sessionKey(id)); await this.client.zRem('temby:active-sessions', id);
        return await this.newSession(now, res);
      }
      const session: Session = { jar: CookieJar.deserializeSync(stored.jar), touched: now, events: stored.events || [], failures: stored.failures || [], metrics: stored.metrics, apiEvents: stored.apiEvents };
      this.active.set(session, { id, createdAt: stored.createdAt, initial: stored });
      this.setCookie(res, id, Math.min(this.options.idleTtlSeconds, Math.max(1, Math.floor(remaining / 1000))));
      return session;
    } catch (error) {
      if (error instanceof SessionCapacityError || error instanceof SessionBusyError || error instanceof SessionStoreUnavailableError) throw error;
      throw new SessionStoreUnavailableError();
    }
  }

  async commit(session: Session) {
    const active = this.active.get(session);
    if (!active) return;
    let lockToken: string|undefined;
    try {
      if (!this.ready()) throw new SessionStoreUnavailableError();
      const now = Date.now(); const remaining = active.createdAt + this.options.absoluteTtlSeconds * 1000 - now;
      if (remaining <= 0) { await this.client.del(this.sessionKey(active.id)); await this.client.zRem('temby:active-sessions', active.id); return; }
      const ttl = Math.min(this.options.idleTtlSeconds, Math.max(1, Math.floor(remaining / 1000)));
      lockToken=await this.acquireLock(active.id);
      const currentRaw=await this.client.get(this.sessionKey(active.id));
      const current=currentRaw?this.decrypt(currentRaw):active.initial;
      const localJar=await session.jar.serialize();
      const stored: StoredSession = {
        version: 1, createdAt: active.createdAt, touched: Math.max(session.touched,current?.touched||0),
        jar: mergeJar(current?.jar||localJar,active.initial?.jar,localJar),
        events: mergeEvents(current?.events,active.initial?.events,session.events,100),
        failures: mergeEvents(current?.failures,active.initial?.failures,session.failures,40),
        metrics: mergeMetrics(current?.metrics,active.initial?.metrics,session.metrics),
        apiEvents: mergeEvents(current?.apiEvents,active.initial?.apiEvents,session.apiEvents,100),
      };
      await this.client.set(this.sessionKey(active.id), this.encrypt(stored), { EX: ttl });
      await this.client.zAdd('temby:active-sessions', [{ score: now, value: active.id }]);
    } catch (error) {
      if (error instanceof SessionStoreUnavailableError) throw error;
      throw new SessionStoreUnavailableError();
    } finally {
      this.active.delete(session);
      if (lockToken&&this.ready()) await this.releaseLock(active.id, lockToken).catch(() => {});
    }
  }

  health(selected?: Session) {
    if (!selected) return [];
    const groups = new Map<string, {host:string;route?:string;status:number;errorCode?:number;outcome:string;count:number;lastSeen:string}>();
    for (const event of selected.failures) {
      const key = JSON.stringify([event.host,event.route,event.status,event.errorCode,event.outcome]); const item = groups.get(key) || {host:event.host,route:event.route,status:event.status,errorCode:event.errorCode,outcome:event.outcome,count:0,lastSeen:event.time};
      item.count++; if(event.time > item.lastSeen)item.lastSeen=event.time; groups.set(key,item);
    }
    return [...groups.values()].sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen)).slice(0,100);
  }
}
