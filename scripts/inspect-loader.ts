import {upstream,boundedBody,dispatcher} from '../src/transport.js';
import {parse} from 'parse5';
try {
 const r=await upstream(new URL('https://www.temu.com/'),'GET',{'user-agent':'Temby-Local-Proxy/0.3','accept':'text/html'});
 const html=(await boundedBody(r)).toString(); const tree:any=parse(html);
 const out:any[]=[];
 function walk(n:any){if(n.tagName==='script'){const src=n.attrs.find((a:any)=>a.name==='src')?.value;const code=(n.childNodes||[]).map((c:any)=>c.value||'').join('');out.push({kind:src?'external':'inline',source:src?new URL(src,'https://www.temu.com').origin+new URL(src,'https://www.temu.com').pathname:undefined,chars:code.length,uses:{cookie:code.includes('cookie'),reload:code.includes('reload'),replace:code.includes('replace'),assign:code.includes('assign'),location:code.includes('location'),eval:code.includes('eval'),atob:code.includes('atob')}});}for(const c of n.childNodes||[])walk(c);}
 walk(tree); console.log(JSON.stringify({status:r.status,scripts:out,setCookieFlags:r.headers.getSetCookie().map(x=>({httpOnly:/;\s*httponly/i.test(x),secure:/;\s*secure/i.test(x),domainAttribute:/;\s*domain=/i.test(x)}))},null,2));
}finally{await dispatcher.close();}
