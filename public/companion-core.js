// Shared, deterministic money rules. All amounts are integer minor units.
(() => {
  const normalize = value => String(value).replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, '').replace(/[\u0660-\u0669\u06f0-\u06f9]/g, c => String(c.charCodeAt(0) >= 0x6f0 ? c.charCodeAt(0)-0x6f0 : c.charCodeAt(0)-0x660)).replace(/\u066b/g,'.').replace(/\u066c/g,',');
  function money(value) {
    const text=normalize(value);
    const currencies=[...new Set([...(text.match(/EUR|USD|\u20ac|\$|GBP|\u00a3|CAD|AUD|DZD/gi)||[])].map(x=>x.toUpperCase()))];
    if(currencies.length!==1)return null;
    const currency={EUR:'EUR','\u20ac':'EUR',USD:'USD','$':'USD'}[currencies[0]];
    if(!currency)return null;
    const matches=text.match(/\d(?:[\d.,\s\u00a0\u202f]*\d)?/g)||[];
    if(matches.length!==1)return null;
    let number=matches[0].trim().replace(/[\s\u00a0\u202f]/g,'');
    if(/[-\u2212]\s*(?:[$\u20ac]\s*)?\d/.test(text)||!/^(?:\d+|\d+[.,]\d{2}|\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{1,3}(?:\.\d{3})+(?:,\d{2})?)$/.test(number))return null;
    const decimal=/[.,]\d{2}$/.test(number);
    const digits=number.replace(/[.,]/g,'');
    const minor=Number(digits)*(decimal?1:100);
    return Number.isSafeInteger(minor)&&minor>=0&&minor<=100000000?{currency,minor}:null;
  }
  function quote(minor,currency,rates={USD:25000,EUR:27500}) {
    const rate=rates[currency];
    if(!Number.isSafeInteger(minor)||minor<0||minor>100000000||!Number.isSafeInteger(rate)||rate<=0||rate>1000000)throw Error('Invalid price or rate');
    const round=(n,d)=>Number((n+BigInt(d)/2n)/BigInt(d));
    const converted=round(BigInt(minor)*BigInt(rate),100);
    const service=round(BigInt(converted)*8n,100);
    const bubble=converted+service;
    const card=round(BigInt(bubble)*2n,100);
    return {converted,service,bubble,card,total:bubble+card,rate};
  }
  function consensus(labels,countLabel) {
    const parsed=labels.map(money);
    if(!parsed.length||parsed.some(x=>!x))return null;
    const first=parsed[0];
    if(parsed.some(x=>x.currency!==first.currency||x.minor!==first.minor))return null;
    const count=/\((\d+)\)/.exec(normalize(countLabel||''));
    if(!count)return null;
    const quantity=Number(count[1]);
    if((quantity===0)!==(first.minor===0))return null;
    return {...first,quantity};
  }
  const paymentRates={card:200,baridimob:50};
  function paymentFee(amount,method){
    if(!Number.isSafeInteger(amount)||amount<0||!Object.hasOwn(paymentRates,method))throw Error('Invalid payment estimate');
    return Number((BigInt(amount)*BigInt(paymentRates[method])+5000n)/10000n);
  }
  function cartState(snapshot,updating,loading=false){
    if(updating||!snapshot&&loading)return 'loading';
    if(!snapshot)return 'unavailable';
    if(snapshot.quantity===0||snapshot.minor===0&&!(snapshot.quantity>0))return 'empty';
    return 'ready';
  }
  function password(crypto){
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for(let attempt=0;attempt<32;attempt++){
      let value='';while(value.length<16){const bytes=crypto.getRandomValues(new Uint8Array(32));for(const n of bytes){if(n<248&&value.length<16)value+=alphabet[n%62];}}
      if(/[A-Z]/.test(value)&&/[a-z]/.test(value)&&/\d/.test(value))return value;
    }
    throw Error('Password generation unavailable');
  }
  self.__tembyCompanionCore={money,quote,consensus,normalize,paymentFee,cartState,password};
})();
