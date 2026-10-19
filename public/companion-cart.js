// Only normalized cart facts leave this adapter. Merchant tokens are discarded.
(() => {
  const cents=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
  const text=(v,max=400)=>typeof v==='string'?v.slice(0,max):'';
  function decode(v){if(typeof v==='string'&&v.length<1000000&&/^[\s]*[\[{]/.test(v)){try{return JSON.parse(v);}catch{}}return v;}
  function stamp(v){const m=/^(\d{13})(?:-|$)/.exec(String(v||''));return m?Number(m[1]):0;}
  const keyCurrency=value=>/(?:^|-)(USD|EUR)(?:-|$)/.exec(String(value||''))?.[1]||null;
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
        const nets=[net,dto.orderAmountOrderCcy,transfer?.orderAmount].filter(v=>v!==undefined).map(minorValue);
        if(!cents(net)||nets.some(v=>!cents(v)||v!==net))return;
        const list=cart.goodsSkuList;
        if(!Array.isArray(list)||list.length>1000)return;
        const mapped=list.map(item=>{
          const base=item.baseGoodsInfo||{},sku=item.skuInfo||{};
          return {goodsId:base.goodsId,skuId:sku.skuId,goodsName:base.goodsName,
            quantity:sku.amount,salePrice:sku.skuPrice,isSelected:item.isSelected,
            thumbUrl:sku.cartSkuImage?.thumbUrl||base.thumbUrl,skuSpecVo:sku.skuSpec};
        });
        // Reuse strict item checks; incomplete items must not erase a valid total.
        const common={currency,orderAmount:net,totalGoodsAmount:minorValue(dto.totalGoodsAmount),
          goodsDiscountAmount:minorValue(dto.goodsDiscountAmount),discountAmount:minorValue(dto.discountAmount),
          ckCartLoginStatus:cart.checkoutExtendMap?.ckCartLoginStatus,invalidGoodsLines:cart.invalidGoodsLines,
          strongThreshold:result.checkoutLayerTrackInfo?.strongThreshold};
        const detailed=normalize({k:String(time),v:{...common,goodsSkuList:mapped}});
        const parsed=detailed.length?detailed:normalize({k:String(time),v:common});
        found.push(...parsed.map(cart=>({...cart,canonical:true,emptyConfirmed:list.length===0&&net===0})));return;
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
            if(!/^\d{1,30}$/.test(id)||!/^\d{1,30}$/.test(goodsId)||ids.has(id)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1000)valid=false;
            ids.add(id);
            const flags=['selected','isSelected','checked','isChecked'].filter(k=>item[k]!==undefined).map(k=>item[k]);
            const selection=flags.length&&flags.every(v=>[true,false,0,1,'0','1'].includes(v))&&new Set(flags.map(v=>v===true||v===1||v==='1')).size===1?(flags[0]===true||flags[0]===1||flags[0]==='1'):null;
            let image='';try{const u=new URL(item.thumbUrl||item.hdUrl);if(u.protocol==='https:'&&/(^|\.)kwcdn\.com$/.test(u.hostname))image=u.href;}catch{}
            const specs=Array.isArray(item.skuSpecVo)?item.skuSpecVo.map(s=>[text(s.specKey,60),text(s.specValue,100)].filter(Boolean).join(': ')).filter(Boolean).join(' \u00b7 '):'';
            return {id,goodsId,name:text(item.goodsName),quantity:item.quantity,unitMinor:cents(item.salePrice)?item.salePrice:null,selection,specs,image};
          });
          if(value.goodsSkuList&&grouped.length){const a=list.map(i=>String(i.skuId)).sort().join(','),b=grouped.map(i=>String(i.skuId)).sort().join(',');if(a!==b)valid=false;}
          if(valid){
            const login=unique(['ckCartLoginStatus']);
            const invalid=unique(['invalidGoodsLines']);
            const thresholds=unique(['strongThreshold']);
            found.push({currency,...financial,items,time,login:login.length===1&&['0','1',0,1].includes(login[0])?Number(login[0]):null,invalid:invalid.length===1&&Number.isSafeInteger(invalid[0])?invalid[0]:null,minimum:thresholds.length===1&&cents(thresholds[0])?thresholds[0]:null});
          }
        }
      }
      for(const [k,v]of Object.entries(value))if(!/token|password|cookie|wishSkuList/i.test(k))walk(v,time,depth+1,contextCurrency);
    }
    walk(record,stamp(key),0,keyCurrency(key));
    return found;
  }
  function select(candidates,dom,now=Date.now(),options={}){
    // Without a visible total, only an explicit successful cart response may
    // supply an estimate. Never promote that estimate to a payable quote.
    const cacheOnly=!dom&&options.allowCacheOnly===true;
    if(!dom&&!cacheOnly)return null;
    const fresh=candidates.filter(c=>c.time>0&&now-c.time>=-10000&&now-c.time<1800000&&(!cacheOnly||c.canonical===true));
    if(!fresh.length)return null;
    fresh.sort((a,b)=>b.time-a.time);const newest=fresh[0].time;
    const atTime=fresh.filter(c=>c.time===newest);
    if(new Set(atTime.map(c=>JSON.stringify([c.currency,c.minor]))).size!==1)return null;
    const detailed=atTime.filter(c=>c.items.length);
    if(new Set(detailed.map(c=>JSON.stringify(c.items))).size>1)return null;
    const c=detailed[0]||atTime[0];
    const matches=dom&&(dom.minor===c.minor||(dom.role==='subtotal'&&c.beforeMinor!==null&&dom.minor===c.beforeMinor));
    const live=options.trustLive===true&&c.live===true&&c.canonical===true&&(!dom||dom.currency===c.currency);
    if(!cacheOnly&&!live&&(!dom||dom.currency!==c.currency||!matches))return null;
    const known=c.items.every(i=>i.selection!==null);
    const selected=known?c.items.filter(i=>i.selection):c.items;
    const units=selected.reduce((n,i)=>n+i.quantity,0);
    const visible=live?null:dom;
    const countMatches=visible?.quantity==null||visible.quantity===units||visible.quantity===selected.length;
    const selectionKnown=c.items.length>0&&countMatches&&(known||visible?.quantity===units||visible?.quantity===c.items.length);
    return {...c,items:selectionKnown?c.items:[],quantity:c.emptyConfirmed?0:visible?.quantity??(selectionKnown?units:null),selectionKnown,source:live?'response':cacheOnly?'scdb-estimate':'scdb'};
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
    const factory=page.indexedDB;const open=access?.open||factory?.open?.bind(factory);const databases=access?.databases||factory?.databases?.bind(factory);
    if(!open)return ()=>{};
    let stopped=false,busy=false,entries=[],facts=[],dbName='',revision=0;
    const meta={available:false,stores:[],records:0,candidates:0,scoped:false,shapes:[]};
    const emit=()=>{meta.candidates=entries.length;diagnostic?.({...meta});changed(entries.slice(),facts.slice());};
    async function scan(){
      if(busy||stopped)return;busy=true;const generation=++revision;
      try{
        const available=databases?await databases():[{name:'scdb'}];
        const scoped=(page.__uv?.meta?.url?.origin||'https://www.temu.com')+'@scdb';
        const names=[scoped,'scdb'].filter(n=>available.some(d=>d.name===n));
        if(!names.length){entries=[];facts=[];emit();return;}dbName=names[0];
        const db=await new Promise((resolve,reject)=>{const req=open(dbName);req.onupgradeneeded=()=>{req.transaction.abort();};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('Cart cache unavailable'));req.onblocked=()=>reject(Error('Cart cache busy'));});
        const batch=[],auth=[];let records=0;
        try{
          meta.available=true;meta.scoped=dbName===scoped;meta.stores=Array.from(db.objectStoreNames);meta.shapes=[];
          for(const store of meta.stores.includes('entries')?['entries']:meta.stores){
            if(records>=800)break;
            await new Promise((resolve,reject)=>{
              const tx=db.transaction(store,'readonly');const request=tx.objectStore(store).openCursor(null,'prev');
              request.onsuccess=()=>{const cursor=request.result;if(!cursor||records>=800)return;records++;if(meta.shapes.length<3)meta.shapes.push({store,keys:cursor.value&&typeof cursor.value==='object'?Object.keys(cursor.value).slice(0,20):[],type:typeof cursor.value});batch.push(...normalize(cursor.value,cursor.key));auth.push(...authFacts(cursor.value,cursor.key));cursor.continue();};
              tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error('Cart cache read failed'));tx.onabort=tx.onerror;
            });
          }
        }finally{db.close();}
        meta.records=records;
        if(generation===revision){entries=batch.sort((a,b)=>b.time-a.time).slice(0,12);facts=auth.sort((a,b)=>b.time-a.time).slice(0,12);emit();}
      }catch{diagnostic?.({...meta,error:'unavailable'});}finally{busy=false;}
    }
    void scan();
    const focus=()=>{void scan();};page.addEventListener('focus',focus);
    const timer=page.setInterval(()=>{if(!page.document.hidden)void scan();},2000);
    return ()=>{stopped=true;page.clearInterval(timer);page.removeEventListener('focus',focus);};
  }
  const responseURL=value=>{try{const url=new URL(value);return url.protocol==='https:'&&/(^|\.)temu\.com$/.test(url.hostname)&&url.pathname.startsWith('/api/')&&/\/cart_modify\//.test(url.pathname);}catch{return false;}};
  function responseFacts(value,time=Date.now()){
    if(!value||value.success!==true||!value.result?.cartListInfo)return null;
    const record={k:String(time),d:value};
    const carts=normalize(record).filter(c=>c.canonical).map(c=>({...c,live:true}));
    return carts.length?{carts,facts:authFacts(record)}:null;
  }
  self.__tembyCart={normalize,select,observe,authFacts,accountStatus,finances,responseURL,responseFacts};
})();

