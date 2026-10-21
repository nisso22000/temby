// Opt-in observation only: never log source text, messages, URLs or cookies.
if(self.document&&sessionStorage.getItem('temby-runtime-debug')==='1'){
  const send=fetch.bind(self);
  let count=0;
  const emit=(phase,error)=>{
    if(++count>12)return;
    const name=['Error','TypeError','SyntaxError','ReferenceError','RangeError','URIError','EvalError','DOMException'].includes(error?.name)?error.name:undefined;
    send('/_runtime',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({phase,error:name})}).catch(()=>{});
  };
  addEventListener('error',event=>emit('page-error',event.error));
  addEventListener('unhandledrejection',event=>emit('promise-rejection',event.reason));
  addEventListener('DOMContentLoaded',()=>emit('document-ready'),{once:true});
  addEventListener('pagehide',()=>emit('page-leaving'),{once:true});
  emit('config-loaded');
}
