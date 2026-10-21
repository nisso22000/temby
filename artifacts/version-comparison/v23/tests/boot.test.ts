import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('launcher bounds a stuck worker installation and handles activation races',async()=>{
  const code=await readFile(new URL('../public/uv-boot.js',import.meta.url),'utf8');
  for(const activate of [false,true]){
    const timers:Function[]=[];let changed:Function|undefined,removed=false,destination='';
    const status={textContent:''};const worker={state:'installing',addEventListener(_name:string,listener:Function){changed=listener;},removeEventListener(){removed=true;}};
    const context={URL,encodeURIComponent,decodeURIComponent,document:{querySelector:()=>status},sessionStorage:{getItem:()=>null,setItem(){}},location:{href:'http://localhost:3001/uv/',replace(value:string){destination=value;}},navigator:{serviceWorker:{register:async()=>({installing:worker})}},setTimeout(callback:Function){timers.push(callback);return 1;},clearTimeout(){}};
    const run=vm.runInNewContext(code,context);await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(timers.length,1);
    if(activate){worker.state='activated';changed!();}else timers[0]();
    await run;assert.equal(removed,true);
    if(activate)assert.equal(destination,'/uv-service/'+encodeURIComponent('https://www.temu.com/'));
    else{assert.match(status.textContent,/installation timed out/);assert.equal(destination,'');}
  }
});
