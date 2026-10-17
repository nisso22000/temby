import dns from 'node:dns';
import ipaddr from 'ipaddr.js';

export const hosts = new Set(['www.temu.com', 'temu.com', 'static.kwcdn.com', 'img.kwcdn.com', 'aimg.kwcdn.com', 'eu.pftk.temu.com']);
const integrations=new Set(['accounts.google.com','connect.facebook.net','appleid.cdn-apple.com']);
export function hostAllowed(hostname:string):boolean {
  return ['temu.com','kwcdn.com'].some(domain=>hostname===domain||hostname.endsWith('.'+domain))||integrations.has(hostname);
}
export function targetAllowed(url: URL): boolean {
  return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && hostAllowed(url.hostname);
}
export function publicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
// Validate the actual DNS answers used for the connection, not a separate preflight lookup.
export const safeLookup: typeof dns.lookup = ((hostname: string, options: any, callback: any) => {
  if (!hostAllowed(hostname)) return callback(new Error('HOST_DENIED'));
  dns.lookup(hostname, { all: true, verbatim: true }, (error, records) => {
    if (error) return callback(error);
    if (!records.length || records.some(r => !publicAddress(r.address))) return callback(new Error('ADDRESS_DENIED'));
    const candidates = options?.family ? records.filter(r => r.family === options.family) : records;
    if (!candidates.length) return callback(new Error('ADDRESS_UNAVAILABLE'));
    if (options?.all) callback(null, candidates); else callback(null, candidates[0].address, candidates[0].family);
  });
}) as typeof dns.lookup;

export function toProxy(value: string, base: URL): string {
  if (value.startsWith('#')) return value;
  try {
    const url = new URL(value, base);
    return targetAllowed(url) ? `/_p/${url.hostname}${url.pathname}${url.search}${url.hash}` : '/_blocked';
  } catch { return '/_blocked'; }
}
export function fromProxy(path: string): URL {
  const match = path.match(/^\/_p\/([^/]+)(\/.*)?$/);
  const url = match ? new URL(`https://${match[1]}${match[2] || '/'}`) : new URL(path, 'https://www.temu.com');
  if (!targetAllowed(url)) throw new Error('TARGET_DENIED');
  return url;
}
