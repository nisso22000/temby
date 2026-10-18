// Only normalized cart facts leave this adapter. Merchant tokens are discarded.
(() => {
  const cents=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
  const text=(v,max=400)=>typeof v==='string'?v.slice(0,max):'';
  function decode(v){if(typeof v==='string'&&v.length<1000000&&/^[\s]*[\[{]/.test(v)){try{return JSON.parse(v);}catch{}}return v;}
  function stamp(v){const m=/^(\d{13})(?:-|$)/.exec(String(v||''));return m?Number(m[1]):0;}
  function normalize(record,key){
    const found=[];let visited=0;
    function walk(value,time,depth){
      value=decode(value);if(!value||typeof value!=='object'||depth>7||++visited>2500)return;
      time=stamp(value.k)||time;
      if(!Array.isArray(value)&&(Array.isArray(value.goodsSkuList)||Array.isArray(value.displayList))){
        const objects=[];
        const gather=(o,d)=>{o=decode(o);if(!o||typeof o!=='object'||Array.isArray(o)||d>3)return;objects.push(o);for(const [k,v]of Object.entries(o))if(!/token|password|cookie|goodsSkuList|displayList|wishSkuList/i.test(k))gather(v,d+1);};
        gather(value,0);
        const unique=(keys)=>[...new Set(objects.flatMap(o=>keys.filter(k=>o[k]!==undefined).map(k=>o[k])))];
        const currencies=unique(['ckCartCcy','currency']).filter(v=>typeof v==='string'&&/^[A-Z]{3}$/.test(v));
        const currency=currencies.length===1?currencies[0]:null;
        const totals=unique(['orderAmount']);
        if(!totals.length&&currency==='USD')totals.push(...unique(['orderAmountUsd']));
        const minor=totals.length===1&&cents(totals[0])?totals[0]:null;
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
            found.push({currency,minor,items,time,login:login.length===1&&['0','1',0,1].includes(login[0])?Number(login[0]):null,invalid:invalid.length===1&&Number.isSafeInteger(invalid[0])?invalid[0]:null,minimum:thresholds.length===1&&cents(thresholds[0])?thresholds[0]:null});
          }
        }
      }
      for(const [k,v]of Object.entries(value))if(!/token|password|cookie|wishSkuList/i.test(k))walk(v,time,depth+1);
    }
    walk(record,stamp(key),0);
    return found;
  }
  function select(candidates,dom,now=Date.now()){
    // A historical cache entry alone never establishes the current cart.
    const fresh=candidates.filter(c=>c.time>0&&now-c.time>=-10000&&now-c.time<120000);
    if(!fresh.length)return null;
    fresh.sort((a,b)=>b.time-a.time);const newest=fresh[0].time;
    const atTime=fresh.filter(c=>c.time===newest);
    if(new Set(atTime.map(c=>JSON.stringify([c.currency,c.minor,c.items]))).size!==1)return null;
    const c=atTime[0];
    if(!dom||dom.currency!==c.currency||dom.minor!==c.minor)return null;
    const known=c.items.every(i=>i.selection!==null);
    const selected=known?c.items.filter(i=>i.selection):c.items;
    if(selected.reduce((n,i)=>n+i.quantity,0)!==dom.quantity)return null;
    return {...c,quantity:dom.quantity,selectionKnown:known||dom.quantity===c.items.reduce((n,i)=>n+i.quantity,0),source:'scdb'};
  }
  function observe(page,changed,diagnostic){
    const factory=page.indexedDB;const open=factory?.open?.bind(factory);const databases=factory?.databases?.bind(factory);
    if(!open)return ()=>{};
    let stopped=false,busy=false,entries=[],dbName='',revision=0;
    const meta={available:false,stores:[],records:0,candidates:0};
    const emit=()=>{meta.candidates=entries.length;diagnostic?.({...meta});changed(entries.slice());};
    async function scan(){
      if(busy||stopped)return;busy=true;const generation=++revision;
      try{
        const available=databases?await databases():[{name:'scdb'}];
        const names=available.map(d=>d.name).filter(n=>n==='scdb');
        if(!names.length){entries=[];emit();return;}dbName=names[0];
        const db=await new Promise((resolve,reject)=>{const req=open(dbName);req.onupgradeneeded=()=>{req.transaction.abort();};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('Cart cache unavailable'));req.onblocked=()=>reject(Error('Cart cache busy'));});
        const batch=[];let records=0;
        try{
          meta.available=true;meta.stores=Array.from(db.objectStoreNames);
          for(const store of meta.stores){
            if(records>=800)break;
            await new Promise((resolve,reject)=>{
              const tx=db.transaction(store,'readonly');const request=tx.objectStore(store).openCursor();
              request.onsuccess=()=>{const cursor=request.result;if(!cursor||records>=800)return;records++;batch.push(...normalize(cursor.value,cursor.key));cursor.continue();};
              tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error('Cart cache read failed'));tx.onabort=tx.onerror;
            });
          }
        }finally{db.close();}
        meta.records=records;
        if(generation===revision){entries=batch.sort((a,b)=>b.time-a.time).slice(0,12);emit();}
      }catch{diagnostic?.({...meta,error:'unavailable'});}finally{busy=false;}
    }
    void scan();
    const focus=()=>{void scan();};page.addEventListener('focus',focus);
    const timer=page.setInterval(()=>{if(!page.document.hidden)void scan();},2000);
    return ()=>{stopped=true;page.clearInterval(timer);page.removeEventListener('focus',focus);};
  }
  self.__tembyCart={normalize,select,observe};
})();
