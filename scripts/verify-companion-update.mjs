import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('C:/Users/Mecro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://localhost:4199/**',r=>r.fulfill({body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><body><h1>Companion fixture</h1></body></html>',contentType:'text/html'}));
 await page.goto('http://localhost:4199');
 await page.addScriptTag({content:await readFile('public/companion-core.js','utf8')});
 await page.evaluate(()=>{
 window.__uv={meta:{url:new URL('https://www.temu.com/')},rewriteUrl:u=>u};

 window.__tembyCart={select:entries=>entries[0],trace(){},observe(w,cb){window.fixtureCart=cart=>cb([cart],[]);return {refresh(){}}},accountStatus:()=>null};
 });
 await page.evaluate(()=>{
 window.ServiceWorker.prototype.postMessage=function(message,ports){if(message.tembyMail)ports[0].postMessage({ok:true,data:{address:'fixture@example.test',messages:message.tembyMail==='GET'?(window.fixtureMessages||[]):[]}})};
 Object.defineProperty(navigator.serviceWorker,'controller',{value:Object.create(ServiceWorker.prototype),configurable:true});
 });
 await page.addScriptTag({content:await readFile('public/companion-icon.js','utf8')});
 await page.addScriptTag({content:await readFile('public/companion.js','utf8')});
 await page.evaluate(()=>window.__tembyConfigureCompanion(window,{open:indexedDB.open}));
 await page.evaluate(()=>{const banner=document.createElement('div');banner.className='downloadsWrapper-RLshn';banner.style.height='66px';banner.textContent='Download the app';const close=document.createElement('button');close.setAttribute('aria-label','close download module');banner.append(close);const outer=document.createElement('div');outer.id='bannerSpacer';outer.style.height='66px';const inner=document.createElement('div');inner.style.height='66px';inner.append(banner);outer.append(inner);const reserve=document.createElement('div');reserve.id='bannerSiblingSpace';reserve.style.height='66px';const group=document.createElement('div');group.append(outer,reserve);close.onclick=()=>{group.hidden=true;};document.body.append(group);const bubble=document.createElement('a');bubble.id='merchantCart';bubble.href='/shopping_cart.html';bubble.textContent='Cart';bubble.style.cssText='position:fixed;right:0;top:100px;width:50px;height:50px';document.body.append(bubble);const normal=document.createElement('a');normal.id='normalCart';normal.href='/shopping_cart.html';normal.textContent='Normal cart';document.body.append(normal);});
 await page.evaluate(()=>fixtureCart({minor:1000,minimum:2000,currency:'EUR',quantity:1,items:[{name:'Fixture item',quantity:1,specs:'Blue',selection:true}],time:Date.now(),source:'fixture'}));
 const host=page.locator('#temby-companion'),bubble=host.locator('#bubble');const initial=await bubble.boundingBox();assert.ok(Math.abs(initial.x-8)<2&&Math.abs(initial.y+initial.height-(mobile?844:900)+6)<2,'initial position is bottom-left');
 assert.equal(await page.locator('.downloadsWrapper-RLshn').isVisible(),!mobile);assert.equal(await page.locator('#merchantCart').isVisible(),!mobile);assert.equal(await page.locator('#bannerSpacer').evaluate(el=>el.getBoundingClientRect().height),mobile?0:66);assert.equal(await page.locator('#normalCart').isVisible(),true);assert.equal(await page.locator('#bannerSiblingSpace').evaluate(el=>el.getBoundingClientRect().height),mobile?0:66);
 await page.evaluate(()=>{const unit=document.createElement('div');unit.id='exactBannerUnit';unit.innerHTML='<div style="height:0.66rem"></div><div style="position:fixed;top:0;left:0;right:0;z-index:996"><div><div style="position:relative;overflow:hidden"><div style="height:0.66rem"><div style="height:0.66rem;top:0;z-index:998;background-color:#FFFFFF"><div js-selector="mobile-download-ui" class="downloadsWrapper-RLshn downloadsWithBottomBorder-3-05y nativeWidth-jbbzv" style="height:0.66rem"><button aria-label="close download module">close</button><span>Get Temu App</span></div></div></div></div></div></div>';document.body.append(unit);window.nativeCloseCount=0;unit.querySelector('button').onclick=()=>{window.nativeCloseCount++;unit.remove();};const bubble=document.createElement('div');bubble.id='exactMerchantBubble';bubble.className='root-2AOqZ normalZindex-267Cx';bubble.style.cssText='width:100vw;position:fixed;left:calc(54px - 100vw);right:auto';bubble.innerHTML='<div class="move-KzmZf" style="width:54px;height:54px;transform:translateX(16px) translateY(200px)"><div><div class="wrap-3FbFZ"><div class="container-jdRbJ" role="button" aria-label="عربة التسوق شحن مجاني"><svg class="cartIcon-wENgS"></svg></div></div></div></div>';document.body.append(bubble);});
 if(mobile){await page.waitForFunction(()=>window.nativeCloseCount===1);await page.locator('#exactMerchantBubble').waitFor({state:'hidden'});assert.equal(await page.locator('#exactBannerUnit').count(),0);}else{assert.equal(await page.evaluate(()=>window.nativeCloseCount),0);assert.equal(await page.locator('#exactMerchantBubble').isVisible(),true);}
 await page.evaluate(()=>{document.getElementById('exactBannerUnit')?.remove();document.getElementById('exactMerchantBubble')?.remove();});
 await bubble.click();assert.equal(await host.locator('#panel').getAttribute('lang'),'ar');assert.equal(await host.locator('.steps').count(),0);assert.equal(await host.locator('#badge').textContent(),new Intl.NumberFormat('fr-DZ',{maximumFractionDigits:0}).format(2887)+' DZD');
 assert.equal(await host.locator('#cartWarning').isVisible(),false);await host.locator('#cartItemsLabel').click();assert.equal(await host.locator('#items').isVisible(),true);assert.equal(await host.locator('#cartItems').evaluate(el=>el.nextElementSibling.id),'details');await host.locator('#cartItemsLabel').click();
 await page.evaluate(()=>{const input=document.createElement('input');input.type='email';document.body.append(input);});
 await host.locator('#accountTools').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('input[type=email]').value==='fixture@example.test');
 assert.equal(await host.locator('#accountTools').isVisible(),true);
 assert.equal(await host.locator('#passwordHint').count(),0);
 await page.evaluate(()=>{document.querySelector('input[type=email]').value='';});await page.waitForFunction(()=>document.querySelector('input[type=email]').value==='fixture@example.test');
 await page.evaluate(()=>{document.querySelector('input[type=email]').remove();const input=document.createElement('input');input.type='password';input.autocomplete='current-password';document.body.append(input);const confirm=input.cloneNode();confirm.autocomplete='new-password';document.body.append(confirm);});
 // Delayed password fields must fill without an autofill button.
 await page.waitForFunction(()=>[...document.querySelectorAll('input[type=password]')].every(el=>el.value.length===16));
 await page.waitForFunction(()=>document.getElementById('temby-companion').hasAttribute('data-login-alert'));
 assert.equal(await host.locator('#primary').isVisible(),false,'no redundant autofill action');
 assert.equal(await host.locator('.login-alert').isVisible(),true);
 await host.locator('#back').click();await page.waitForTimeout(650);assert.equal(await host.locator('#accountTools').isVisible(),false,'Back remains on cart while login is visible');
 await host.locator('#primary').click();
 await host.locator('#close').click();
 await host.locator('#accountHint').waitFor({state:'visible'});assert.equal(await host.locator('#accountHint').textContent(),'حسابك هنا');
 const box=await bubble.boundingBox();await page.mouse.move(box.x+24,box.y+24);await page.mouse.down();await page.mouse.move(220,220,{steps:8});await page.mouse.up();
 assert.equal(await host.locator('#panel').isVisible(),false,'drag must not open the panel');assert.ok(await host.evaluate(el=>el.getAnimations().some(a=>a.playState==='running')),'snap has a running animation');await page.waitForTimeout(380);const snapped=await bubble.boundingBox();assert.ok(Math.abs(snapped.x-8)<2||Math.abs(snapped.x+snapped.width-(mobile?390:1280)+8)<2,'bubble snaps to an edge');assert.ok(snapped.y<300,'vertical dragging remains available');
 await bubble.click();assert.equal(await host.locator('#panel').isVisible(),true);
 await host.locator('#faqToggle').click();assert.equal(await host.locator('#help').isVisible(),true);await host.locator('#faqList summary').first().click();assert.equal(await host.locator('#faqList details').first().getAttribute('open'),'');await host.locator('#back').click();assert.equal(await host.locator('#help').isVisible(),false);
 assert.equal(await host.locator('#operatorLink').getAttribute('href'),'https://example.com/e-services-kouba');assert.equal(await host.locator('#whatsapp').getAttribute('href'),'https://wa.me/000000000000');
 assert.equal(await host.locator('.head .logo').count(),0);assert.equal(await host.locator('.actions #back').count(),0);await page.locator('h1').click();assert.equal(await host.locator('#panel').isVisible(),false,'outside click dismisses');await bubble.click();
 const orbBox=await host.locator('.orb').boundingBox(),tagBox=await host.locator('.tag').boundingBox();assert.ok(tagBox.y<=orbBox.y+orbBox.height,'amount joins the bubble without a gap');
 const panel=await host.locator('#panel').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=(mobile?390:1280));if(mobile)assert.ok(panel.width<=290);
 await mkdir('artifacts/companion-update',{recursive:true});await page.waitForTimeout(300);await page.screenshot({path:`artifacts/companion-update/${mobile?'mobile':'desktop'}.png`});
 if(mobile){await page.setViewportSize({width:390,height:480});await page.waitForTimeout(300);const small=await host.locator('#panel').boundingBox();assert.ok(small.y>=0&&small.y+small.height<=480,'bottom sheet fits a short viewport');assert.equal(await host.locator('#close').isVisible(),true);await page.screenshot({path:'artifacts/companion-update/mobile-short.png'});await page.setViewportSize({width:390,height:844});}
 await host.locator('#close').click();
 await page.evaluate(()=>{document.querySelectorAll('input[type=password]').forEach(el=>el.remove());for(let i=0;i<6;i++){const el=document.createElement('input');el.maxLength=1;el.inputMode='numeric';document.body.append(el);}window.fixtureMessages=[{id:'owned-otp',from:'Temu <notify@temu.com>',subject:'Your verification code is 123456',text:'Your Temu verification code is 123456.\nFull fixture email body.'}];});
 await page.waitForFunction(()=>document.getElementById('temby-companion').hasAttribute('data-otp-unread'));
 assert.equal(await host.locator('.orb .logo').isVisible(),true,'notification preserves the logo');
 assert.equal(await page.locator('body > input').evaluateAll(inputs=>inputs.map(el=>el.value).join('')),'123456');
 await bubble.click();assert.equal(await host.locator('#otpValue').inputValue(),'123456');
 await page.evaluate(()=>{window.fixtureMessages=[{id:'replacement-otp',from:'Temu',subject:'Verification code 654321',text:'Your Temu verification code is 654321'}];});
 await host.locator('#code').click();await page.waitForFunction(()=>[...document.querySelectorAll('body > input')].map(el=>el.value).join('')==='654321');
 await page.evaluate(()=>{window.fixtureMessages=[{id:'owned-otp',from:'Temu',subject:'Verification code 654321',text:'Your Temu verification code is 654321. Full fixture email body.'}];});
 await host.locator('#code').click();await page.waitForFunction(()=>document.getElementById('temby-companion').shadowRoot.getElementById('mail').textContent.includes('Full fixture email body'));
 await host.locator('#viewEmail').click();assert.match(await host.locator('#mail').textContent(),/Full fixture email body/);
 await page.evaluate(()=>{document.querySelectorAll('body > input').forEach(el=>el.remove());const key='temby-setup-v1:https://www.temu.com';localStorage.setItem(key,JSON.stringify({account:{status:1,evidenceAt:Date.now()},address:{source:'customer-confirmation',confirmedAt:Date.now()},updatedAt:Date.now()}));window.dispatchEvent(new StorageEvent('storage',{key}));});
 await page.waitForFunction(()=>!document.getElementById('temby-companion').shadowRoot.getElementById('review').hidden);
 assert.equal(await host.locator('#cartWarning').isVisible(),true,'minimum is shown at final review');
 assert.equal(await host.locator('#primary').isEnabled(),true,'review offers more shopping below minimum');
 assert.deepEqual(errors,[]);await page.close();
}
console.log('Companion browser checks passed on desktop and mobile');
}finally{await browser.close()}

