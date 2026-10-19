(async()=>{
  const status=document.querySelector('#status');
  try{
    const current=new URL(location.href);
    if(current.searchParams.has('debug'))sessionStorage.setItem('temby-runtime-debug','1');
    const recovering=current.pathname.startsWith('/uv-service/');
    if(recovering){
      const last=Number(sessionStorage.getItem('temby-worker-recovery')||0);
      if(Date.now()-last<15000)throw new Error('The browser did not route the page through the installed worker. Allow service workers and site storage for localhost, then reopen http://localhost:3000/.');
      sessionStorage.setItem('temby-worker-recovery',String(Date.now()));
    }
    if(!navigator.serviceWorker)throw new Error('Service workers are unavailable in this browser. Open the link in Chrome or Edge with site storage enabled.');
    const registration=await navigator.serviceWorker.register('/uv/sw.js?v=34',{scope:'/uv-service/',updateViaCache:'none'});
    const worker=registration.installing||registration.waiting;
    if(worker&&worker.state!=='activated')await new Promise((resolve,reject)=>{
      const finish=error=>{clearTimeout(timer);worker.removeEventListener('statechange',changed);error?reject(error):resolve();};
      const changed=()=>{if(worker.state==='activated')finish();else if(worker.state==='redundant')finish(new Error('Worker installation failed'));};
      const timer=setTimeout(()=>finish(new Error('Proxy worker installation timed out. Reload the launcher to try again.')),15000);
      worker.addEventListener('statechange',changed);changed();
    });
    if(recovering){
      const controlled=()=>navigator.serviceWorker.controller?.scriptURL===registration.active?.scriptURL;
      if(!controlled())await new Promise((resolve,reject)=>{
        const changed=()=>{if(controlled()){clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();}};
        const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',changed);reject(new Error('The browser did not activate the proxy worker. Reopen the launcher with site storage enabled.'));},15000);
        navigator.serviceWorker.addEventListener('controllerchange',changed);changed();
      });
      location.reload();return;
    }
    const target=current.searchParams.has('fixture')?'https://fixture.temby.invalid/':'https://www.temu.com/';
    location.replace('/uv-service/'+encodeURIComponent(target));
  }catch(error){status.textContent='Proxy startup failed: '+String(error.message||'Unknown browser error');}
})();
