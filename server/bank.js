// A UPI QR carries only: pa (UPI ID), pn (name), sometimes mc (merchant category). It never contains an account number.
// We can derive the app/bank from the UPI handle (the part after @). Anything else would need the bank's own consent flow.
const H={ // handle -> [app, bank]
  okaxis:['Google Pay','Axis Bank'],okhdfcbank:['Google Pay','HDFC Bank'],okicici:['Google Pay','ICICI Bank'],oksbi:['Google Pay','State Bank of India'],
  apl:['Amazon Pay','Axis Bank'],yapl:['Amazon Pay','ICICI Bank'],rapl:['Amazon Pay','RBL Bank'],
  ybl:['PhonePe','Yes Bank'],ibl:['PhonePe','ICICI Bank'],axl:['PhonePe','Axis Bank'],
  paytm:['Paytm','Paytm Payments Bank'],ptys:['Paytm','Yes Bank'],pthdfc:['Paytm','HDFC Bank'],ptsbi:['Paytm','State Bank of India'],ptaxis:['Paytm','Axis Bank'],
  upi:['BHIM','NPCI'],sbi:['BHIM / SBI Pay','State Bank of India'],hdfcbank:['HDFC Bank','HDFC Bank'],icici:['ICICI iMobile','ICICI Bank'],axisbank:['Axis Bank','Axis Bank'],
  okbizaxis:['Google Pay for Business','Axis Bank'],postbank:['India Post Payments Bank','IPPB'],ikwik:['MobiKwik','MobiKwik']};
export const UPI_RE=/^[a-z0-9][\w.\-]{1,48}@[a-z][a-z0-9]{1,30}$/i;
export function parseUpiQr(data){
  if(typeof data!=='string'||data.length>600||!/^upi:\/\/pay\?/i.test(data)) return null;
  let p; try{p=new URLSearchParams(data.slice(data.indexOf('?')+1));}catch{return null;}
  const upi=(p.get('pa')||'').trim().toLowerCase(); if(!UPI_RE.test(upi)) return null;
  return {upi,name:(p.get('pn')||'').replace(/[\u0000-\u001F]/g,'').trim().slice(0,80)||'Artisan'}; }
export function bankInfo(upi){
  const h=(upi.split('@')[1]||'').toLowerCase(), m=H[h];
  return {handle:h,app:m?m[0]:'UPI app',bank:m?m[1]:'Unknown bank (handle not recognised)',recognised:!!m,
    // Honest limit: no account number is available from a QR. Never claim otherwise in the UI.
    accountNumber:null,maskedUpi:maskUpi(upi)}; }
export const maskUpi=u=>{const [n,h]=u.split('@'); return (n.length<=3?n[0]+'*'.repeat(n.length-1):n.slice(0,2)+'*'.repeat(Math.max(2,n.length-4))+n.slice(-2))+'@'+h;};
