// Read only the merchant's already-received API snapshot, for schema diagnosis.
// No page-price parsing, requests, navigation, account data, or storage writes.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const tabs=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const tab=tabs.find(t=>t.type==='page'&&/^http:\/\/localhost:3001\/uv-service\//.test(t.url));if(!tab)throw Error('No proxy tab');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
let sequence=0;const pending=new Map();
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Debugger timeout'));},8000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
socket.onmessage=e=>{const v=JSON.parse(e.data),p=pending.get(v.id);if(!p)return;clearTimeout(p.timer);pending.delete(v.id);v.error?p.reject(Error(v.error.message)):p.resolve(v.result);};
try{
 const adapter=await readFile(new URL('../public/companion-cart.js',import.meta.url),'utf8');
 const expression=`(()=>{const self={};${adapter}
 const store=globalThis.rawData?.store?.apiStore,packet=store?.cartModifyData,r=packet?.result,c=r?.cartListInfo;
 const keys=o=>o&&typeof o==='object'?Object.keys(o).filter(k=>!/^__uv/.test(k)&&/^[a-zA-Z_$][a-zA-Z0-9_$]{0,60}$/.test(k)).slice(0,80):[];
 if(!c)return {available:false,apiStoreKeys:keys(store)};
 const pick=(o,fields)=>Object.fromEntries(fields.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
 const dto=r.discountInfo?.orderAmountDto;
 const fixture={success:packet.success,...pick(packet,['error_code']),result:{
  ...pick(r,['serverTime']),cartListInfo:{...pick(c,['invalidGoodsLines']),checkoutExtendMap:pick(c.checkoutExtendMap,['ckCartCcy','ckCartLoginStatus']),goodsSkuList:(c.goodsSkuList||[]).map((item,i)=>({isSelected:item.isSelected,baseGoodsInfo:{goodsId:601000000+i},skuInfo:{...pick(item.skuInfo,['amount','skuQuantity','skuPrice']),skuId:175000000+i},...(item.invalidDescVo?{invalidDescVo:pick(item.invalidDescVo,['invalidType'])}:{})}))},
  cartTransferMap:pick(r.cartTransferMap,['currency','orderAmount','lastRequestTime']),discountInfo:{orderAmountDto:pick(dto,['orderAmount','orderAmountOrderCcy','totalGoodsAmount','goodsDiscountAmount','discountAmount'])},checkoutLayerTrackInfo:pick(r.checkoutLayerTrackInfo,['strongThreshold'])}};
 const normalized=self.__tembyCart.responseFacts(packet,Date.now());
 const embedded=[...document.scripts].filter(s=>!s.src&&s.textContent.includes('cartListInfo')).map(s=>{const text=s.textContent,m=/(?:window\\.|self\\.)?rawData\\s*=\\s*/.exec(text);const start=m?m.index+m[0].length:-1;let json=false,hasPacket=false;if(start>=0){try{const parsed=JSON.parse(text.slice(start).trim().replace(/;$/,''));json=true;hasPacket=!!parsed?.store?.apiStore?.cartModifyData?.result?.cartListInfo;}catch{}}return {length:text.length,assignmentFound:!!m,prefix:text.slice(0,Math.min(text.indexOf('{')<0?0:text.indexOf('{'),120)),json,hasPacket};});
 let chunk=globalThis.__CHUNK_DATA__;let chunkParseError=false;
 {const source=[...document.scripts].find(s=>!s.src&&s.textContent.includes('cartListInfo'))?.textContent||'';const marker=/rawData\\s*=\\s*/.exec(source);const begin=marker?marker.index+marker[0].length:source.indexOf('{');let depth=0,quoted=false,escaped=false;for(let i=begin;i>=0&&i<source.length;i++){const ch=source[i];if(quoted){if(escaped)escaped=false;else if(ch.charCodeAt(0)===92)escaped=true;else if(ch.charCodeAt(0)===34)quoted=false;}else if(ch.charCodeAt(0)===34)quoted=true;else if(ch==='{'||ch==='[')depth++;else if(ch==='}'||ch===']'){if(--depth===0){try{chunk=JSON.parse(source.slice(begin,i+1));}catch{chunkParseError=true;}break;}}}}
 const chunkPaths=[];let count=0;const seek=(o,path,depth)=>{if(!o||typeof o!=='object'||depth>7||++count>3000)return;if(o?.apiStore?.cartModifyData)chunkPaths.push({path,keys:keys(o)});for(const k of keys(o)){if(/user|account|token|cookie|password/i.test(k))continue;const d=Object.getOwnPropertyDescriptor(o,k);if(d&&Object.hasOwn(d,'value'))seek(d.value,path+'.'+k,depth+1);}};seek(chunk,'chunk',0);
 const bootstrap=self.__tembyCart.documentFacts?.([...document.scripts].filter(s=>!s.src&&s.textContent.includes('cartListInfo')).map(s=>s.outerHTML).join(''),Date.now());
 return {available:true,embedded,bootstrapAccepted:!!bootstrap,bootstrapCandidates:bootstrap?.carts.map(x=>({minor:x.minor,currency:x.currency,items:x.items.length,time:x.time})),chunkParseError,chunkKeys:keys(chunk),chunkPaths,apiStoreKeys:keys(store),packetKeys:keys(packet),resultKeys:keys(r),discountKeys:keys(r.discountInfo),dtoKeys:keys(dto),fixture,acceptedByCurrentAdapter:!!normalized,candidates:normalized?.carts.map(x=>({minor:x.minor,currency:x.currency,items:x.items.length,time:x.time}))};})()`;
 const value=await send('Runtime.evaluate',{expression,returnByValue:true});
 const result=value.result?.value||{evaluationFailed:true};const out=new URL('../artifacts/mobile-session-investigation/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('mobile-cart-contract.json',out),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{socket.close();}


