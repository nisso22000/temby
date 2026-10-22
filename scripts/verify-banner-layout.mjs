import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium,devices}=createRequire(import.meta.url)('C:/Users/Mecro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const mobile of [true,false]){
  const page=await browser.newPage(mobile?devices['Pixel 7']:{viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://localhost:4198/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px Arial}#merchantHeader{position:fixed;top:66px;height:40px;left:0;right:0;background:#fff;z-index:20;border-bottom:1px solid #ddd}#hero{height:360px;background:linear-gradient(140deg,#d4f3f9,#78c5d5);padding:20px;box-sizing:border-box}#headerSpace{height:40px}</style><div id="bannerUnit"><div style="height:66px"></div><div style="position:fixed;top:0;left:0;right:0;z-index:996"><div><div style="position:relative;overflow:hidden"><div style="height:66px"><div style="height:66px;top:0;z-index:998;background:#fff"><div js-selector="mobile-download-ui" class="downloadsWrapper-RLshn" style="height:66px"><button aria-label="close download module">×</button> Get Temu App</div></div></div></div></div></div></div><div id="merchantHeader">Temu · Search · Cart</div><div id="headerSpace"></div><main id="hero">Product image</main>'}));
  await page.goto('http://localhost:4198/goods.html');
  for(const file of ['companion-core.js','companion-icon.js'])await page.addScriptTag({content:await readFile('public/'+file,'utf8')});
  await page.evaluate(()=>{window.__uv={meta:{url:new URL('https://www.temu.com/goods.html')},rewriteUrl:u=>u};window.__tembyCart={select:()=>null,trace(){},observe(){return {refresh(){}}}};window.bannerClosed=0;});
  await page.addScriptTag({content:await readFile('public/companion.js','utf8')});
  await page.evaluate(()=>window.__tembyConfigureCompanion(window,{open:indexedDB.open}));
  await page.waitForTimeout(650);
  assert.equal(await page.locator('#bannerUnit').isVisible(),true,'unhydrated native banner must not be forcibly hidden');
  assert.equal(await page.locator('#hero').evaluate(el=>el.getBoundingClientRect().top),106,'keep native spacers until native state changes');
  await page.evaluate(()=>{document.querySelector('[aria-label="close download module"]').onclick=()=>{window.bannerClosed++;document.getElementById('bannerUnit').remove();document.getElementById('merchantHeader').style.top='0px';};});
  if(mobile){
   await page.waitForFunction(()=>window.bannerClosed===1);
   assert.equal(await page.locator('#merchantHeader').evaluate(el=>el.getBoundingClientRect().top),0);
   assert.equal(await page.locator('#hero').evaluate(el=>el.getBoundingClientRect().top),40,'hero starts below the normal header');
   assert.equal(await page.locator('[data-temby-mobile-chrome]').count(),0,'no banner wrappers are manually hidden');
   await page.evaluate(()=>window.scrollTo(0,0));await page.setViewportSize({width:412,height:550});
   assert.equal(await page.locator('#hero').evaluate(el=>el.getBoundingClientRect().top),40,'resize preserves flow');
   await mkdir('artifacts/companion-update',{recursive:true});await page.screenshot({path:'artifacts/companion-update/product-header-layout.png'});
  }else{await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>window.bannerClosed),0,'desktop banner untouched');}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Native banner layout passes: hydration delay, header offsets, product flow, resize and desktop preservation');
}finally{await browser.close()}
