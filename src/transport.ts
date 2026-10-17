import { Agent, fetch } from 'undici';
import { safeLookup, targetAllowed } from './policy.js';
export const dispatcher = new Agent({ connect: { lookup: safeLookup, timeout: 15000 }, headersTimeout: 20000, bodyTimeout: 20000 });
export async function upstream(url: URL, method: string, headers: Record<string, string>, body?: Buffer) {
  if (!targetAllowed(url)) throw new Error('TARGET_DENIED');
  return fetch(url, { dispatcher, method, headers, body: body as any, redirect: 'manual', signal: AbortSignal.timeout(25000) });
}
export type Transport = typeof upstream;
export async function boundedBody(response: Awaited<ReturnType<Transport>>, max = 12 * 1024 * 1024): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(); const parts: Buffer[] = []; let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new Error('RESPONSE_TOO_LARGE'); }
      parts.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
