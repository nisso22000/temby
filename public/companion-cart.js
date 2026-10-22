// Only normalized cart facts leave this adapter. Merchant tokens are discarded.
(() => {
  const minimumByCurrency={USD:2000,EUR:2000};
  const cents=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
  const text=(v,max=400)=>typeof v==='string'?v.slice(0,max):'';
  function decode(v){if(typeof v==='string'&&v.length<1000000&&/^[\s]*[\[{]/.test(v)){try{return JSON.parse(v);}catch{}}return v;}
  function stamp(v){const m=/^(\d{13})(?:-|$)/.exec(String(v||''));return m?Number(m[1]):0;}
  const keyCurrency=value=>/(?:^|-)(USD|EUR)(?:-|$)/.exec(String(value||''))?.[1]||null;
  function trace(page,phase,details={}){
    const safe={phase};
    if(typeof details.route==='string'&&(details.route==='/shopping_cart.html'||/^\/api\/[a-z_\/-]{1,160}$/i.test(details.route)))safe.route=details.route;
    for(const key of ['source','reason','method','transport','status','requestStartedAt','observedAt','durationMs','time','merchantRequestTime','serverTime','totalMinor','currency','items','selectedUnits','invalidLines','selectedInvalid','unselectedInvalid','records','candidates','ageMs']){
      const value=details[key];if(typeof value==='string')safe[key]=value.slice(0,80);else if(typeof value==='number'&&Number.isFinite(value))safe[key]=value;else if(value===null)safe[key]=null;
    }
    page.console?.info?.('[TEMBY cart]',safe);return safe;
  }
  const excluded=k=>/^__uv|token|password|cookie|sideBarCachedResponse|wishSkuList/i.test(k);
  // Read data descriptors only: UV adds accessors that are not merchant data.
  function clean(value,depth=0,budget={nodes:0}){
    if(!value||typeof value!=='object')return value;
    if(depth>12||++budget.nodes>10000)return null;
    const out=Array.isArray(value)?[]:Object.create(null);
    for(const key of Object.keys(value)){
      if(excluded(key)||key==='__proto__')continue;
      const d=Object.getOwnPropertyDescriptor(value,key);
      if(d&&Object.hasOwn(d,'value'))out[key]=clean(d.value,depth+1,budget);
    }
    return out;
  }
  const minorValue=v=>typeof v==='string'&&/^\d{1,9}$/.test(v)?Number(v):v;
  function finances(objects,currency){
    const values=keys=>[...new Set(objects.flatMap(o=>keys.filter(k=>o[k]!==undefined).map(k=>minorValue(o[k]))))];
    const one=keys=>{const list=values(keys);return list.length===1&&cents(list[0])?list[0]:null;};
    const minor=one(['orderAmount']);
    const net=values(['orderAmount']).length?minor:(currency==='USD'?one(['orderAmountUsd']):null);
    if(net===null)return null;
    const gross=one(currency==='USD'?['totalGoodsAmount','totalGoodsAmountUsd']:['totalGoodsAmount']);
    const goods=one(['goodsDiscountAmount']);
    const promo=one(currency==='USD'?['discountAmount','discountAmountUsd']:['discountAmount']);
    // totalSaveAmount/marketPrice may include list-price savings, not reductions
    // from the current gross amount. Never add those to the payable discount.
    const discount=goods!==null||promo!==null?(goods??0)+(promo??0):null;
    const before=gross;
    const reconciled=before!==null&&before>=net&&(discount===null||before-discount===net);
    return {minor:net,beforeMinor:reconciled?before:null,discountMinor:reconciled?before-net:null};
  }
  function normalize(record,key){
    // Project the supported envelope before the bounded deep copy. Unrelated
    // rich product/UI metadata must not consume the budget before totals.
    let ambiguous=false;
    const own=(o,k)=>{
      if(!o||typeof o!=='object')return undefined;
      const alias=k.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),value=Object.getOwnPropertyDescriptor(o,k)?.value,wire=Object.getOwnPropertyDescriptor(o,alias)?.value;
      if(alias!==k&&value!==undefined&&wire!==undefined&&value!==wire)ambiguous=true;
      return value??wire;
    };
    const pick=(o,keys)=>Object.fromEntries(keys.map(k=>[k,own(o,k)]));
    const envelope=own(record,'d'),result=own(envelope,'result'),cart=own(result,'cartListInfo');
    if(cart){
      const goods=own(cart,'goodsSkuList');
      record={k:own(record,'k'),d:{success:own(envelope,'success'),result:{
        serverTime:own(result,'serverTime'),
        cartListInfo:{...pick(cart,['invalidGoodsLines']),checkoutExtendMap:pick(own(cart,'checkoutExtendMap'),['ckCartCcy','ckCartLoginStatus']),
          goodsSkuList:Array.isArray(goods)&&goods.length<=1000?goods.map(item=>({isSelected:own(item,'isSelected'),
            baseGoodsInfo:pick(own(item,'baseGoodsInfo'),['goodsId','goodsName','thumbUrl']),
            skuInfo:pick(own(item,'skuInfo'),['skuId','amount','skuPrice','cartSkuImage','skuSpec']),
            invalidDescVo:pick(own(item,'invalidDescVo'),['invalidType'])})):goods},
        cartTransferMap:pick(own(result,'cartTransferMap'),['currency','orderAmount','lastRequestTime']),
        discountInfo:{orderAmountDto:pick(own(own(result,'discountInfo'),'orderAmountDto'),['orderAmount','orderAmountOrderCcy','totalGoodsAmount','goodsDiscountAmount','discountAmount'])},
        checkoutLayerTrackInfo:pick(own(result,'checkoutLayerTrackInfo'),['strongThreshold'])
      }}};
    }
    if(ambiguous)return [];
    record=clean(record);
    const found=[];let visited=0;
    function walk(value,time,depth,inheritedCurrency){
      value=decode(value);if(!value||typeof value!=='object'||depth>7||++visited>2500)return;
      time=stamp(value.k)||time;
      const ownCcy=value.ckCartCcy||value.currency;
      const contextCurrency=typeof ownCcy==='string'&&/^(USD|EUR)$/.test(ownCcy)?ownCcy:keyCurrency(value.k)||inheritedCurrency;
      // The real sc_cache envelope keeps cart, currency and totals in siblings.
      // Parse it once; recursively mining its USD conversion creates false quotes.
      if(value.d?.result?.cartListInfo){
        const envelope=value.d,result=envelope.result,cart=result.cartListInfo;
        if(envelope.success!==true)return;
        const dto=result.discountInfo?.orderAmountDto,transfer=result.cartTransferMap;
        const currencies=[cart.checkoutExtendMap?.ckCartCcy,transfer?.currency,contextCurrency].filter(v=>v!==undefined&&v!==null);
        if(!dto||!currencies.length||new Set(currencies).size!==1||!['EUR','USD'].includes(currencies[0]))return;
        const currency=currencies[0],net=minorValue(dto.orderAmount);
        const merchantRequestTime=stamp(transfer?.lastRequestTime);
        const observedAt=time;time=merchantRequestTime||time;
        const nets=[net,dto.orderAmountOrderCcy,transfer?.orderAmount].filter(v=>v!==undefined).map(minorValue);
        if(!cents(net)||nets.some(v=>!cents(v)||v!==net))return;
        const list=cart.goodsSkuList;
        if(!Array.isArray(list)||list.length>1000)return;
        const mapped=list.map(item=>{
          const base=item.baseGoodsInfo||{},sku=item.skuInfo||{};
          return {goodsId:base.goodsId,skuId:sku.skuId,goodsName:base.goodsName,
            quantity:sku.amount,salePrice:sku.skuPrice,isSelected:item.isSelected,
            unavailableReason:typeof item.invalidDescVo?.invalidType==='string'&&/^[A-Z_]{1,60}$/.test(item.invalidDescVo.invalidType)?item.invalidDescVo.invalidType:sku.amount===0?'UNAVAILABLE':'',
            thumbUrl:sku.cartSkuImage?.thumbUrl||base.thumbUrl,skuSpecVo:sku.skuSpec};
        });
        // Reuse strict item checks; incomplete items must not erase a valid total.
        const common={currency,orderAmount:net,totalGoodsAmount:minorValue(dto.totalGoodsAmount),
          goodsDiscountAmount:minorValue(dto.goodsDiscountAmount),discountAmount:minorValue(dto.discountAmount),
          ckCartLoginStatus:cart.checkoutExtendMap?.ckCartLoginStatus,invalidGoodsLines:cart.invalidGoodsLines,
          strongThreshold:result.checkoutLayerTrackInfo?.strongThreshold};
        const detailed=normalize({k:String(time),v:{...common,goodsSkuList:mapped}});
        const parsed=detailed.length?detailed:normalize({k:String(time),v:common});
        found.push(...parsed.map(cart=>({...cart,canonical:true,detailsComplete:detailed.length>0,observedAt,merchantRequestTime:merchantRequestTime||null,serverTime:Number.isSafeInteger(result.serverTime)?result.serverTime:null,emptyConfirmed:list.length===0&&net===0})));return;
      }
      if(!Array.isArray(value)&&(Array.isArray(value.goodsSkuList)||Array.isArray(value.displayList)||Object.hasOwn(value,'orderAmount')||Object.hasOwn(value,'orderAmountUsd'))){
        const objects=[];
        const gather=(o,d)=>{o=decode(o);if(!o||typeof o!=='object'||Array.isArray(o)||d>3)return;objects.push(o);for(const [k,v]of Object.entries(o))if(!/token|password|cookie|goodsSkuList|displayList|wishSkuList/i.test(k))gather(v,d+1);};
        gather(value,0);
        const unique=(keys)=>[...new Set(objects.flatMap(o=>keys.filter(k=>o[k]!==undefined).map(k=>o[k])))];
        const currencies=unique(['ckCartCcy','currency']).filter(v=>typeof v==='string'&&/^[A-Z]{3}$/.test(v));
        const currency=currencies.length===1?currencies[0]:currencies.length===0?contextCurrency:null;
        const financial=finances(objects,currency);
        const minor=financial?.minor??null;
        const grouped=value.displayList?.flatMap(g=>Array.isArray(g.goodsList)?g.goodsList:[])||[];
        const list=value.goodsSkuList||grouped;
        if(currency&&['USD','EUR'].includes(currency)&&minor!==null&&list.length<=1000){
          let valid=true;const ids=new Set();
          const items=list.map(item=>{
            const id=String(item.skuId||'');const goodsId=String(item.goodsId||'');
            if(!/^\d{1,30}$/.test(id)||!/^\d{1,30}$/.test(goodsId)||ids.has(id))valid=false;
            ids.add(id);
            const flags=['selected','isSelected','checked','isChecked'].filter(k=>item[k]!==undefined).map(k=>item[k]);
            const selection=flags.length&&flags.every(v=>[true,false,0,1,'0','1'].includes(v))&&new Set(flags.map(v=>v===true||v===1||v==='1')).size===1?(flags[0]===true||flags[0]===1||flags[0]==='1'):null;
            if(!Number.isSafeInteger(item.quantity)||item.quantity<0||item.quantity>1000||item.quantity===0&&selection!==false)valid=false;
            let image='';try{const u=new URL(item.thumbUrl||item.hdUrl);if(u.protocol==='https:'&&/(^|\.)kwcdn\.com$/.test(u.hostname))image=u.href;}catch{}
            const specs=Array.isArray(item.skuSpecVo)?item.skuSpecVo.map(s=>[text(s.specKey,60),text(s.specValue,100)].filter(Boolean).join(': ')).filter(Boolean).join(' \u00b7 '):'';
            return {id,goodsId,name:text(item.goodsName),quantity:item.quantity,unitMinor:cents(item.salePrice)?item.salePrice:null,selection,specs,image,unavailableReason:text(item.unavailableReason,60)};
          });
          if(value.goodsSkuList&&grouped.length){const a=list.map(i=>String(i.skuId)).sort().join(','),b=grouped.map(i=>String(i.skuId)).sort().join(',');if(a!==b)valid=false;}
          if(valid){
            const login=unique(['ckCartLoginStatus']);
            const invalid=unique(['invalidGoodsLines']);
            const thresholds=[...new Set(unique(['strongThreshold']).map(minorValue))];
            found.push({currency,...financial,items,time,login:login.length===1&&['0','1',0,1].includes(login[0])?Number(login[0]):null,invalid:invalid.length===1&&Number.isSafeInteger(invalid[0])?invalid[0]:null,minimum:thresholds.length===1&&cents(thresholds[0])?thresholds[0]:null});
          }
        }
      }
      for(const [k,v]of Object.entries(value))if(!/token|password|cookie|wishSkuList/i.test(k))walk(v,time,depth+1,contextCurrency);
    }
    walk(record,stamp(key),0,keyCurrency(key));
    return found;
  }
  function select(candidates,now=Date.now(),options={}){
    // Only complete, successful cart envelopes qualify. Cache-key timestamps
    // and recorded request starts order observations; neither is a server revision.
    const fresh=candidates.filter(c=>c.canonical===true&&c.time>0&&c.time>=(options.minTime||0)&&now-c.time>=-10000&&now-c.time<1800000);
    if(!fresh.length)return null;
    fresh.sort((a,b)=>b.time-a.time);const newest=fresh[0].time;
    const atTime=fresh.filter(c=>c.time===newest);
    if(new Set(atTime.map(c=>JSON.stringify([c.currency,c.minor,c.minimum,c.invalid,c.emptyConfirmed]))).size!==1)return null;
    const detailed=atTime.filter(c=>c.items.length);
    if(new Set(detailed.map(c=>JSON.stringify(c.items))).size>1)return null;
    const c=detailed.find(c=>c.live)||detailed[0]||atTime.find(c=>c.live)||atTime[0];
    const known=c.items.every(i=>i.selection!==null);
    const selected=known?c.items.filter(i=>i.selection):c.items;
    const units=selected.reduce((n,i)=>n+i.quantity,0);
    const selectionKnown=c.items.length>0&&known;
    const selectedProblems=c.items.filter(i=>i.unavailableReason&&i.selection!==false).length;
    const unselectedInvalid=c.items.filter(i=>i.unavailableReason&&i.selection===false).length;
    const selectedInvalid=selectedProblems+Math.max(0,(c.invalid??0)-selectedProblems-unselectedInvalid);
    const merchantMinimum=c.minimum;
    return {...c,merchantMinimum,selectedInvalid,unselectedInvalid,minimum:Math.max(minimumByCurrency[c.currency],merchantMinimum??0),items:selectionKnown?c.items:[],quantity:c.emptyConfirmed?0:selectionKnown?units:null,selectionKnown,source:c.live?'response':'scdb'};
  }
  function authFacts(record,key){
    record=clean(record);
    const facts=[];let nodes=0;
    const walk=(value,time,depth)=>{
      value=decode(value);if(!value||typeof value!=='object'||depth>7||++nodes>2500)return;
      if(value.success===false||value.d?.success===false)return;
      time=stamp(value.k)||time;
      if(['0','1',0,1].includes(value.ckCartLoginStatus)&&time)facts.push({status:Number(value.ckCartLoginStatus),time});
      for(const [k,v]of Object.entries(value))if(!/token|password|cookie/i.test(k))walk(v,time,depth+1);
    };
    walk(record,stamp(key),0);return facts;
  }
  function accountStatus(facts,now=Date.now()){
    const fresh=facts.filter(f=>now-f.time>=-10000&&now-f.time<1800000).sort((a,b)=>b.time-a.time);
    if(!fresh.length)return null;
    const latest=fresh.filter(f=>f.time===fresh[0].time);
    return new Set(latest.map(f=>f.status)).size===1?latest[0]:null;
  }
  function observe(page,changed,diagnostic,access){
    const factory=page.indexedDB;const open=access?.open||factory?.open?.bind(factory);
    if(!open)return ()=>{};
    let stopped=false,busy=false,entries=[],facts=[],dbName='',revision=0,lastTrace='';
    const meta={available:false,stores:[],records:0,candidates:0,scoped:false,shapes:[]};
    const emit=()=>{if(stopped)return;meta.candidates=entries.length;const key=JSON.stringify([meta.available,meta.records,entries.map(c=>[c.time,c.minor,c.items.length,c.invalid])]);if(key!==lastTrace){lastTrace=key;trace(page,'database',{source:'scdb',records:meta.records,candidates:entries.length,reason:entries.length?'supported-cart':meta.available?'no-supported-cart':'database-absent'});}diagnostic?.({...meta});changed(entries.slice(),facts.slice());};
    async function scan(){
      if(busy||stopped)return;busy=true;const generation=++revision;
      try{
        const scoped=(page.__uv?.meta?.url?.origin||'https://www.temu.com')+'@scdb';
        // Known-name opens are bounded. Enumeration can hang on mobile storage;
        // it is unnecessary and must not prevent all later scans.
        const names=[scoped,'scdb'];
        let db=null;
        for(const name of names){
          try{
            db=await new Promise((resolve,reject)=>{
              let settled=false,timer;
              const finish=(error,value)=>{if(settled){value?.close();return;}settled=true;if(timer)page.clearTimeout(timer);error?reject(error):resolve(value);};
              const req=open(name);
              // Opening an absent DB triggers an upgrade; abort rather than
              // creating merchant storage. Late successful opens are closed.
              req.onupgradeneeded=()=>{req.transaction.abort();};
              req.onsuccess=()=>finish(null,req.result);req.onerror=()=>finish(Error('Cart cache unavailable'));req.onblocked=()=>finish(Error('Cart cache busy'));
              if(page.setTimeout)timer=page.setTimeout(()=>finish(Error('Cart cache timed out')),1500);
            });
            dbName=name;break;
          }catch{}
        }
        if(!db){entries=[];facts=[];meta.available=false;emit();return;}
        db.onversionchange=()=>db.close();
        const batch=[],auth=[];let records=0;
        try{
          meta.available=true;meta.scoped=dbName===scoped;meta.stores=Array.from(db.objectStoreNames);meta.shapes=[];
          for(const store of meta.stores.includes('entries')?['entries']:meta.stores){
            if(records>=800)break;
            await new Promise((resolve,reject)=>{
              const tx=db.transaction(store,'readonly');const request=tx.objectStore(store).openCursor(null,'prev');
              let settled=false,timer;
              const finish=error=>{if(settled)return;settled=true;if(timer)page.clearTimeout(timer);error?reject(error):resolve();};
              request.onsuccess=()=>{const cursor=request.result;if(!cursor||records>=800)return;records++;if(meta.shapes.length<3)meta.shapes.push({store,keys:cursor.value&&typeof cursor.value==='object'?Object.keys(cursor.value).slice(0,20):[],type:typeof cursor.value});batch.push(...normalize(cursor.value,cursor.key));auth.push(...authFacts(cursor.value,cursor.key));cursor.continue();};
              tx.oncomplete=()=>finish();tx.onerror=()=>finish(Error('Cart cache read failed'));tx.onabort=tx.onerror;
              if(page.setTimeout)timer=page.setTimeout(()=>{try{tx.abort();}catch{}finish(Error('Cart cache read timed out'));},2000);
            });
          }
        }finally{db.close();}
        meta.records=records;
        if(!stopped&&generation===revision){entries=batch.sort((a,b)=>b.time-a.time).slice(0,12);facts=auth.sort((a,b)=>b.time-a.time).slice(0,12);emit();}
      }catch{entries=[];facts=[];trace(page,'database',{source:'scdb',reason:'read-unavailable'});diagnostic?.({...meta,error:'unavailable'});if(!stopped)changed([],[]);}finally{busy=false;}
    }
    void scan();
    const focus=()=>{void scan();};page.addEventListener('focus',focus);
    const visibility=()=>{if(!page.document.hidden)void scan();};
    page.document.addEventListener?.('visibilitychange',visibility);
    const stop=()=>{stopped=true;revision++;page.removeEventListener('focus',focus);page.document.removeEventListener?.('visibilitychange',visibility);};
    stop.refresh=()=>{void scan();};return stop;
  }
  const snapshotURL=value=>{try{return /\/cart_modify(?:_page)?(?:\/|$)/.test(new URL(value).pathname);}catch{return false;}};
  // Mobile requests can carry the storefront locale, e.g. /dz/api/… .
  // Normalize only that leading locale; keep the merchant/origin checks intact.
  const apiPath=value=>new URL(value).pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\/(?=api\/)/i,'/');
  const responseURL=value=>{try{const url=new URL(value),path=apiPath(value);return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&/(^|\.)temu\.com$/.test(url.hostname)&&path.startsWith('/api/')&&(/\/cart_modify(?:\/|$)/.test(path)||/\/uranus_cart\/[a-z_-]+(?:\/|$)/i.test(path));}catch{return false;}};
  // These mobile SDK endpoints change the cart without cart_modify_type.
  // Counts and tracking endpoints deliberately do not trigger a full read.
  const mutationURL=value=>responseURL(value)&&/^\/api\/bg\/bg-uranus-api\/uranus_cart\/(?:single\/operate_cart|batch\/add_cart|remove_and_add)\/?$/.test(apiPath(value));
  const countURL=value=>responseURL(value)&&/\/uranus_cart\/user_cart_num\/?$/.test(new URL(value).pathname);
  function countFacts(value){
    if(value?.success!==true||!value.result||typeof value.result!=='object')return null;
    const result=value.result,map=result.cart_sku_num_map??result.cartSkuNumMap;
    const details=result.cart_sku_detail_info_map??result.cartSkuDetailInfoMap;
    const selected=details?.cart_selected_sku_list??details?.cartSelectedSkuList;
    if(!map||Array.isArray(map)||typeof map!=='object'||!Array.isArray(selected)||selected.length>1000)return null;
    const keys=Object.keys(map);if(keys.length>1000)return null;
    const quantities=new Map();
    for(const id of keys){const count=map[id];if(!/^\d{1,30}$/.test(id)||!Number.isSafeInteger(count)||count<0||count>1000)return null;quantities.set(id,count);}
    const seen=new Set(),lines=[];
    for(const raw of selected){const id=String(raw);if(!/^\d{1,30}$/.test(id)||seen.has(id)||!quantities.has(id)||!quantities.get(id))return null;seen.add(id);lines.push([id,quantities.get(id)]);}
    lines.sort(([a],[b])=>a.localeCompare(b));
    return {lines};
  }
  function countMatches(cart,count){
    if(!cart?.selectionKnown||!Array.isArray(cart.items)||!count)return null;
    const lines=cart.items.filter(item=>item.selection&&item.quantity>0).map(item=>[item.id,item.quantity]);
    lines.sort(([a],[b])=>String(a).localeCompare(String(b)));
    return JSON.stringify(lines)===JSON.stringify(count.lines);
  }
  function mutationAcknowledged(url,value,operation){
    if(value?.success!==true)return false;
    const result=value.result;
    const operationInfo=result?.cartOperateInfo??result?.cart_operate_info;
    if(operationInfo?.success===false)return false;
    if(mutationURL(url))return true;
    if(!responseURL(url))return false;
    if(Number.isSafeInteger(operation)&&snapshotURL(url))return operation!==1;
    const path=apiPath(url);
    return operationInfo?.success===true&&path.startsWith('/api/bg/bg-uranus-api/uranus_cart/')
      &&!/\/(?:cart_modify_page|user_cart_num|tracking_data)\/?$/.test(path);
  }
  function responseFacts(value,time=Date.now()){
    if(!value||value.success!==true||!(value.result?.cartListInfo||value.result?.cart_list_info))return null;
    const record={k:String(time),d:value};
    // Live replies are ordered by the request we observed locally. Merchant
    // timestamps are useful diagnostics, but may lag a later cart edit.
    const carts=normalize(record).filter(c=>c.canonical).map(c=>({...c,time,observedAt:time,live:true}));
    return carts.length?{carts,facts:[...authFacts(record),...carts.filter(c=>c.login!==null).map(c=>({status:c.login,time:c.time}))]}:null;
  }
  self.__tembyCart={normalize,select,observe,authFacts,accountStatus,finances,responseURL,snapshotURL,mutationURL,countURL,countFacts,countMatches,mutationAcknowledged,responseFacts,trace};
})();

