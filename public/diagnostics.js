Promise.all(['/api/state','/api/health','/api/metrics'].map(async path=>{const response=await fetch(path);if(!response.ok)throw Error('Diagnostics unavailable');return response.json();})).then(([state,health,metrics])=>{
  document.getElementById('events').textContent=JSON.stringify({health:health.failures,counts:metrics.counts,apiTimeline:state.apiEvents||[],recentEvents:state.events},null,2);
}).catch(()=>{document.getElementById('events').textContent='Local diagnostics unavailable';});
