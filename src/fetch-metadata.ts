import type {Dispatcher} from 'undici';

const modes=new Set(['navigate','same-origin','no-cors','cors','websocket']);
const wrappers=new WeakMap<Dispatcher,Map<string,Dispatcher>>();

// Undici fetch overwrites Sec-Fetch-Mode with its own internal request mode.
// Preserve the mode supplied by the real browser at the final dispatch boundary.
// No browser identity, proof, or missing metadata is manufactured here.
export function browserMetadataDispatcher(base:Dispatcher,mode:string|undefined):Dispatcher{
  if(!mode||!modes.has(mode))return base;
  let cached=wrappers.get(base);if(!cached){cached=new Map();wrappers.set(base,cached);}
  const known=cached.get(mode);if(known)return known;
  const wrapped=base.compose(dispatch=>(options,handler)=>{
    const source=options.headers;
    const entries:Array<[string,unknown]>=Array.isArray(source)
      ?Array.from({length:source.length/2},(_,i)=>[source[i*2],source[i*2+1]])
      :source&&Symbol.iterator in Object(source)?Array.from(source as Iterable<[string,unknown]>):Object.entries(source||{});
    const headers:string[]=[];
    for(const [name,value]of entries){
      if(name.toLowerCase()==='sec-fetch-mode'||value===undefined)continue;
      for(const item of Array.isArray(value)?value:[value])headers.push(name,String(item));
    }
    headers.push('sec-fetch-mode',mode);
    return dispatch({...options,headers},handler);
  });
  cached.set(mode,wrapped);return wrapped;
}
