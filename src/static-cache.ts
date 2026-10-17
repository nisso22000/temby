// Only explicitly public, fresh CDN resources may be reused across requests.
// Never cache account/API responses, cookies, errors, ranges or varying content.
export class StaticCache {
  private entries=new Map<string,{until:number;storedAt:number;headers:Record<string,string|string[]>;body:Buffer}>();
  private bytes=0;
  constructor(private limit=32*1024*1024,private now=Date.now){}
  key(url:URL,method:string,destination:string,headers:Record<string,string>){
    if(method!=='GET'||!['image','style','script','font'].includes(destination)||!(url.hostname==='kwcdn.com'||url.hostname.endsWith('.kwcdn.com'))||Object.keys(headers).some(k=>/^(authorization|range)$/i.test(k)))return null;
    if(Object.entries(headers).some(([k,v])=>/^cache-control$/i.test(k)&&/no-cache|no-store|max-age=0/i.test(v)))return null;
    return JSON.stringify([url.href,headers.accept||'',headers['accept-language']||'']);
  }
  get(key:string|null){
    if(!key)return null;const entry=this.entries.get(key);if(!entry)return null;
    if(entry.until<=this.now()){this.entries.delete(key);this.bytes-=entry.body.length;return null;}
    this.entries.delete(key);this.entries.set(key,entry);
    return {...entry,headers:{...entry.headers,age:String(Number(entry.headers.age||0)+Math.floor((this.now()-entry.storedAt)/1000))}};
  }
  put(key:string|null,status:number,headers:Record<string,string|string[]>,body:Buffer){
    const control=String(headers['cache-control']||'');
    const seconds=Number(/(?:^|,)\s*max-age\s*=\s*"?(\d+)/i.exec(control)?.[1]||0);
    const date=Date.parse(String(headers.date||''));
    const age=Math.max(Number(headers.age||0),Number.isFinite(date)?Math.max(0,Math.floor((this.now()-date)/1000)):0);
    if(!key||status!==200||!/(?:^|,)\s*public\s*(?:,|$)/i.test(control)||/no-cache|no-store|private/i.test(control)||headers.vary||headers['set-cookie']?.length||!Number.isFinite(age)||age<0||seconds<=age||body.length>this.limit||!body.length)return;
    if(!/^(image\/|font\/|text\/css|(?:application|text)\/(?:javascript|x-javascript|woff))/i.test(String(headers['content-type']||'')))return;
    const previous=this.entries.get(key);if(previous){this.bytes-=previous.body.length;this.entries.delete(key);}
    while((this.bytes+body.length>this.limit||this.entries.size>=256)&&this.entries.size){const oldest=this.entries.keys().next().value!;this.bytes-=this.entries.get(oldest)!.body.length;this.entries.delete(oldest);}
    this.entries.set(key,{until:this.now()+Math.min(seconds-age,3600)*1000,storedAt:this.now(),headers:{...headers,age:String(age)},body});this.bytes+=body.length;
  }
}
