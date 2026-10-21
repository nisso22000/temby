self.__tembyConfigureCompanion=(page,idb)=>{
  if(page!==page.top||page.__tembyCompanionStarted)return;
  page.__tembyCompanionStarted=true;
  const core=self.__tembyCompanionCore,adapter=self.__tembyCart;
  // Local request time is known for live responses. A merchant cache write
  // time cannot prove that older merchant data became current again.
  const confirmationTime=cart=>cart?.live?(cart.observedAt||cart.time):(cart?.time||0);
  const dbAccess={open:(...args)=>idb.open.call(page.indexedDB,...args),databases:page.indexedDB.databases?.bind(page.indexedDB)};
  const workerContainer=page.navigator.serviceWorker;
  const post=page.ServiceWorker?.prototype?.postMessage;
  const send=(message,ports)=>{const worker=workerContainer?.controller;if(!worker||!post)throw Error('worker-unavailable');post.call(worker,message,ports);};
  let pendingCart=null,receiveCart=null,pendingIssue=null,receiveIssue=null,cartIssue=null,cartIssueAt=0,cartChangedAt=0,refreshCartCache=()=>{},cartReadPending=false,receiveReadState=null;
  workerContainer?.addEventListener('message',event=>{
    if(event.source!==workerContainer.controller)return;
    if(event.data?.tembyCartClientRead){
      const port=event.ports?.[0];if(!port)return;
      let finished=false,timer;
      const finish=result=>{if(finished)return;finished=true;page.clearTimeout(timer);page.removeEventListener('pagehide',interrupted);try{port.postMessage(result);}catch{}port.close();};
      const interrupted=()=>finish({available:true,accepted:false,interrupted:true});
      page.addEventListener('pagehide',interrupted,{once:true});
      timer=page.setTimeout(()=>finish({available:true,accepted:false}),17500);
      void self.__tembyCartClient.read(page).then(finish,()=>finish({available:true,accepted:false}));return;
    }
    if(typeof event.data?.tembyCartReadState?.pending==='boolean'){cartReadPending=event.data.tembyCartReadState.pending;receiveReadState?.();return;}
    if(event.data?.tembyCartNeedsRead){const time=event.data.tembyCartNeedsRead.time;if(Number.isSafeInteger(time))cartChangedAt=Math.max(cartChangedAt,time);try{send({tembyCartRefresh:{time,clientRead:1}});}catch{}return;}
    if(event.data?.tembyCartTrace){adapter.trace(page,event.data.tembyCartTrace.phase,event.data.tembyCartTrace);return;}
    const issue=event.data?.tembyCartStatus;
    if(issue&&['http-error','unsupported-content','missing-body','too-large','merchant-failure','unsupported-schema','inconsistent-cart','invalid-json','client-error'].includes(issue.reason)){
      if(receiveIssue)receiveIssue(issue);else pendingIssue=issue;return;
    }
    const data=event.data?.tembyCartUpdate;
    if(!Array.isArray(data?.carts)||data.carts.length>12)return;
    if(receiveCart)receiveCart(data);else pendingCart=data;
  });
  // Restore this account's validated response, or initialize through the
  // worker's bounded read-only API call when no usable snapshot exists.
  try{send({tembyCartRead:{since:page.performance.timeOrigin,clientRead:1}});}catch{}
  const nativeSet=Object.getOwnPropertyDescriptor(page.HTMLInputElement.prototype,'value').set;
  // Keep companion preferences separate from UV's virtual merchant storage.
  const storage=page.sessionStorage;
  const storageGet=storage.getItem.bind(storage),storageSet=storage.setItem.bind(storage),storageRemove=storage.removeItem.bind(storage);
  const sharedStorage=page.localStorage;
  const sharedGet=sharedStorage.getItem.bind(sharedStorage),sharedSet=sharedStorage.setItem.bind(sharedStorage);
  const born=Date.now();
  const start=()=>{
    if(!/(^|\.)temu\.com$/.test(page.__uv?.meta?.url?.hostname||''))return;
    const doc=page.document,ar=/^ar/i.test(doc.documentElement.lang||'');
    const fr={open:'Ouvrir votre compagnon',close:'Fermer',intro:'Choisissez vos articles. Je m\u2019occupe du calcul en dinars.',cart:'Votre panier',empty:'Votre panier vous attend',emptyText:'Ajoutez vos coups de c\u0153ur sur Temu. Le montant appara\u00eetra ici.',unavailable:'Ouvrons votre panier pour retrouver le montant.',browse:'Choisir mes articles',openCart:'Ouvrir mon panier',next:'Continuer',detail:'Voir le calcul',converted:'Articles en dinars',service:'Service \u00b7 8 %',estimate:'Estimation, service compris',items:'article(s) s\u00e9lectionn\u00e9(s)',account:'Pr\u00e9parons votre compte',accountText:'Connectez-vous sur Temu pour garder votre panier.',test:'Utiliser un e-mail de test',own:'J\u2019ai d\u00e9j\u00e0 un compte',testNote:'Adresse temporaire, r\u00e9serv\u00e9e aux essais.',fill:'Utiliser cette adresse sur Temu',filled:'Adresse ajout\u00e9e. Continuez sur Temu.',needField:'Ouvrez d\u2019abord la connexion Temu.',keep:'Votre adresse est d\u00e9j\u00e0 saisie. Je la garde.',checking:'Je regarde si le code est arriv\u00e9\u2026',checkCode:'Voir mon code',noCode:'Pas encore de message. R\u00e9essayez dans quelques secondes.',mailError:'Le courrier est indisponible. R\u00e9essayez dans un instant.',shipping:'O\u00f9 livrer votre commande ?',shippingText:'Ajoutez votre adresse sur Temu, puis v\u00e9rifiez qu\u2019elle est bien s\u00e9lectionn\u00e9e.',delivery:'Choisir mon adresse sur Temu',confirmed:'J\u2019ai v\u00e9rifi\u00e9 mon adresse',review:'Votre r\u00e9capitulatif',reviewText:'Le paiement sera disponible apr\u00e8s la v\u00e9rification compl\u00e8te de la commande.',back:'Retour',problem:'Certains articles ont besoin d\u2019\u00eatre v\u00e9rifi\u00e9s sur Temu.',card:'CIB / Edahabia \u00b7 2 %',total:'Total estim\u00e9',paymentUnavailable:'Paiement pas encore disponible'};
    const arabic={open:'\u0627\u0641\u062a\u062d \u0645\u0633\u0627\u0639\u062f \u0627\u0644\u062a\u0633\u0648\u0642',close:'\u0625\u063a\u0644\u0627\u0642',intro:'\u0627\u062e\u062a\u0627\u0631 \u0648\u0627\u0634 \u0639\u062c\u0628\u0643\u060c \u0648\u0646\u062d\u0633\u0628\u0648\u0644\u0643 \u0627\u0644\u0633\u0639\u0631 \u0628\u0627\u0644\u062f\u064a\u0646\u0627\u0631.',cart:'\u0633\u0644\u0629 \u0645\u0634\u062a\u0631\u064a\u0627\u062a\u0643',empty:'\u0633\u0644\u062a\u0643 \u062a\u0633\u062a\u0646\u0651\u0627\u0643',emptyText:'\u0632\u064a\u062f \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a \u0627\u0644\u0644\u064a \u0639\u062c\u0628\u062a\u0643 \u0641\u064a Temu\u060c \u0648\u0627\u0644\u0633\u0639\u0631 \u064a\u0628\u0627\u0646 \u0647\u0646\u0627.',unavailable:'\u0646\u0641\u062a\u062d\u0648 \u0627\u0644\u0633\u0644\u0629 \u0628\u0627\u0634 \u0646\u062a\u0623\u0643\u062f\u0648 \u0645\u0646 \u0627\u0644\u0633\u0639\u0631.',browse:'\u0646\u062e\u062a\u0627\u0631 \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a',openCart:'\u0646\u0641\u062a\u062d \u0633\u0644\u062a\u064a',next:'\u0646\u0643\u0645\u0644',detail:'\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u062d\u0633\u0627\u0628',converted:'\u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a \u0628\u0627\u0644\u062f\u064a\u0646\u0627\u0631',service:'\u0627\u0644\u062e\u062f\u0645\u0629 \u00b7 8 \u066a',estimate:'\u0633\u0639\u0631 \u062a\u0642\u062f\u064a\u0631\u064a\u060c \u064a\u0634\u0645\u0644 \u0627\u0644\u062e\u062f\u0645\u0629',items:'\u0645\u0646\u062a\u062c \u0645\u062d\u062f\u062f',account:'\u0646\u0648\u062c\u062f\u0648 \u062d\u0633\u0627\u0628\u0643',accountText:'\u0633\u062c\u0651\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0641\u064a Temu \u0628\u0627\u0634 \u062a\u062d\u062a\u0627\u0641\u0638 \u0628\u0633\u0644\u062a\u0643.',test:'\u0646\u0633\u062a\u0639\u0645\u0644 \u0628\u0631\u064a\u062f \u0644\u0644\u062a\u062c\u0631\u0628\u0629',own:'\u0639\u0646\u062f\u064a \u062d\u0633\u0627\u0628',testNote:'\u0628\u0631\u064a\u062f \u0645\u0624\u0642\u062a\u060c \u0644\u0644\u062a\u062c\u0631\u0628\u0629 \u0641\u0642\u0637.',fill:'\u0646\u0633\u062a\u0639\u0645\u0644 \u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064a\u062f \u0641\u064a Temu',filled:'\u0627\u0644\u0628\u0631\u064a\u062f \u0631\u0627\u0647\u0648 \u0645\u0643\u062a\u0648\u0628. \u0643\u0645\u0651\u0644 \u0641\u064a Temu.',needField:'\u0627\u0641\u062a\u062d \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0641\u064a Temu \u0623\u0648\u0644\u0627\u064b.',keep:'\u0627\u0644\u0628\u0631\u064a\u062f \u0631\u0627\u0647\u0648 \u0645\u0643\u062a\u0648\u0628\u060c \u0646\u062e\u0644\u064a\u0647 \u0643\u064a\u0645\u0627 \u0631\u0627\u0647.',checking:'\u0646\u0634\u0648\u0641\u0648 \u0625\u0630\u0627 \u0648\u0635\u0644 \u0631\u0645\u0632 \u0627\u0644\u062a\u0623\u0643\u064a\u062f\u2026',checkCode:'\u0646\u0634\u0648\u0641 \u0631\u0645\u0632 \u0627\u0644\u062a\u0623\u0643\u064a\u062f',noCode:'\u0645\u0627 \u0648\u0635\u0644 \u062d\u062a\u0649 \u0628\u0631\u064a\u062f \u0628\u0639\u062f. \u0639\u0627\u0648\u062f \u0628\u0639\u062f \u0634\u0648\u064a\u0629.',mailError:'\u0627\u0644\u0628\u0631\u064a\u062f \u0645\u0627 \u0631\u0627\u0647\u0648\u0634 \u0645\u062a\u0627\u062d. \u0639\u0627\u0648\u062f \u0628\u0639\u062f \u0634\u0648\u064a\u0629.',shipping:'\u0648\u064a\u0646 \u0646\u0648\u0635\u0651\u0644\u0648 \u0637\u0644\u0628\u0643\u061f',shippingText:'\u0632\u064a\u062f \u0639\u0646\u0648\u0627\u0646\u0643 \u0641\u064a Temu\u060c \u0648\u062a\u0623\u0643\u062f \u0628\u0644\u064a \u0647\u0648 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u062d\u062f\u062f \u0644\u0644\u0637\u0644\u0628.',delivery:'\u0646\u062e\u062a\u0627\u0631 \u0639\u0646\u0648\u0627\u0646\u064a \u0641\u064a Temu',confirmed:'\u062a\u0623\u0643\u062f\u062a \u0645\u0646 \u0639\u0646\u0648\u0627\u0646\u064a',review:'\u0645\u0644\u062e\u0635 \u0637\u0644\u0628\u0643',reviewText:'\u0627\u0644\u062f\u0641\u0639 \u064a\u062a\u0648\u0641\u0631 \u0628\u0639\u062f \u0627\u0644\u062a\u0623\u0643\u062f \u0645\u0646 \u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0637\u0644\u0628 \u0643\u0627\u0645\u0644\u0629.',back:'\u0631\u062c\u0648\u0639',problem:'\u0643\u0627\u064a\u0646 \u0645\u0646\u062a\u062c\u0627\u062a \u0644\u0627\u0632\u0645 \u062a\u062a\u0623\u0643\u062f \u0645\u0646\u0647\u0627 \u0641\u064a Temu.',card:'CIB / \u0627\u0644\u0630\u0647\u0628\u064a\u0629 \u00b7 2 \u066a',total:'\u0627\u0644\u0645\u062c\u0645\u0648\u0639 \u0627\u0644\u062a\u0642\u062f\u064a\u0631\u064a',paymentUnavailable:'\u0627\u0644\u062f\u0641\u0639 \u0645\u0627\u0632\u0627\u0644 \u0645\u0627 \u062a\u0648\u0641\u0631\u0634'};
    Object.assign(fr,{minimum:'Le minimum de commande n’est pas encore atteint.',problem:'Vérifiez les articles indisponibles dans votre panier Temu.',saving:'Vous \u00e9conomisez',discount:'R\u00e9duction Temu',updating:'Je mets le montant \u00e0 jour\u2026',accountRefresh:'Connexion d\u00e9tect\u00e9e dans un autre onglet. Actualisons cette page.',refresh:'Actualiser',addressHint:'Ajoutez votre adresse dans le carnet Temu, puis confirmez-la ici.'});
    Object.assign(arabic,{minimum:'ما وصلتش للحد الأدنى تاع الطلب.',problem:'كاين منتجات لازم تتأكد منها في سلة Temu.',saving:'\u0648\u0641\u0631\u062a',discount:'\u062a\u062e\u0641\u064a\u0636 Temu',updating:'\u0631\u0627\u0646\u064a \u0646\u062d\u062f\u0651\u062b \u0627\u0644\u0633\u0639\u0631\u2026',accountRefresh:'\u062a\u0633\u062c\u0651\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0641\u064a \u0635\u0641\u062d\u0629 \u0623\u062e\u0631\u0649. \u0646\u062d\u062f\u0651\u062b\u0648 \u0647\u0630\u064a \u0627\u0644\u0635\u0641\u062d\u0629.',refresh:'\u0646\u062d\u062f\u0651\u062b \u0627\u0644\u0635\u0641\u062d\u0629',addressHint:'\u0632\u064a\u062f \u0639\u0646\u0648\u0627\u0646\u0643 \u0641\u064a \u062f\u0641\u062a\u0631 \u0627\u0644\u0639\u0646\u0627\u0648\u064a\u0646 \u062a\u0627\u0639 Temu\u060c \u0648\u0645\u0646 \u0628\u0639\u062f \u0623\u0643\u062f\u0651\u0647 \u0647\u0646\u0627.'});
    const t=ar?arabic:fr;
    Object.assign(t,ar?{cartRetry:'Temu ما قدرش يحدّث السلة. افتحها باش تتأكد من السعر.',minimumUnknown:'الحد الأدنى تاع Temu لازم يتأكد قبل تأكيد الطلب.',moreShopping:'نكمل التسوق'}:{cartRetry:'Temu n’a pas pu actualiser votre panier. Ouvrez-le pour vérifier le montant.',minimumUnknown:'Le minimum Temu reste à confirmer avant validation de la commande.',moreShopping:'Continuer mes achats'});
    Object.assign(t,ar?{unselectedProblem:'كاين منتج غير متوفر وماهوش محدد. ما يدخلش في السعر ولا يمنعك تكمل.'}:{unselectedProblem:'Un article indisponible non sélectionné est exclu du montant et ne bloque pas la suite.'});
    Object.assign(t,ar?{rate:'سعر الصرف',temuNet:'سعر Temu بعد التخفيض',beforeTemu:'قبل التخفيض',}:{rate:'Taux de change',temuNet:'Temu après réduction',beforeTemu:'Avant réduction',});
    Object.assign(t,ar?{loadingTitle:'نحضّر سلتك…',unavailableTitle:'اختار واش يعجبك',test:'نوجد حسابي',fill:'نكمل التسجيل في Temu',existingText:'سجّل الدخول بحسابك في Temu.',passwordLabel:'كلمة السر الجديدة',copyPassword:'ننسخ كلمة السر',passwordCopied:'تنسخت. احتفظ بها لحسابك.',passwordHint:'انسخ كلمة السر واحتفظ بها، ثم كمّل التسجيل في Temu.',accountText:'نوجدولك البريد ونعمرّوه. كمّل التأكيد في Temu.'}:{loadingTitle:'Je prépare votre panier…',unavailableTitle:'Choisissez vos articles',test:'Préparer mon compte',fill:'Continuer sur Temu',existingText:'Connectez-vous à votre compte sur Temu.',passwordLabel:'Votre nouveau mot de passe',copyPassword:'Copier le mot de passe',passwordCopied:'Copié. Conservez-le pour votre compte.',passwordHint:'Copiez et conservez ce mot de passe, puis terminez sur Temu.',accountText:'Je prépare et remplis votre e-mail. Terminez la vérification sur Temu.'});
    Object.assign(t,ar?{unavailable:'تسوّق على راحتك، كي نقراو سلتك يبان السعر هنا.',accountText:'نوجدولك حساب للتجربة، ولا تدخل بحسابك؟',test:'نوجد حساب للتجربة',emailLabel:'البريد الإلكتروني',copyEmail:'ننسخ البريد',passwordHint:'كلمة سر مقترحة. تولّي كلمة سر حسابك غير كي تقبلها Temu.',fill:'نعمر المعلومات في Temu'}:{unavailable:'Parcourez Temu à votre rythme. Le montant apparaîtra dès que le panier sera lu.',accountText:'Préparer un compte de test ou utiliser votre compte ?',test:'Préparer un compte de test',emailLabel:'E-mail',copyEmail:'Copier l’e-mail',passwordHint:'Mot de passe proposé. Il ne devient celui du compte que si Temu l’accepte.',fill:'Remplir sur Temu'});
    Object.assign(t,ar?{estimate:'سعر تقديري، يشمل عمولتنا',next:'التالي',account:'افتح حساب',fill:'ملء تلقائي',service:'عمولتنا · 5 ٪',shipping:'أدخل عنوان التوصيل',addressHint:'أدخل عنوانك الصحيح في Temu واحفظه، لأنه العنوان اللي تستعمله Temu لإرسال مشترياتك. بعدها أكّد هنا.',accountText:'نقترحو بريد وكلمة سر مخصّصين للتجربة باش ما تحتاجش تستعمل حسابك الشخصي. تقدر تختار حسابك بدلاً منه.',testNote:'بريد مخصّص للتجربة، ماشي بريدك الشخصي. تقدر تستعمل حسابك بدلاً منه.',passwordLabel:'كلمة السر المقترحة',savedAddress:'حفظت عنواني وتأكدت منه'}:{estimate:'Estimation, commission comprise',next:'Suivant',account:'Créer un compte',fill:'Remplir automatiquement',service:'Notre commission · 5 %',shipping:'Saisissez votre adresse de livraison',addressHint:'Saisissez et enregistrez votre adresse exacte dans Temu : Temu l’utilisera pour expédier vos achats. Confirmez ensuite ici.',accountText:'Un e-mail et un mot de passe dédiés aux essais évitent d’utiliser votre compte personnel. Vous pouvez choisir votre propre compte.',testNote:'E-mail réservé aux essais, distinct de votre adresse personnelle. Votre compte reste une option.',passwordLabel:'Mot de passe proposé',savedAddress:'Adresse enregistrée et vérifiée'});
    Object.assign(t,ar?{accountText:'نوجدولك بريد وكلمة سر مخصّصين للتجربة، باش ما تحتاجش تستعمل حسابك الشخصي. كمّل التأكيد في نافذة Temu.',passwordWait:'كمّل خطوة البريد في نافذة Temu أولاً. كي تظهر خانة كلمة السر نعمرّوها.',passwordFilled:'تعمرت كلمة السر في Temu.',passwordKeep:'خانة كلمة السر فيها قيمة، ما نبدلوهاش.'}:{accountText:'Nous préparons un e-mail et un mot de passe dédiés aux essais, sans utiliser votre compte personnel. Terminez la vérification dans Temu.',passwordWait:'Terminez l’étape e-mail dans Temu. Le mot de passe sera rempli quand son champ apparaîtra.',passwordFilled:'Mot de passe rempli dans Temu.',passwordKeep:'Le champ contient déjà une valeur, nous la conservons.'});
    const host=doc.createElement('div');host.id='temby-companion';host.style.cssText='all:initial;font:14px/1.5 Segoe UI,Tahoma,Arial,sans-serif;position:fixed;bottom:12px;left:8px;direction:ltr;width:max-content;max-width:calc(100vw - 16px);z-index:2147483646;color:#203d4b;';
    const root=host.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      *{box-sizing:border-box}button,summary{cursor:pointer}button{font:inherit}button:focus-visible,summary:focus-visible{outline:3px solid #92c5e6;outline-offset:4px}[hidden]{display:none!important}
      .launcher{direction:ltr;display:flex;align-items:center;justify-content:flex-start;gap:4px;width:max-content;border:0;padding:0;background:transparent;color:white;filter:drop-shadow(0 5px 12px #073b6530)}.orb{width:58px;height:58px;border-radius:50%;background:#075da6;padding:4px;display:grid;place-items:center;transition:transform .2s}.orb img{width:50px;height:50px;border-radius:50%;display:block}.tag{background:#075da6;border-radius:10px;padding:8px 14px;min-width:104px;font-size:16px;font-weight:700;letter-spacing:.1px;direction:ltr}.launcher:hover .orb{transform:translateY(-2px)}
      .panel{width:min(360px,calc(100vw - 16px));max-height:calc(100dvh - 110px);overflow:auto;overscroll-behavior:contain;background:#fffdf9;border:1px solid #e8e9e4;border-radius:24px;box-shadow:0 12px 44px #24445b29;margin-bottom:10px;transform-origin:bottom left;animation:arrive .22s ease-out}.head{padding:20px 22px 14px;display:flex;align-items:center;gap:10px}.head img{width:34px;height:34px;border-radius:50%}.wordmark{font-size:12px;letter-spacing:1.7px;font-weight:700;color:#075da6}.close{margin-inline-start:auto;background:transparent;border:0;color:#7b8d93;font-size:25px;width:32px;height:32px}.content{padding:4px 22px 22px}h2{font-size:23px;line-height:1.3;letter-spacing:-.5px;margin:9px 0 10px;font-weight:700}p{color:#718187;font-size:13px;line-height:1.65;margin:0 0 16px}.pricebox{background:#f0f6fa;border-radius:17px;padding:17px;margin:16px 0}.saving{color:#24835a;font-size:12px;margin-top:5px}.before{font-size:13px;color:#82929a;text-decoration:line-through;direction:ltr}.launcher[aria-busy=true] .tag{opacity:.6}.price{font-size:29px;font-weight:700;color:#075da6;letter-spacing:-1px;direction:ltr}.hint{font-size:11px;color:#79909d;margin-top:4px}.count{font-size:12px;color:#5d7889;margin-bottom:4px}.primary{width:100%;background:#075da6;border:0;border-radius:13px;color:#fff;min-height:46px;padding:12px 14px;font-weight:700;transition:background .2s,transform .2s}.primary:hover{background:#236dac;transform:translateY(-1px)}.secondary{width:100%;background:transparent;border:0;color:#236dac;padding:11px;font-size:12px}.secondary:hover{text-decoration:underline}button:disabled{cursor:default;opacity:.55;transform:none!important}.steps{display:flex;gap:5px;margin:3px 0 16px}.steps span{height:3px;width:23px;background:#e8edef;border-radius:4px}.steps .active{background:#d9af43}.steps .done{background:#075da6}.details{margin:8px 0 16px;font-size:12px;color:#668095}summary{list-style:none;color:#52778e;font-size:12px}summary::after{content:' +';color:#075da6}.row{display:flex;justify-content:space-between;gap:12px;margin:9px 0;font-size:12px}.row strong{direction:ltr}.list{padding:0;margin:14px 0;list-style:none}.item{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #eef0ee}.item img{width:42px;height:48px;object-fit:cover;border-radius:9px;background:#edf2f5}.item div{min-width:0;flex:1}.name{font-size:12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.spec{font-size:10px;color:#7c8d95;margin-top:3px}.qty{font-size:12px;color:#547185}.notice{font-size:12px;color:#866c3f;background:#fff6df;border-radius:12px;padding:10px;margin-bottom:12px}.address{font-size:11px;color:#57748b;word-break:break-all;margin:8px 0}.mail{white-space:pre-wrap;max-height:140px;overflow:auto;font-size:12px;color:#395b70}.message{font-size:12px;color:#637f8b;margin:10px 0}.pop{animation:amount .28s ease-out}.review{border-top:1px solid #e7ecef;padding-top:10px}
      .panel{display:flex;flex-direction:column;overflow:hidden;max-height:min(560px,calc(100dvh - 110px))}.head{padding:14px 18px 8px}.content{padding-inline:18px}h2{font-size:21px;margin:6px 0 8px}p{margin-bottom:10px}.pricebox{padding:13px;margin:12px 0}.price{font-size:27px}.list{max-height:min(160px,22dvh);margin:10px 0}.actions{flex:none;padding:0 18px 14px}.message:empty{display:none}.content{padding-bottom:8px}.content:has(.details[open]) .list{max-height:min(96px,14dvh)}.head{flex:none}.content{min-height:0;overflow:auto;overscroll-behavior:contain}.list{max-height:min(210px,28dvh);overflow:auto;overscroll-behavior:contain;padding-inline-end:6px;scrollbar-gutter:stable}.content,.list,.mail{scrollbar-width:thin;scrollbar-color:#a5bdcf transparent}.content::-webkit-scrollbar,.list::-webkit-scrollbar,.mail::-webkit-scrollbar{width:5px}.content::-webkit-scrollbar-button,.list::-webkit-scrollbar-button,.mail::-webkit-scrollbar-button{display:none;width:0;height:0}.content::-webkit-scrollbar-thumb,.list::-webkit-scrollbar-thumb,.mail::-webkit-scrollbar-thumb{background:#a5bdcf;border-radius:8px}.content::-webkit-scrollbar-thumb:hover,.list::-webkit-scrollbar-thumb:hover{background:#236dac}.row{align-items:baseline}.row strong{text-align:end;overflow-wrap:anywhere;font-weight:600}.launcher[aria-busy=true] .tag{opacity:1}.launcher[aria-busy=true] #badge,:host([data-updating=true]) #amount{opacity:.55}#badge,#amount{display:inline-block;transition:opacity .18s}.details[open] summary::after{content:' −'}
      .content .list{max-height:min(130px,18dvh)}.content:has(.details[open]) .list{max-height:min(96px,14dvh)}
      #passwordHint{font-size:11px;line-height:1.4;margin:6px 0 0}.actions #secondary,.actions #back{width:49%;display:inline-block;padding:8px}.credential{position:relative;margin:14px 0;padding:11px 12px;background:#fff6dc;border:1px solid #e8d8aa;border-radius:11px;box-shadow:0 2px 5px #745f2310}.credential::before{content:"";position:absolute;top:0;inset-inline:12px;height:2px;background:repeating-linear-gradient(100deg,#cfb873 0 10px,transparent 10px 17px)}.credential label{display:block;font-size:11px;color:#718187;margin-bottom:5px}.credential input{display:block;width:100%;min-width:0;height:42px;border:1px solid #deded8;border-radius:10px;background:#fffdf6;padding:10px 42px 10px 10px;font:12px ui-monospace,Consolas,monospace;color:#203d4b;text-overflow:ellipsis;direction:ltr}.credential .secondary{position:absolute;right:16px;top:35px;width:32px;height:32px;padding:7px;border-radius:7px;color:#52778e}.credential .secondary:hover{background:#f0f0eb}.credential svg{width:17px;height:17px;display:block}.message.error{background:#fff0e9;border:1px solid #e5a88e;border-inline-start:4px solid #b64419;border-radius:9px;color:#8b2f0d;padding:11px;font-weight:600;font-size:13px}.message.error:empty{display:none}
      @media(max-width:600px){:host{bottom:calc(76px + env(safe-area-inset-bottom,0px))!important}.panel{max-height:min(560px,calc(100dvh - 174px - env(safe-area-inset-bottom,0px)))}}
      @keyframes arrive{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}@keyframes amount{50%{opacity:.65;transform:translateY(-2px)}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
    </style><section class="panel" id="panel" role="region" hidden><header class="head"><img class="logo" alt=""><div class="wordmark">TEMBY</div><button id="close" class="close">\u00d7</button></header><div class="content"><div class="steps" aria-hidden="true"><span></span><span></span><span></span></div><h2 id="title"></h2><p id="intro"></p><div id="pricebox" class="pricebox"><div class="count" id="count"></div><div id="amount" class="price">\u2014 DZD</div><div class="hint" id="estimate"></div></div><ul id="items" class="list" hidden></ul><details id="details" class="details" hidden><summary id="detailLabel"></summary><div class="row"><span id="rateLabel"></span><strong id="rate"></strong></div><div class="row"><span id="temuNetLabel"></span><strong id="temuNet"></strong></div><div class="row"><span id="convertedLabel"></span><strong id="converted"></strong></div><div class="row"><span id="serviceLabel"></span><strong id="service"></strong></div><div class="row"><span id="estimateTotalLabel"></span><strong id="estimateTotal"></strong></div></details><div id="accountTools" hidden><p id="testNote" class="notice" hidden></p><div id="emailTools" class="credential" hidden><label id="emailLabel" for="emailValue"></label><input id="emailValue" type="text" readonly dir="ltr" autocomplete="off"><button id="copyEmail" class="secondary"></button></div><div id="passwordTools" class="credential" hidden><label id="passwordLabel" for="passwordValue"></label><input id="passwordValue" type="text" dir="ltr" readonly autocomplete="off" ><button id="copyPassword" class="secondary"></button><p id="passwordHint"></p></div><button id="code" class="secondary" hidden></button><div id="mail" class="mail"></div></div><div id="review" class="review" hidden><div class="row"><span id="method"></span><strong id="fee"></strong></div><div class="row"><span id="totalLabel"></span><strong id="total"></strong></div></div></div><footer class="actions"><div id="message" class="message" role="status"></div><button id="primary" class="primary"></button><button id="secondary" class="secondary" hidden></button><button id="back" class="secondary" hidden></button></footer></section><button id="bubble" class="launcher" aria-expanded="false" aria-controls="panel"><span class="orb"><img class="logo" alt=""></span><span class="tag"><span id="badge">\u2014 DZD</span></span></button>`;
    const $=id=>root.getElementById(id);
    root.querySelector('style').textContent+=':host([data-cart-issue]) #badge,:host([data-cart-issue]) #amount{opacity:.55}';
    const warning=doc.createElement('div');warning.id='cartWarning';warning.className='notice';warning.setAttribute('role','status');warning.hidden=true;$('message').before(warning);
    root.querySelectorAll('.logo').forEach(el=>el.src=self.__tembyCompanionIcon);
    $('emailLabel').textContent=t.emailLabel;$('copyEmail').textContent=t.copyEmail;$('copyEmail').onclick=async()=>{try{await page.navigator.clipboard.writeText(mailAddress);}catch{$('emailValue').focus();$('emailValue').select();}};
    const copyIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></svg>';for(const [id,label]of [['copyEmail',t.copyEmail],['copyPassword',t.copyPassword]]){$(id).innerHTML=copyIcon;$(id).setAttribute('aria-label',label);$(id).title=label;}
    $('passwordLabel').textContent=t.passwordLabel;$('copyPassword').onclick=async()=>{try{await page.navigator.clipboard.writeText(generatedPassword);$('message').textContent=t.passwordCopied;}catch{$('passwordValue').focus();$('passwordValue').select();}};
    $('panel').dir=ar?'rtl':'ltr';$('panel').lang=ar?'ar':'fr';$('panel').setAttribute('aria-label',t.open);$('bubble').setAttribute('aria-label',t.open);$('close').setAttribute('aria-label',t.close);doc.documentElement.append(host);
    let rates={USD:25000,EUR:27500};try{const r=JSON.parse(storageGet('temby-rates')||'null');if(r){core.quote(0,'USD',r);core.quote(0,'EUR',r);rates=r;}}catch{}
    const dzd=n=>new Intl.NumberFormat('fr-DZ',{minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100)+' DZD';
    let opened=false,step='cart',intent=false,browseMode=false,latest=null,cached=[],observed=[],lastRender='',mailAddress='',setup=false,requested=false;
    let loginWasVisible=false,signInWasVisible=null,cacheScanned=false;
    let updating=false,lastTrace='',generatedPassword='',mailBusy=false,cartInvalidatedAt=0;
    const flowKey='temby-setup-v1:'+page.__uv.meta.url.origin;
    let readiness={account:null,address:null};
    const loadReadiness=()=>{readiness={account:null,address:null};try{const value=JSON.parse(sharedGet(flowKey)||'null');if(value&&Date.now()-value.updatedAt>=0&&Date.now()-value.updatedAt<1800000){const account=value.account;readiness.account=account&&[0,1].includes(account.status)&&Number.isSafeInteger(account.evidenceAt)?account:null;readiness.address=value.address?.source==='customer-confirmation'&&Number.isSafeInteger(value.address.confirmedAt)?value.address:null;if(Number.isSafeInteger(value.cartInvalidatedAt)&&value.cartInvalidatedAt>cartInvalidatedAt&&value.cartInvalidatedAt<=Date.now()){cartInvalidatedAt=value.cartInvalidatedAt;cartIssue=null;cartIssueAt=0;host.removeAttribute('data-cart-issue');latest=null;cached=[];observed=[];}}}catch{}};
    const saveReadiness=()=>{try{sharedSet(flowKey,JSON.stringify({...readiness,cartInvalidatedAt,updatedAt:Date.now()}));}catch{}};
    loadReadiness();try{intent=storageGet('temby-order-intent')==='1';}catch{}
    page.addEventListener('storage',event=>{if(event.key===flowKey){loadReadiness();update();}});
    const setIntent=value=>{intent=value;browseMode=!value;try{storageSet('temby-order-intent',value?'1':'0');}catch{}};
    const filled=new WeakSet();try{setup=storageGet('temby-test-setup')==='1';storageRemove('temby-account-mode');}catch{}
    const visible=el=>!!el&&el.getClientRects().length>0&&page.getComputedStyle(el).visibility!=='hidden'&&!el.closest('[aria-hidden="true"]');
    const signIn=()=>[...doc.querySelectorAll('[role="button"],button')].find(el=>visible(el)&&/sign in.*register|\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644\s*\/\s*\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628|connexion.*inscri/i.test(el.getAttribute('aria-label')||el.textContent));
    const emailField=()=>{
      const inputs=[...doc.querySelectorAll('input')].filter(el=>visible(el)&&!el.disabled&&!el.readOnly&&['text','email'].includes(el.type)&&/email|e-mail|\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a/i.test([el.type==='email'?'email':'',el.getAttribute('aria-label'),el.placeholder,el.name,el.autocomplete].join(' ')));
      return inputs.length===1?inputs[0]:null;
    };
    function fillEmail(){
      const el=emailField();if(!el){$('message').textContent=t.needField;return false;}
      if(el.value&&el.value!==mailAddress){$('message').textContent=t.keep;return false;}
      if(!filled.has(el)){nativeSet.call(el,mailAddress);el.dispatchEvent(new page.Event('input',{bubbles:true}));el.dispatchEvent(new page.Event('change',{bubbles:true}));filled.add(el);}
      $('message').textContent=t.filled;return true;
    }
    const passwordFields=()=>[...doc.querySelectorAll('input')].filter(el=>visible(el)&&!el.disabled&&!el.readOnly&&(el.type==='password'||el.autocomplete==='new-password'||el.type==='text'&&/password/i.test(el.name+' '+el.getAttribute('aria-label'))));
    function fillNewPassword(explicit=false){
      if(!setup||!mailAddress||readiness.account?.status===1)return false;
      const fields=passwordFields().filter(el=>explicit||el.autocomplete!=='current-password');
      if(fields.length!==1){if(explicit)$('message').textContent=t.passwordWait;return false;}
      if(fields[0].value){if(explicit)$('message').textContent=t.passwordKeep;return false;}
      const email=emailField();if(email?.value&&email.value!==mailAddress)return false;
      try{generatedPassword||=core.password(page.crypto);nativeSet.call(fields[0],generatedPassword);fields[0].dispatchEvent(new page.Event('input',{bubbles:true}));fields[0].dispatchEvent(new page.Event('change',{bubbles:true}));
        $('passwordTools').hidden=false;$('passwordValue').value=generatedPassword;$('passwordHint').textContent=t.passwordHint;if(explicit)$('message').textContent=t.passwordFilled;return true;
      }catch{if(explicit)$('message').textContent=t.needField;return false;}
    }
    const toggle=value=>{opened=value;$('panel').hidden=!value;$('bubble').setAttribute('aria-expanded',String(value));if(value){update();$('close').focus();}else $('bubble').focus();};
    $('bubble').onclick=()=>toggle(!opened);$('close').onclick=()=>toggle(false);root.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened){e.stopPropagation();toggle(false);}});
    function activate(selector){const el=[...doc.querySelectorAll(selector)].find(visible);if(!el)return false;el.click();return true;}
    function navigate(path){storageSet('temby-return-panel','1');page.location.assign(page.__uv.rewriteUrl(new URL(path,page.__uv.meta.url).href));}
    function browse(){setIntent(false);const path=page.__uv.meta.url.pathname;if(path==='/'||/\/index\.html$/.test(path))toggle(false);else navigate('/');}
    function openCart(){refreshCartCache();if(/\/shopping_cart\.html$/.test(page.__uv.meta.url.pathname))return;if(!activate('.Sidebar-GotoCartBtn'))navigate('/shopping_cart.html');}
    function openLogin(){if(passwordFields().length){fillNewPassword(true);return;}if(emailField()){if(mailAddress)fillEmail();return;}const el=signIn();if(el){el.click();page.setTimeout(()=>{if(emailField()){fillEmail();}else $('message').textContent=t.needField;},1200);}else navigate('/login.html?from='+encodeURIComponent(new URL('/',page.__uv.meta.url).href));}
    function openAddresses(){
      setIntent(true);
      // Verified in Temu's shipped account-menu module: Addresses \u2192 /address.html.
      const target=new URL('/address.html',page.__uv.meta.url);
      storageSet('temby-return-panel','1');
      page.location.assign(page.__uv.rewriteUrl(target.href));
    }
    function view(){
      const q=latest?core.quote(latest.minor,latest.currency,rates):null;
      $('pricebox').hidden=step==='account'||step==='shipping';$('estimate').textContent=cartIssue?t.cartRetry:updating?t.updating:t.estimate;$('count').textContent=latest?.quantity!=null?latest.quantity+' '+t.items:'';
      $('details').hidden=!q||step==='account'||step==='shipping';$('items').hidden=!latest?.items?.length||step!=='cart';$('detailLabel').textContent=t.detail;$('convertedLabel').textContent=t.converted;$('serviceLabel').textContent=t.service;
      if(q){
        const foreign=n=>new Intl.NumberFormat('fr-DZ',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100)+' '+latest.currency;
        $('rateLabel').textContent=t.rate;$('rate').textContent='1 '+latest.currency+' = '+dzd(q.rate);
        $('temuNetLabel').textContent=t.temuNet;$('temuNet').textContent=foreign(latest.minor)+' → '+dzd(q.converted);
        $('converted').textContent=dzd(q.converted);
        $('service').textContent=dzd(q.service);
        $('estimateTotalLabel').textContent=t.total;$('estimateTotal').textContent=dzd(q.bubble);
      }
      $('accountTools').hidden=step!=='account';$('review').hidden=step!=='review';$('secondary').hidden=true;$('back').hidden=step==='cart';$('back').textContent=t.back;$('primary').disabled=false;
      const cartReady=core.cartState(latest,updating)==='ready',blocker=cartReady?core.cartBlocker(latest):null;
      warning.hidden=step!=='cart'||!(cartIssue||blocker||latest?.unselectedInvalid);
      warning.textContent=cartIssue?t.cartRetry:blocker==='problem'?t.problem:blocker==='minimum'?(()=>{const money=n=>new Intl.NumberFormat(ar?'ar-DZ':'fr-DZ',{maximumFractionDigits:2}).format(n/100)+' '+latest.currency;return t.minimum+(ar?' باقي '+money(latest.minimum-latest.minor)+'؛ الحد الأدنى '+money(latest.minimum)+'.':' Il manque '+money(latest.minimum-latest.minor)+' ; minimum : '+money(latest.minimum)+'.');})():latest?.unselectedInvalid?t.unselectedProblem:'';
      root.querySelectorAll('.steps span').forEach((el,i)=>{const at={cart:0,account:1,shipping:2,review:3}[step];const done=i===1&&readiness.account?.status===1||i===2&&!!readiness.address;el.className=done||i<at?'done':i===at?'active':'';});
      if(step==='cart'){
        const state=core.cartState(latest,updating,!latest&&Date.now()-born<4000);
        $('title').textContent=t.cart;
        $('intro').textContent=t.intro;
        $('primary').textContent=cartIssue||blocker==='problem'?t.openCart:blocker==='minimum'?t.moreShopping:state==='empty'||state==='unavailable'?t.browse:t.next;$('primary').disabled=state==='loading'&&!cartIssue;
        $('items').replaceChildren(...(latest?.items||[]).filter(i=>i.selection!==false).map(item=>{const li=doc.createElement('li');li.className='item';if(item.image){const img=doc.createElement('img');img.alt='';img.src=item.image;li.append(img);}const body=doc.createElement('div'),name=doc.createElement('div'),spec=doc.createElement('div'),qty=doc.createElement('span');name.className='name';name.textContent=item.name;spec.className='spec';spec.textContent=item.specs;qty.className='qty';qty.textContent='\u00d7'+item.quantity;body.append(name,spec);li.append(body,qty);return li;}));
      }else if(step==='account'){
        $('title').textContent=t.account;$('intro').textContent=readiness.account?.status===1?t.accountRefresh:t.accountText;$('primary').textContent=readiness.account?.status===1?t.refresh:mailBusy?t.updating:t.fill;$('primary').disabled=mailBusy;
        $('testNote').hidden=true;$('testNote').textContent=t.testNote;$('emailTools').hidden=!mailAddress;$('emailValue').value=mailAddress;$('passwordTools').hidden=!generatedPassword;$('passwordValue').value=generatedPassword;$('passwordHint').textContent=t.passwordHint;$('code').hidden=!mailAddress;$('code').textContent=t.checkCode;
      }else if(step==='shipping'){
        $('title').textContent=t.shipping;$('intro').textContent=t.addressHint;$('primary').textContent=/\/address\.html$/.test(page.__uv.meta.url.pathname)?t.savedAddress:t.delivery;
      }else{
        $('title').textContent=t.review;$('intro').textContent=t.reviewText;$('method').textContent=t.card;$('fee').textContent=q?dzd(q.card):'\u2014';$('totalLabel').textContent=t.total;$('total').textContent=q?dzd(q.total):'\u2014';$('primary').textContent=t.paymentUnavailable;$('primary').disabled=true;
      }
    }
    function update(){
      const current=adapter.select(observed,Date.now(),{minTime:cartInvalidatedAt})
        ||adapter.select(cached,Date.now(),{minTime:cartInvalidatedAt});
      if(current&&confirmationTime(current)>=cartIssueAt){cartIssue=null;host.removeAttribute('data-cart-issue');}
      const now=Date.now();latest=current;updating=cartReadPending;
      const traceKey=JSON.stringify(current&&[current.source,current.time,current.minor,current.quantity,current.selectedInvalid,current.unselectedInvalid]);
      if(traceKey!==lastTrace){lastTrace=traceKey;adapter.trace(page,current?'selected':'unavailable',current?{source:current.source,time:current.time,ageMs:now-current.time,totalMinor:current.minor,currency:current.currency,items:current.items.length,selectedUnits:current.quantity,invalidLines:current.invalid,selectedInvalid:current.selectedInvalid,unselectedInvalid:current.unselectedInvalid}:{reason:'no-supported-current-cart'});}
      const pathname=page.__uv?.meta?.url?.pathname||'';
      const loginPage=!!emailField();
      // A newly visible login form or reappearing sign-in control invalidates
      // previous account/address readiness, including within this document.
      const signInVisible=!!signIn();
      if(readiness.account?.status===1&&(loginPage&&!loginWasVisible||signInWasVisible===false&&signInVisible)){readiness={account:{status:0,evidenceAt:now},address:null};saveReadiness();}
      loginWasVisible=loginPage;signInWasVisible=signInVisible;
      if(loginPage)step='account';
      else if(!browseMode&&(intent||/\/address\.html$/.test(pathname)))step=!cacheScanned&&readiness.account==null?'cart':core.setupStep(readiness);
      else step='cart';
      const amount=latest?dzd(core.quote(latest.minor,latest.currency,rates).bubble):'\u2014 DZD';
      if($('badge').textContent!==amount){$('badge').textContent=$('amount').textContent=amount;$('badge').classList.remove('pop');void $('badge').offsetWidth;$('badge').classList.add('pop');}
      $('bubble').setAttribute('aria-busy',String(updating&&!!latest));host.setAttribute('data-price-source',latest?.source||'unavailable');host.setAttribute('data-updating',String(updating));
      $('bubble').setAttribute('aria-label',cartIssue?t.cartRetry:t.open);$('bubble').title=cartIssue?t.cartRetry:t.open;
      const key=JSON.stringify([latest,step,mailAddress,updating,readiness,mailBusy,cartIssue,core.cartState(latest,updating,!latest&&Date.now()-born<4000)]);if(key!==lastRender){lastRender=key;view();}
      if(step==='account'&&readiness.account?.status!==1&&!mailAddress&&!requested){void getTestEmail(false);}
      if(setup&&emailField()&&readiness.account?.status!==1){if(!mailAddress&&!requested&&!emailField().value){requested=true;void getTestEmail(false);}else if(mailAddress&&!filled.has(emailField()))fillEmail();}
      fillNewPassword();
    }
    $('primary').onclick=()=>{
      $('message').textContent='';$('message').classList.remove('error');$('message').setAttribute('role','status');
      if(step==='cart'){
        if(cartIssue||core.cartBlocker(latest)==='problem'){openCart();return;}
        if(core.cartBlocker(latest)==='minimum'){browse();return;}
        if(updating){$('message').textContent=t.updating;return;}
        const state=core.cartState(latest,updating,!latest&&Date.now()-born<4000);
        if(state==='loading')return;if(state==='empty'){browse();return;}if(state!=='ready'){browse();return;}
        setIntent(true);step=core.setupStep(readiness);view();if(step==='account')void getTestEmail(true);
      }else if(step==='account'){if(readiness.account?.status===1){page.location.reload();return;}if(mailAddress){if(passwordFields().length)fillNewPassword(true);else openLogin();}else void getTestEmail(true);}
      else if(step==='shipping'){if(/\/address\.html$/.test(page.__uv.meta.url.pathname)){readiness.address={confirmedAt:Date.now(),source:'customer-confirmation'};saveReadiness();step='review';view();}else openAddresses();}
    };
    $('back').onclick=()=>{setIntent(false);step='cart';$('message').textContent='';view();};
    function mail(method='GET'){
      return new Promise((resolve,reject)=>{const channel=new page.MessageChannel(),timer=page.setTimeout(()=>{channel.port1.close();reject(Error('timeout'));},25000);channel.port1.onmessage=e=>{page.clearTimeout(timer);channel.port1.close();e.data?.ok?resolve(e.data.data):reject(Error('worker-response'));};try{send({tembyMail:method},[channel.port2]);}catch{page.clearTimeout(timer);channel.port1.close();channel.port2.close();reject(Error('worker-unavailable'));}});
    }
    async function getTestEmail(navigate){
      if(mailBusy)return;mailBusy=true;requested=true;
      $('primary').disabled=true;
      try{const data=await mail('POST');mailAddress=data.address;generatedPassword||=core.password(page.crypto);setup=true;try{storageSet('temby-account-mode','new');}catch{}setIntent(true);try{storageSet('temby-test-setup','1');}catch{}view();if(!fillEmail()&&navigate)openLogin();}
      catch(error){host.setAttribute('data-mail-error',error.message);if(step==='account')$('message').textContent=t.mailError;}finally{mailBusy=false;$('primary').disabled=false;}
    }
    $('code').onclick=async()=>{$('code').disabled=true;$('message').textContent=t.checking;try{const data=await mail();$('mail').textContent=data.messages.map(m=>m.subject+'\n'+m.text).join('\n\n');$('message').textContent=data.messages.length?'':t.noCode;}catch{$('message').textContent=t.mailError;}finally{$('code').disabled=false;}};
    doc.addEventListener('click',event=>{
      const control=event.target?.closest?.('button,a,[role="button"]');
      if(!control||!/^\s*(?:sign\s*out|log\s*out|logout|déconnexion|se déconnecter|تسجيل الخروج|تسجيل خروج|خروج)\s*$/i.test(control.getAttribute('aria-label')||control.textContent||''))return;
      cartIssue=null;cartIssueAt=0;host.removeAttribute('data-cart-issue');cartInvalidatedAt=Date.now();try{send({tembyCartInvalidate:true});}catch{}readiness={account:{status:0,evidenceAt:cartInvalidatedAt},address:null};saveReadiness();cached=[];observed=[];latest=null;setIntent(true);update();
    },true);
    const acceptAccount=facts=>{
      const account=adapter.accountStatus(facts||[]);
      if(account&&account.time>(readiness.account?.evidenceAt||0)&&!(account.status===1&&emailField()&&account.time<born)){
        readiness.account={status:account.status,evidenceAt:account.time};if(account.status===0)readiness.address=null;saveReadiness();
      }
    };
    receiveReadState=()=>update();
    receiveCart=data=>{
      const fresh=data.carts.filter(c=>c.time>=cartInvalidatedAt);
      if(!fresh.length){adapter.trace(page,'ignored',{source:'response',reason:'older-than-cart-invalidation'});return;}
      const newest=Math.max(...fresh.map(c=>c.time));
      if(newest<Math.max(0,...observed.map(c=>c.time))){adapter.trace(page,'ignored',{source:'response',reason:'older-than-visible-response',time:newest});return;}
      if(Math.max(...fresh.map(confirmationTime))>=cartChangedAt)cartChangedAt=0;
      observed=fresh;adapter.trace(page,'received',{source:'response',time:newest,totalMinor:fresh[0].minor,currency:fresh[0].currency,items:fresh[0].items.length});acceptAccount(data.facts);update();
    };
    receiveIssue=issue=>{
      if(['unsupported-schema','unsupported-content'].includes(issue.reason)){adapter.trace(page,'ignored',{source:'response',reason:issue.reason,status:issue.status});page.setTimeout(refreshCartCache,0);return;}
      const time=issue.time;
      if(!Number.isSafeInteger(time)||time<cartInvalidatedAt||time<cartIssueAt)return;
      if(Number.isSafeInteger(issue.changedAt)&&issue.changedAt>0&&issue.changedAt<=time)cartChangedAt=Math.max(cartChangedAt,issue.changedAt);
      const known=adapter.select(observed,Date.now(),{minTime:cartInvalidatedAt})
        ||adapter.select(cached,Date.now(),{minTime:cartInvalidatedAt});
      // A fresh empty cart is normal. After a confirmed mutation, however, a
      // refused refresh must mark even a saved zero as no longer current.
      const confirmedAt=confirmationTime(known);
      if(!known||time<=confirmedAt||core.cartState(known,false)!=='ready'&&cartChangedAt<=confirmedAt)return;
      cartIssue=issue.reason;cartIssueAt=time;host.setAttribute('data-cart-issue',cartIssue);update();
    };
    if(pendingCart){receiveCart(pendingCart);pendingCart=null;}
    if(pendingIssue){receiveIssue(pendingIssue);pendingIssue=null;}
    const cacheReader=adapter.observe(page,(entries,facts)=>{cacheScanned=true;cached=entries;acceptAccount(facts);update();},meta=>host.setAttribute('data-cart-cache',JSON.stringify(meta)),dbAccess);
    refreshCartCache=()=>cacheReader.refresh?.();
    doc.addEventListener('visibilitychange',()=>{if(!doc.hidden){try{send({tembyCartRead:{since:page.performance.timeOrigin,clientRead:1}});}catch{}update();}});
    update();page.setInterval(()=>{if(!doc.hidden)update();},500);
    try{if(storageGet('temby-return-panel')==='1'){storageRemove('temby-return-panel');toggle(true);}}catch{}
  };
  if(page.document.readyState==='loading')page.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
};
