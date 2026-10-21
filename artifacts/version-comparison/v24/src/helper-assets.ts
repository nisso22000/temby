import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Cache our own immutable-in-flight helper bytes, never merchant documents.
// File signatures invalidate the entry when a local helper is edited.
const entries=new Map<string,{signature:string;value:Promise<{data:Buffer;etag:string}>}>();
export async function helperAsset(files:URL[]){
  const key=files.map(file=>file.href).join('\n');
  const stats=await Promise.all(files.map(file=>stat(file,{bigint:true})));
  const signature=stats.map(value=>`${value.mtimeNs}:${value.size}`).join(',');
  const current=entries.get(key);if(current?.signature===signature)return current.value;
  const value=Promise.all(files.map(file=>readFile(file))).then(parts=>{
    const data=parts.length===1?parts[0]:Buffer.concat(parts.flatMap((part,index)=>index?[Buffer.from('\n'),part]:[part]));
    return {data,etag:'"'+createHash('sha256').update(data).digest('hex')+'"'};
  });
  if(entries.size>=32&&!entries.has(key))entries.delete(entries.keys().next().value!);
  entries.set(key,{signature,value});
  try{return await value;}catch(error){if(entries.get(key)?.value===value)entries.delete(key);throw error;}
}
