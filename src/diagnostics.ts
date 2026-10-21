// Metadata only: never retain query values, response text, credentials or
// arbitrary path segments. API names are useful when an HTTP 200 contains a
// merchant application error rather than a network failure.
export function responseMetadata(url:URL,type:string,body:Buffer){
  const route=url.pathname.startsWith('/api/')?url.pathname.split('/').map(part=>/^[a-z_-]{1,40}$/i.test(part)?part:part?'[value]':'').join('/'):undefined;
  let errorCode:number|undefined,applicationFailed:boolean|undefined;
  let cartObservation:string|undefined;
  if(type.includes('json')&&body.length<2*1024*1024){
    try{
      const value=JSON.parse(body.toString());
      const code=value?.error_code??value?.errorCode;
      if(Number.isSafeInteger(code)&&code!==0)errorCode=code;
      // Nonzero numeric fields can also accompany successful merchant
      // responses. Only an explicit failure flag establishes an app failure.
      if(value?.success===false)applicationFailed=true;
      if(/\/cart_modify(?:_page)?(?:\/|$)/.test(url.pathname))cartObservation=value?.success===false?'merchant-failure':value?.success===true&&(value?.result?.cartListInfo||value?.result?.cart_list_info)?'schema-present':'unsupported-schema';
    }catch{}
  }
  return {route,errorCode,applicationFailed,...cartObservation?{cartObservation}:{}};
}
