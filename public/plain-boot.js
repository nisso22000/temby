(async()=>{
  try{
    const registration=await navigator.serviceWorker.register('/plain-sw.js',{scope:'/plain/'});
    const worker=registration.installing||registration.waiting;
    if(worker&&worker.state!=='activated')await new Promise((resolve,reject)=>worker.addEventListener('statechange',()=>{if(worker.state==='activated')resolve();if(worker.state==='redundant')reject(new Error('Worker startup failed'));}));
    const owned=new URL(location.href).searchParams.has('fixture');
    location.replace('/plain/'+encodeURIComponent(owned?'https://fixture.temby.invalid/':'https://www.temu.com/'));
  }catch{document.querySelector('#status').textContent='Transport diagnostic startup failed';}
})();