// A browser-local copy of validated cart facts, separate from merchant scdb.
// One record per merchant origin. Account scope is a digest, never credentials.
(()=>{
  function create(factory){
    const memory=new Map();let connection=null,queue=Promise.resolve();
    const database=()=>connection||=(async()=>{
      if(!factory)return null;
      return new Promise(resolve=>{
        let finished=false,request;try{request=factory.open('temby-cart-state',1);}catch{resolve(null);return;}const timer=setTimeout(()=>{finished=true;connection=null;resolve(null);},1500);
        request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('snapshots'))request.result.createObjectStore('snapshots');};
        request.onsuccess=()=>{clearTimeout(timer);const db=request.result;if(finished){db.close();return;}db.onversionchange=()=>{db.close();connection=null;};resolve(db);};
        request.onerror=request.onblocked=()=>{clearTimeout(timer);connection=null;resolve(null);};
      });
    })();
    const operation=async(origin,change)=>{
      const db=await database();let entry=memory.get(origin)||null;
      if(!db){const next=change?change(entry):entry;if(next)memory.set(origin,next);return next;}
      try{return await new Promise((resolve,reject)=>{
        const tx=db.transaction('snapshots',change?'readwrite':'readonly'),store=tx.objectStore('snapshots'),request=store.get(origin);let next;
        const timer=setTimeout(()=>{try{tx.abort();}catch{}reject(Error('Cart state timeout'));},2000);
        request.onsuccess=()=>{const disk=request.result,current=entry&&(!disk||(entry.invalidatedAt||0)>(disk.invalidatedAt||0)||(entry.startedAt||0)>(disk.startedAt||0))?entry:disk;next=change?change(current):current;if(change&&next)store.put(next,origin);};
        tx.oncomplete=()=>{clearTimeout(timer);if(next)memory.set(origin,next);resolve(next||null);};
        tx.onabort=tx.onerror=()=>{clearTimeout(timer);reject(Error('Cart state unavailable'));};
      });}catch{connection=null;try{db.close();}catch{}const next=change?change(entry):entry;if(next)memory.set(origin,next);return next;}
    };
    const serial=fn=>{const result=queue.catch(()=>{}).then(fn);queue=result.catch(()=>{});return result;};
    return {
      put(origin,scope,value){return serial(async()=>{
        if(!scope)return false;
        const next=await operation(origin,current=>{
          if((value.requestStartedAt??value.startedAt)<=(current?.invalidatedAt||0)||value.startedAt<(current?.startedAt||0))return current;
          return {...value,scope,invalidatedAt:current?.invalidatedAt||0,
            readScope:current?.readScope===scope?scope:null,
            readAttemptAt:current?.readScope===scope?current.readAttemptAt||0:0};
        });return next?.scope===scope&&next?.startedAt===value.startedAt;
      });},
      get(origin,scope){return serial(async()=>{const entry=await operation(origin);return scope&&entry?.scope===scope&&entry.startedAt>(entry.invalidatedAt||0)?entry:null;});},
      attempted(origin,scope,time=Date.now()){return serial(async()=>{const entry=await operation(origin);return !!scope&&entry?.readScope===scope&&entry.readAttemptAt>(entry.invalidatedAt||0)&&time-entry.readAttemptAt<30000;});},
      revalidate(origin,scope,time){return serial(async()=>{const entry=await operation(origin);if(!scope||entry?.scope!==scope)return false;
        // One refresh after a quiet period. Multiple tabs and focus events share
        // this persisted timestamp, so reopening the browser cannot freeze a cart.
        return time-(entry.readAttemptAt||0)>=30000&&time-(entry.startedAt||0)>=15000;
      });},
      markAttempt(origin,scope,time){return serial(()=>operation(origin,current=>({...current,readScope:scope,readAttemptAt:time,startedAt:current?.startedAt||0})));},
      problem(origin,scope,issue){return serial(()=>operation(origin,current=>current?.scope===scope&&issue.time>=current.startedAt&&issue.time>=(current.issue?.time||0)?{...current,issue}:current));},
      clear(origin,time){return serial(()=>operation(origin,current=>({invalidatedAt:Math.max(time,current?.invalidatedAt||0),startedAt:0})));},
    };
  }
  async function scope(header,crypto){
    if(typeof header!=='string'||!crypto?.subtle)return null;
    const cookies=header.split(';').map(part=>{const at=part.indexOf('=');return at>0?[part.slice(0,at).trim(),part.slice(at+1).trim()]:null;}).filter(Boolean);
    // Verification/CSRF proofs can rotate within the same cart. They are not
    // account identities and must never invalidate an in-flight cart response.
    const usable=cookies.filter(([name,value])=>value&&!/verify|captcha|challenge|risk|csrf|xsrf/i.test(name));
    const credentials=usable.filter(([name])=>/auth|token|session/i.test(name));
    const accounts=usable.filter(([name])=>!/^(?:api_uid|_nano_fp)$/i.test(name)&&/(?:^|_)uid$|(?:^|_)uin$/i.test(name));
    // A remembered user ID without credentials does not make a guest signed in.
    // Prefer the guest cart ID over a separate device fingerprint.
    const guest=usable.filter(([name])=>/^api_uid$/i.test(name));
    const identity=credentials.length?[...credentials,...accounts]:guest.length?guest:usable.filter(([name])=>/^_nano_fp$/i.test(name));
    if(!identity.length)return null;
    identity.sort(([a],[b])=>a.localeCompare(b));
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(identity)));
    return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
  }
  self.__tembyCartState={create,scope};
})();

