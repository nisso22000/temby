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

type ActiveSession = { id: string; createdAt: number; lockToken: string };

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
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      const acquired = await this.client.set(this.lockKey(id), token, { NX: true, PX: 35_000 });
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
    const lockToken = await this.acquireLock(id);
    const session: Session = { jar: new CookieJar(), touched: now, events: [], failures: [] };
    this.active.set(session, { id, createdAt: now, lockToken });
    this.setCookie(res, id, this.options.idleTtlSeconds);
    return session;
  }

  async get(req: IncomingMessage, res: ServerResponse): Promise<Session> {
    if (!this.ready()) throw new SessionStoreUnavailableError();
    const now = Date.now(); const id = this.cookie(req);
    let lock: {id:string;token:string}|undefined;
    try {
      if (!id) return await this.newSession(now, res);
      const lockToken = await this.acquireLock(id);
      lock={id,token:lockToken};
      const raw = await this.client.get(this.sessionKey(id));
      if (!raw) { await this.releaseLock(id, lockToken); lock=undefined; return await this.newSession(now, res); }
      const stored = this.decrypt(raw); const remaining = stored.createdAt + this.options.absoluteTtlSeconds * 1000 - now;
      if (remaining <= 0) {
        await this.client.del(this.sessionKey(id)); await this.client.zRem('temby:active-sessions', id); await this.releaseLock(id, lockToken); lock=undefined;
        return await this.newSession(now, res);
      }
      const session: Session = { jar: CookieJar.deserializeSync(stored.jar), touched: now, events: stored.events || [], failures: stored.failures || [], metrics: stored.metrics, apiEvents: stored.apiEvents };
      this.active.set(session, { id, createdAt: stored.createdAt, lockToken });
      this.setCookie(res, id, Math.min(this.options.idleTtlSeconds, Math.max(1, Math.floor(remaining / 1000))));
      return session;
    } catch (error) {
      if(lock) await this.releaseLock(lock.id,lock.token).catch(() => {});
      if (error instanceof SessionCapacityError || error instanceof SessionBusyError || error instanceof SessionStoreUnavailableError) throw error;
      throw new SessionStoreUnavailableError();
    }
  }

  async commit(session: Session) {
    const active = this.active.get(session);
    if (!active) return;
    try {
      if (!this.ready()) throw new SessionStoreUnavailableError();
      const now = Date.now(); const remaining = active.createdAt + this.options.absoluteTtlSeconds * 1000 - now;
      if (remaining <= 0) { await this.client.del(this.sessionKey(active.id)); await this.client.zRem('temby:active-sessions', active.id); return; }
      const ttl = Math.min(this.options.idleTtlSeconds, Math.max(1, Math.floor(remaining / 1000)));
      const stored: StoredSession = { version: 1, createdAt: active.createdAt, touched: session.touched, jar: await session.jar.serialize(), events: session.events, failures: session.failures, metrics: session.metrics, apiEvents: session.apiEvents };
      await this.client.set(this.sessionKey(active.id), this.encrypt(stored), { EX: ttl });
      await this.client.zAdd('temby:active-sessions', [{ score: now, value: active.id }]);
    } catch (error) {
      if (error instanceof SessionStoreUnavailableError) throw error;
      throw new SessionStoreUnavailableError();
    } finally {
      this.active.delete(session);
      if (this.ready()) await this.releaseLock(active.id, active.lockToken).catch(() => {});
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
