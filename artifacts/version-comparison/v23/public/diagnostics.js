fetch('/api/state').then(response=>response.json()).then(state=>{
  document.getElementById('events').textContent=JSON.stringify(state.events,null,2);
}).catch(()=>{document.getElementById('events').textContent='Local diagnostics unavailable';});
