import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url);
for(const version of ['v23','v24']){
 const base=new URL(version+'/',root);
 for(const file of ['public/uv-transport.js','public/uv-sw.js','public/uv-diagnostics.js','public/uv-boot.js']){
  const path=new URL(file,base),source=await readFile(path,'utf8');await writeFile(new URL(file+'.timing-backup',base),source);
  let next=source;
  if(file.endsWith('uv-transport.js')){
   next=next.replace('async fetch(url,options={}){','async fetch(url,options={}){ const timingStart=performance.now();');
   next=next.replace('const cookieContext=', 'const timingDecoded=performance.now(); const cookieContext=');
   // v23 has no cookieContext: instrument at the common response creation point.
   next=next.replace('const response=new Response(', 'const timingEnd=performance.now(); (self.__comparisonRequests||=[]).push({destination,relayMs:Math.round((typeof timingDecoded!=="undefined"?timingDecoded:timingEnd)-timingStart),cookieMs:Math.round(timingEnd-(typeof timingDecoded!=="undefined"?timingDecoded:timingEnd)),status:wire.status}); if(self.__comparisonRequests.length>1000)self.__comparisonRequests.shift(); const response=new Response(');
  }
  if(file.endsWith('uv-sw.js'))next+='\nself.addEventListener("message",event=>{if(event.data?.comparisonRead&&event.ports[0])event.ports[0].postMessage(self.__comparisonRequests||[]);});\n';
  if(file.endsWith('uv-boot.js'))next='sessionStorage.setItem("comparisonRound",new URL(location.href).searchParams.get("round")||"0");\n'+next;
  if(file.endsWith('uv-diagnostics.js'))next+=`\nif(self.document){
    const round=sessionStorage.getItem('comparisonRound');let loaded=false;
    const snapshot=event=>{const n=performance.getEntriesByType('navigation')[0];const list=document.querySelector('#home_recommend_list');const out={round,event,page:location.pathname.includes('login.html')?'login':'home',responseMs:n?Math.round(n.responseEnd):null,domMs:n?Math.round(n.domContentLoadedEventEnd):null,loadMs:n&&n.loadEventEnd?Math.round(n.loadEventEnd):null,elapsedMs:Math.round(performance.now()),products:list?list.querySelectorAll('a').length:0,images:[...document.images].filter(i=>i.complete&&i.naturalWidth>0).length,paint:performance.getEntriesByType('paint').map(p=>({name:p.name,ms:Math.round(p.startTime)}))};console.info('COMPARE_PAGE '+JSON.stringify(out));};
    addEventListener('load',()=>{loaded=true;setTimeout(()=>snapshot('load'),0);},{once:true});
    addEventListener('pagehide',()=>snapshot('leave'),{once:true});
    setTimeout(()=>{snapshot('sample');const channel=new MessageChannel();channel.port1.onmessage=e=>{const rows=e.data;console.info('COMPARE_RELAY '+JSON.stringify({round,page:location.pathname.includes('login.html')?'login':'home',rows}));channel.port1.close();};navigator.serviceWorker.controller?.postMessage({comparisonRead:true},[channel.port2]);},10000);
  }\n`;
  await writeFile(path,next);
 }
}
