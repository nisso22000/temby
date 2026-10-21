import { targetAllowed } from './policy.js';

// A native form or unhooked location change can escape the worker's prefix.
// Prefer an encoded same-origin proxy-page referrer. Two confirmed native
// navigation paths also have an explicit fixed merchant mapping, so refreshes
// and noreferrer navigation work without guessing arbitrary local resources.
export function recoverNavigation(path:string,referer:string|undefined,origin:string):string|null {
  if(!path.startsWith('/')||path.startsWith('//'))return null;
  if(/^\/(?:uv(?:\/|$)|_)/.test(path))return null;
  try{
    const source=referer?new URL(referer):null;
    if(source&&source.origin!==origin)return null;
    let base:URL;
    const confirmed=['/search_result.html','/bgn_verification.html'].includes(new URL(path,origin).pathname);
    if(confirmed)base=new URL('https://www.temu.com/');
    else if(source?.pathname.startsWith('/uv-service/'))base=new URL(decodeURIComponent(source.pathname.slice('/uv-service/'.length)));
    else {
      const local=new URL(path,origin);
      if(local.origin!==origin||!['/search_result.html','/bgn_verification.html'].includes(local.pathname))return null;
      base=new URL('https://www.temu.com/');
    }
    if(!targetAllowed(base)&&base.origin!=='https://fixture.temby.invalid')return null;
    const target=new URL(path,base);
    if(!targetAllowed(target)&&target.origin!=='https://fixture.temby.invalid')return null;
    return '/uv-service/'+encodeURIComponent(target.href);
  }catch{return null;}
}
