import test from 'node:test';
import assert from 'node:assert/strict';
import {StaticCache} from '../src/static-cache.js';

test('static cache respects public freshness, bounds and sensitive request exclusions',()=>{
  let time=0;const cache=new StaticCache(8,()=>time);
  const url=new URL('https://img.kwcdn.com/owned.png');
  const key=cache.key(url,'GET','image',{accept:'image/png'});
  const headers={'content-type':'image/png','cache-control':'public, max-age=10',age:'2'};
  cache.put(key,200,headers,Buffer.from('owned'));
  assert.equal(cache.get(key)?.body.toString(),'owned');time=3000;assert.equal(cache.get(key)?.headers.age,'5');time=8000;assert.equal(cache.get(key),null);
  const exclusions:Record<string,string|string[]>[]=[{'cache-control':'private, max-age=10'},{'cache-control':'public, no-store, max-age=10'},{'set-cookie':['owned=value']},{vary:'Accept'},{'content-type':'application/json'}];
  for(const header of exclusions){
    cache.put(key,200,{...headers,...header},Buffer.from('owned'));assert.equal(cache.get(key),null);
  }
  cache.put(key,429,headers,Buffer.from('owned'));assert.equal(cache.get(key),null);
  assert.equal(cache.key(new URL('https://www.temu.com/api/cart'),'GET','image',{}),null);
  assert.equal(cache.key(url,'POST','image',{}),null);assert.equal(cache.key(url,'GET','empty',{}),null);
  const requests:Record<string,string>[]=[{authorization:'owned'},{range:'bytes=0-1'},{'cache-control':'no-cache'}];
  for(const headers of requests)assert.equal(cache.key(url,'GET','image',headers),null);
  const second=cache.key(new URL('https://img.kwcdn.com/second.png'),'GET','image',{});
  cache.put(key,200,headers,Buffer.from('first'));cache.put(second,200,headers,Buffer.from('last'));
  assert.equal(cache.get(key),null);assert.equal(cache.get(second)?.body.toString(),'last');
  time=20000;cache.put(key,200,{...headers,date:new Date(0).toUTCString()},Buffer.from('old'));assert.equal(cache.get(key),null,'Date also contributes to freshness');
});
