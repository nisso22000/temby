(async()=>{
  const status=document.querySelector('#engine-status');
  try{
    const registration=await navigator.serviceWorker.register('/engine/sw.js?v=23',{scope:'/'});
    const worker=registration.installing||registration.waiting;
    if(worker&&worker.state!=='activated')await new Promise((resolve,reject)=>worker.addEventListener('statechange',()=>{if(worker.state==='activated')resolve();else if(worker.state==='redundant')reject(new Error('Installation failed'));}));
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    status.textContent='Proxy ready. Opening the page…';
    const fixture=new URL(location.href).searchParams.has('fixture');
    location.replace('/service/'+encodeURIComponent(fixture?'https://fixture.temby.invalid/':'https://www.temu.com/'));
  }catch(error){status.textContent='Local proxy startup failed: '+String(error.message).replace(/https?:\/\/\S+/g,'[local URL]');}
})();


