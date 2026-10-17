import type {IncomingMessage,ServerResponse} from 'node:http';

export function message(res:ServerResponse,status:number,title:string,detail:string){
  res.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'"});
  const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><h1>${escape(title)}</h1><p>${escape(detail)}</p>`);
}
export async function readBody(req:IncomingMessage):Promise<Buffer|undefined>{
  if(['GET','HEAD'].includes(req.method||'GET'))return;
  const parts:Buffer[]=[];let length=0;
  for await(const chunk of req){length+=chunk.length;if(length>1024*1024)throw new Error('BODY_TOO_LARGE');parts.push(Buffer.from(chunk));}
  return Buffer.concat(parts);
}
