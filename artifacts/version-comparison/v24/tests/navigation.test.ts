import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverNavigation } from '../src/navigation.js';
import { targetAllowed } from '../src/policy.js';

test('recover escaped search paths without losing query values',()=>{
  const origin='http://localhost:3001';
  const source=origin+'/uv-service/'+encodeURIComponent('https://www.temu.com/dz-en/home.html');
  const result=recoverNavigation('/search_result.html?search_key=blue%20shoes&sort=price',source,origin);
  assert.equal(result,'/uv-service/'+encodeURIComponent('https://www.temu.com/search_result.html?search_key=blue%20shoes&sort=price'));
  assert.equal(recoverNavigation('/search_result.html','https://evil.test/uv-service/'+encodeURIComponent('https://www.temu.com/'),origin),null);
  assert.equal(recoverNavigation('/unknown.html',origin+'/uv-service/%invalid',origin),null);
  for(const path of ['//evil.test/','/_relay','/uv/config.js'])assert.equal(recoverNavigation(path,source,origin),null);
});

test('confirmed search and verification escapes recover without referrer, with queries intact',()=>{
  const origin='http://localhost:3001';
  for(const path of ['/search_result.html?search_key=%D8%A7%D9%84%D9%87%D8%A7%D8%AA%D9%81&search_method=hot&prerender=123','/bgn_verification.html?verifyCode=owned-test-value&from=https%3A%2F%2Fwww.temu.com%2F']){
    for(const referer of [undefined,origin+'/search_result.html',origin+'/uv-service/'+encodeURIComponent(origin+'/product.html')])assert.equal(recoverNavigation(path,referer,origin),'/uv-service/'+encodeURIComponent('https://www.temu.com'+path));
  }
  for(const path of ['/unknown.html','/api/private','/search_result.html/extra','/bgn_verification.html.evil','/\\evil.test/search_result.html'])assert.equal(recoverNavigation(path,undefined,origin),null,path);
});

test('merchant host families permit dependencies without accepting lookalikes',()=>{
  for(const host of ['eu.pftk.temu.com','new-assets.kwcdn.com','accounts.google.com','connect.facebook.net','appleid.cdn-apple.com'])assert.equal(targetAllowed(new URL('https://'+host)),true,host);
  for(const host of ['temu.com.evil.test','nottemu.com','kwcdn.com.evil.test','accounts.google.com.evil.test','localhost'])assert.equal(targetAllowed(new URL('https://'+host)),false,host);
});
