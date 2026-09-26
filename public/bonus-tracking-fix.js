(function(){
  'use strict';

  function amount(v){
    const n=Number(v||0);
    return Number.isFinite(n)?n:0;
  }

  function correctedBonusAddOn(snapshot){
    if(!snapshot) return 0;
    const tracking=amount(snapshot.tracking);
    const trackingPay=tracking>=50 ? tracking*2 : tracking;
    return trackingPay+
      amount(snapshot.pollen)+
      amount(snapshot.bfc)+
      amount(snapshot.diag)+
      amount(snapshot.coolant)+
      amount(snapshot.ac);
  }

  // At 50 trackings the whole tracking rate becomes £2 each:
  // 49 = £49, 50 = £100, 51 = £102.
  try{ window.bonusAddOn=correctedBonusAddOn; }catch(_e){}
  try{ bonusAddOn=correctedBonusAddOn; }catch(_e){}
})();
