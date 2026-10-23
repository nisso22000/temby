import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServers } from '../src/server.js';

test('owned load fixture is available only to an explicitly enabled test server', async () => {
  const { app, merchant } = createServers(3980, 3981, undefined, { ownedFixtures: true });
  app.listen(3980, '127.0.0.1'); merchant.listen(3981, '127.0.0.1');
  await Promise.all([once(app, 'listening'), once(merchant, 'listening')]);
  const origin = 'http://localhost:3981';
  const relay = async (path: string, destination: string) => {
    const response = await fetch(origin + '/_relay', {
      method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://fixture.temby.invalid' + path, method: 'GET', destination, headers: {} }),
    });
    return await response.json() as { status: number; headers: Record<string, string>; body: string };
  };
  try {
    const manifest = await relay('/load/manifest.json', 'empty');
    assert.equal(manifest.status, 200);
    assert.equal(JSON.parse(Buffer.from(manifest.body, 'base64').toString()).assets.javascriptBytes, 180000);
    const page = await relay('/load/catalog', 'document');
    const html = Buffer.from(page.body, 'base64').toString();
    assert.equal(page.status, 200);
    assert.match(html, /generated test content, not Temu/);
    assert.match(html, /load\/runtime\.js/);
    assert.match(html, /load\/catalog\.json/);
    const runtime = await relay('/load/runtime.js', 'script');
    assert.equal(Buffer.from(runtime.body, 'base64').length, 180000);
    const image = await relay('/load/media/0.svg', 'image');
    assert.match(Buffer.from(image.body, 'base64').toString(), /Owned load asset 0\.svg/);
  } finally {
    app.closeAllConnections(); merchant.closeAllConnections(); app.close(); merchant.close();
  }
});