// The mobile homepage hydrates stores.store; the cart hydrates store. Use the
// merchant's existing client so its normal request setup stays in the page.
(()=>{
  function client(page){
    const initial=page.__INITIAL_PROPS__;
    for(const root of [initial?.stores?.store,initial?.store]){
      const service=root?.$service;
      if(typeof service?.postRisk==='function')return service;
    }
    return null;
  }
  async function read(page,waitMs=2500){
    const until=Date.now()+Math.min(3000,Math.max(0,waitMs));let service=client(page);
    while(!service&&Date.now()<until){
      // Owned/non-hydrated documents with no application data do not need a
      // startup delay. A real application can finish hydration before a read.
      if(page.document?.readyState==='complete'&&!page.rawData&&!page.__INITIAL_PROPS__)break;
      await new Promise(resolve=>page.setTimeout(resolve,50));service=client(page);
    }
    if(!service)return {available:false,accepted:false};
    const startedAt=Date.now();
    try{
      const value=await service.postRisk({url:'/api/bg/bg-uranus-api/uranus_cart/cart_modify_page',
        params:{api_version:1,cart_modify_type:1,cart_scene:0,extra_config:{req_read_flag:2}},
        config:{timeout:15000,useRiskDialog:false}});
      return {available:true,accepted:!!self.__tembyCart.responseFacts(value,startedAt)};
    }catch{return {available:true,accepted:false};}
  }
  self.__tembyCartClient={client,read};
})();
