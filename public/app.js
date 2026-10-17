const $=id=>document.getElementById(id);
async function refresh(){
  try{
    const r=await fetch('/api/state',{cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!r.ok)throw new Error();
    const state=await r.json(),c=state.cart;
    $('events').textContent=JSON.stringify(state.events,null,2);
    $('preview-mode').textContent='Temu session — only verified cart fields appear here.';
    $('currency').textContent=c.currency??'Unavailable';
    $('total').textContent=c.complete&&c.total!==null?c.total+' '+c.currency:'Unavailable (not checkout-confirmed)';
    $('count').textContent=c.source==='unavailable'?'Unknown':String(c.items.length);
    $('complete').textContent=c.complete?'Complete':'Unavailable';
    $('missing').textContent=c.missing.join(', ');
    $('json').textContent=JSON.stringify(c,null,2);
  }catch{$('events').textContent='Local evidence unavailable';$('total').textContent='Unavailable';}
}
$('open').onclick=()=>location.assign('__MERCHANT_ORIGIN__/engine/');
$('engine-fixture').onclick=()=>location.assign('__MERCHANT_ORIGIN__/engine/?fixture');
$('pay').hidden=false;
$('pay').onclick=async()=>{await refresh();$('preview').showModal();};
void refresh();
if(new URL(location.href).searchParams.has('preview'))$('pay').click();
