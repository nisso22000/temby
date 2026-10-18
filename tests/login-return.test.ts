import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('only known login return URLs unwrap our proxy prefix, preserving unrelated query bytes',async()=>{
  const context={self:{} as any,URL,decodeURIComponent,encodeURIComponent};vm.runInNewContext(await readFile(new URL('../public/uv-url.js',import.meta.url),'utf8'),context);
  const origin='http://localhost:3001',prefix='/uv-service/';const meta={origin,url:'https://www.temu.com/'};
  const normalize=context.self.__tembyUpstreamURL;
  const search='https://www.temu.com/search_result.html?search_key=pc&owned=keep%2f+bytes%20here';
  const physical=origin+prefix+encodeURIComponent(search);
  const suffix='&login_scene=2&owned=keep%2f+bytes%20here#section';
  const login='https://www.temu.com/login.html?from='+encodeURIComponent(physical)+suffix;
  const expected='https://www.temu.com/login.html?from='+encodeURIComponent(search)+suffix;
  assert.equal(normalize(login,meta),expected);
  assert.equal(normalize(origin+prefix+encodeURIComponent(login),meta),expected);
  assert.equal(normalize('/login.html?from='+encodeURIComponent(physical)+suffix,meta),expected.replace('https://www.temu.com',''));
  for(const unchanged of [
    '/product-123.html?gallery=keep%2f+bytes%20here',
    '../category/product.html#details',
    'https://img.kwcdn.com/product.jpg?imageMogr2/thumbnail/48x9999%3E',
    'https://www.temu.com/search_result.html?search_key=pc&from=ordinary',
    'https://www.temu.com/login.html?from='+encodeURIComponent(search),
    'https://www.temu.com/login.html?from='+encodeURIComponent('https://external.test/return'),
    'https://www.temu.com/login.html?from='+encodeURIComponent(origin+'/not-a-proxy-page'),
    'https://www.temu.com/login.html?from='+encodeURIComponent(origin+prefix+encodeURIComponent('https://external.test/return')),
    'https://www.temu.com/login.html?from='+encodeURIComponent(physical)+'&from=duplicate',
    'https://www.temu.com/bgn_verification.html?from='+encodeURIComponent(physical),
    'https://external.test/login.html?from='+encodeURIComponent(physical),
  ])assert.equal(normalize(unchanged,meta),unchanged);
  const unusualLogin='https://www.temu.com/log\nin.html?from='+encodeURIComponent(physical)+suffix;
  assert.equal(normalize(unusualLogin,meta),'https://www.temu.com/log\nin.html?from='+encodeURIComponent(search)+suffix);
  assert.equal(normalize('https://www.temu.com/./login.html?from='+encodeURIComponent(physical)+suffix,meta),'https://www.temu.com/./login.html?from='+encodeURIComponent(search)+suffix);
});
