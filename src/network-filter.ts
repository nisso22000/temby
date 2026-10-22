// Four explicit optional rules. No list parser, downloads, or cosmetic filtering.
export type FilterMode='off'|'balanced';
export class NetworkFilter {
  constructor(readonly mode:FilterMode='off'){
    if(!['off','balanced'].includes(mode))throw Error('Unsupported filter mode');
  }
  blocked(url:URL,destination:string,_sourceUrl?:string){
    if(this.mode==='off'||['document','iframe'].includes(destination)||url.protocol!=='https:')return false;
    return /(^|\.)(?:pftk|thtk)\.temu\.com$/.test(url.hostname)||
      /(^|\.)temu\.com$/.test(url.hostname)&&url.pathname.startsWith('/api/adx/')||
      url.hostname==='adtk-eu.temu.com'&&url.pathname==='/c/ad';
  }
}