// Read explicit monetary labels, never the first price in a summary container.
self.__tembyPageReader=(page,core)=>{
  const doc=page.document;
  const visible=el=>!!el&&el.getClientRects().length>0&&page.getComputedStyle(el).visibility!=='hidden'&&!el.closest('[aria-hidden="true"],del,s');
  const finalLabel=/^(?:total|order total|grand total|total amount|amount due|total de la commande|montant total|\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a|\u0627\u0644\u0645\u062c\u0645\u0648\u0639|\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0637\u0644\u0628|\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a|\u0627\u0644\u0645\u062c\u0645\u0648\u0639 \u0627\u0644\u0643\u0644\u064a|\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0645\u0633\u062a\u062d\u0642)\s*[:\uff1a]?$/i;
  const noStrike=el=>{for(let node=el,n=0;node&&n<4;node=node.parentElement,n++)if(page.getComputedStyle(node).textDecorationLine?.includes('line-through'))return false;return true;};
  const prices=scope=>[...scope.querySelectorAll('*')].filter(el=>visible(el)&&noStrike(el)&&core.money(el.textContent)&&![...el.children].some(c=>core.money(c.textContent))).map(el=>core.money(el.textContent));
  function labelled(scope){
    const results=[];
    for(const label of scope.querySelectorAll('span,div,p,label,strong')){
      const wording=core.normalize(label.textContent).trim().replace(/\s*\([^)]*\)\s*:?[\s]*$/,'').trim();
      if(!visible(label)||!finalLabel.test(wording))continue;
      let parent=label.parentElement;
      for(let depth=0;parent&&depth<4;depth++,parent=parent.parentElement){
        const amounts=prices(parent),unique=[...new Map(amounts.map(a=>[a.currency+':'+a.minor,a])).values()];
        if(unique.length===1){results.push(unique[0]);break;}
        if(unique.length>1)break;
        if(parent===scope)break;
      }
    }
    const unique=[...new Map(results.map(a=>[a.currency+':'+a.minor,a])).values()];
    return unique.length===1?unique[0]:null;
  }
  return ()=>{
    const pathname=page.__uv?.meta?.url?.pathname||'';
    const full=/\/(?:shopping_cart|bgt_order_checkout)\.html$/.test(pathname);
    if(full){
      const scope=doc.querySelector('.g_p_sum_wr')||doc.querySelector('main')||doc.body;
      if(!scope)return null;
      const amount=labelled(scope);
      if(amount){
        const button=scope.querySelector('.checkoutButton');
        const match=/\((\d+)\)/.exec(core.normalize(button?.getAttribute('aria-label')||''));
        return {...amount,quantity:match?Number(match[1]):null,role:'final',source:'page'};
      }
      // A full cart/checkout subtotal is not an acceptable substitute for net.
      return null;
    }
    const checkout=doc.getElementById('SidebarCheckout');if(!visible(checkout))return null;
    const scope=checkout.parentElement?.parentElement;if(!scope?.querySelector('.Sidebar-itemList'))return null;
    const labels=[...scope.querySelectorAll('[role="group"][aria-label]')].filter(visible).map(el=>el.getAttribute('aria-label')).filter(v=>/subtotal|sous.total|\u0627\u0644\u0645\u062c\u0645\u0648\u0639 \u0627\u0644\u0641\u0631\u0639\u064a/i.test(v));
    const subtotal=core.consensus(labels,checkout.getAttribute('aria-label'));
    return subtotal&&{...subtotal,role:'subtotal',source:'page'};
  };
};
