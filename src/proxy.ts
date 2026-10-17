import type { IncomingMessage, ServerResponse } from 'node:http';
import { fromProxy, toProxy } from './policy.js';
import { rewriteHTML } from './rewrite.js';
import { temu, unavailable } from './cart.js';
import { record, type Session } from './sessions.js';
import { upstream, boundedBody, type Transport } from './transport.js';

export function message(res: ServerResponse, status: number, title: string, detail: string) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" });
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:17px system-ui;padding:28px;max-width:650px;margin:5vh auto;color:#16332c;background:#f6faf8}h1{font-size:28px}p{line-height:1.6}</style><h1>${escape(title)}</h1><p>${escape(detail)}</p>`);
}
export async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (['GET','HEAD'].includes(req.method || 'GET')) return;
  const parts: Buffer[] = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > 1024 * 1024) throw new Error('BODY_TOO_LARGE'); parts.push(Buffer.from(chunk)); }
  return Buffer.concat(parts);
}
export async function proxy(req: IncomingMessage, res: ServerResponse, session: Session, transport: Transport = upstream) {
  let url: URL;
  try { url = fromProxy(req.url || '/'); } catch { return message(res, 403, 'Target blocked', 'Only reviewed HTTPS merchant hosts are allowed.'); }
  if (!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(req.method!)) return message(res,405,'Method blocked','Unsupported HTTP method.');
  if (session.halted) return message(res, 409, 'Merchant access stopped', session.halted);
  // Login and purchase submission are deliberately unsupported in this diagnostic prototype.
  if (/login|signin|sign-in|register|oauth|password|payment|place.?order|submit.?order|order.?create/i.test(decodeURIComponent(url.pathname))) return message(res, 403, 'Unsupported sensitive workflow', 'Login and purchase submission are unavailable in this prototype.');
  const method = req.method || 'GET';
  try {
    const body = await readBody(req);
    const headers: Record<string,string> = { 'accept-encoding': 'gzip, deflate, br', 'user-agent': 'Temby-Local-Proxy-PoC/0.1' };
    for (const key of ['accept','accept-language','content-type','range']) if (typeof req.headers[key] === 'string') headers[key] = req.headers[key];
    const cookie = await session.jar.getCookieString(url.href); if (cookie) headers.cookie = cookie;
    // Keep the actual browser Origin. Do not forge the merchant origin or forward browser credentials.
    if (req.headers.origin) headers.origin = req.headers.origin;
    const response = await transport(url, method, headers, body);
    const type = response.headers.get('content-type') || 'application/octet-stream';
    const data = await boundedBody(response);
    const text = /html|json|javascript/.test(type) ? data.toString('utf8') : '';
    const restriction = temu.challenge(text, response.status);
    if (restriction) {
      session.halted = restriction; session.cart = unavailable('temu', restriction);
      record(session, {host:url.hostname, method, status:response.status, type, bytes:data.length, outcome:restriction});
      return message(res, 424, 'Temu access restriction detected', `${restriction}. The upstream response was not a usable storefront. Challenge execution is stopped. No verified cart or checkout amount is available.`);
    }
    for (const cookie of response.headers.getSetCookie()) await session.jar.setCookie(cookie, url.href, {ignoreError:true});
    const location = response.headers.get('location');
    record(session, {host:url.hostname, method, status:response.status, type, bytes:data.length, outcome:location ? 'redirect header observed' : 'forwarded'});
    const out: Record<string,string> = { 'content-type':type, 'cache-control':'no-store', 'referrer-policy':'no-referrer', 'x-content-type-options':'nosniff' };
    // Preserve merchant security policies. An incompatible policy is a limitation, not something to remove.
    for (const key of ['content-security-policy','content-security-policy-report-only','x-frame-options','content-range','accept-ranges','vary']) { const v=response.headers.get(key); if (v) out[key]=v; }
    if (location) {
      const mapped = toProxy(location,url);
      if (mapped === '/_blocked') return message(res, 403, 'Redirect blocked', 'The redirect destination is outside the reviewed merchant allowlist.');
      out.location = mapped;
    }
    if (type.includes('application/json')) {
      try { const cart = temu.extract(url, JSON.parse(text)); if (cart) session.cart=cart; } catch { /* not a usable JSON cart */ }
    }
    res.writeHead(response.status, out);
    res.end(method === 'HEAD' ? undefined : type.includes('text/html') ? rewriteHTML(text,url) : data);
  } catch (error) {
    record(session, {host:url.hostname,method,status:502,type:'',bytes:0,outcome:error instanceof Error && ['BODY_TOO_LARGE','RESPONSE_TOO_LARGE'].includes(error.message) ? error.message : 'upstream transport failure'});
    message(res, 502, 'Proxy request failed', 'The upstream request failed or exceeded the diagnostic limits. No sensitive request data was recorded.');
  }
}
