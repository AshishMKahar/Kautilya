// Business logic (auth + marketplace orders + escrow). Pure functions over {store, gateway}; HTTP lives in index.js.
import {sha256,randToken,safeEq,otp,clean} from './security.js';
import {bankInfo} from './bank.js';
import {mockBank} from './payments.js';
export class HttpError extends Error{constructor(status,msg){super(msg);this.status=status;}}
const E=(s,m)=>new HttpError(s,m);
export const AUTO_RELEASE_DAYS=7, UNPAID_MINUTES=30, OTP_MINUTES=10, MAX_OTP_TRIES=5, ACCESS_TTL=15*60, REFRESH_DAYS=30;
export const money=(price,qty)=>Math.round(price*100*qty)/100;
const PENDING=['paid','shipped','disputed'], LABEL={awaiting_payment:'Awaiting payment',paid:'Paid, held in escrow',shipped:'Shipped',completed:'Completed',refunded:'Refunded',cancelled:'Cancelled',disputed:'Problem reported'};

// ---------- auth ----------
export function authService({store,sign,exposeMockCode=false,now=()=>new Date()}){
  const issue=async(uid,family=randToken(12))=>{const id=randToken(12),secret=randToken(32);
    await store.addSession({id,uid,family,hash:sha256(secret),exp:new Date(now().getTime()+REFRESH_DAYS*864e5)});
    return {token:sign(uid),expiresIn:ACCESS_TTL,refreshToken:`${id}.${secret}`};};
  return {
    // Step 1: QR scanned -> we derive bank/app info and "credit" Rs 1 with a code (mock). Same response whether or not the account exists.
    async start({upi,name}){ name=clean(name).slice(0,80)||'Artisan'; const old=await store.getChallenge(upi);
      if(old&&old.exp.getTime?.()-OTP_MINUTES*6e4+3e4>now().getTime()) throw E(429,'Please wait 30 seconds before asking for a new code');
      const code=otp(); await store.putChallenge(upi,{code_hash:sha256(upi+':'+code),name,exp:new Date(now().getTime()+OTP_MINUTES*6e4)});
      await store.audit(upi,'auth.start'); const bank=bankInfo(upi);
      return {bank,name,sent:true,expiresInMinutes:OTP_MINUTES,...(exposeMockCode?{mock:{amount:mockBank.amount,narration:mockBank.narration(code),code}}:{})}; },
    // Step 2: prove you can see the credit (code) -> account created/updated, tokens issued.
    async verify({upi,code,name}){ const c=await store.getChallenge(upi);
      if(!c||c.exp.getTime()<now().getTime()) throw E(400,'Code expired. Scan the QR again');
      if(c.attempts>=MAX_OTP_TRIES){await store.dropChallenge(upi);await store.audit(upi,'auth.locked');throw E(429,'Too many wrong codes. Scan the QR again');}
      if(!safeEq(sha256(upi+':'+code),c.code_hash)){const n=await store.bumpChallenge(upi);await store.audit(upi,'auth.bad_code',{n});throw E(401,'Wrong code');}
      await store.dropChallenge(upi);
      const profile=await store.upsertUser({uid:upi,upi,name:clean(name||'').slice(0,80)||c.name,bank:bankInfo(upi),verified:true}); await store.audit(upi,'auth.ok');
      return {...(await issue(upi)),profile:publicProfile(profile)}; },
    // Rotating refresh tokens. Reusing an old one means theft or replay: the whole family is revoked.
    async refresh(rt){ const [id,secret]=String(rt||'').split('.'); const s=id&&secret?await store.getSession(id):null;
      if(!s||s.revoked||s.exp.getTime()<now().getTime()||!safeEq(sha256(secret),s.hash)) throw E(401,'Login again');
      if(!(await store.useSession(id))){await store.revokeFamily(s.family);await store.audit(s.uid,'auth.refresh_reuse');throw E(401,'Login again');}
      return issue(s.uid,s.family); },
    async logout(uid){await store.revokeUser(uid);await store.audit(uid,'auth.logout');},
    // Demo login (DEMO_MODE=1 only, wired in index.js): one-tap sign-in as a seeded artisan, no UPI QR needed. Never exposed otherwise.
    async demo(){ const upi='demo.artisan@okaxis'; const profile=await store.upsertUser({uid:upi,upi,name:'Lakshmi Devi (Demo)',bank:bankInfo(upi),verified:true}); await store.audit(upi,'auth.demo');
      return {...(await issue(upi)),profile:publicProfile(profile)}; } }; }
export const publicProfile=u=>({uid:u.uid,name:u.name,upi:u.upi,bank:u.bank||bankInfo(u.upi),verified:!!u.verified});

// ---------- orders + escrow ----------
export function orderService({store,gateway,now=()=>new Date()}){
  const note=(uid,order_id,kind,text)=>store.addNote(uid,{order_id,kind,text});
  const name=async uid=>(await store.getUser(uid))?.name||'Someone';
  const mine=async(id,uid)=>{const o=await store.getOrder(id); if(!o||(o.buyer!==uid&&o.seller!==uid)) throw E(404,'Order not found'); return o;}; // 404 not 403: do not reveal other people's orders exist
  const back=async o=>{await store.releaseStock(o.item_id,o.qty);};
  return {
    async create(buyer,{itemId,qty,shipTo}){ const it=await store.getItem(itemId); if(!it) throw E(404,'Item not found'); if(it.seller===buyer) throw E(400,'You cannot order your own item');
      if(!(await store.reserveStock(itemId,qty))) throw E(409,'Not enough stock');
      const o=await store.addOrder({item_id:it.id,qty,buyer,seller:it.seller,amount:money(it.price,qty),channel:'app',ship_to:clean(shipTo)});
      await note(it.seller,o.id,'new_order',`New order #${o.id}: ${qty} × ${it.title_en}. Waiting for buyer payment.`); return view(o); },
    async pay(buyer,id,{simulate}={}){ const o=await mine(id,buyer); if(o.buyer!==buyer) throw E(403,'Only the buyer can pay'); if(o.status!=='awaiting_payment') throw E(409,'Order is not awaiting payment');
      const r=await gateway.charge({orderId:o.id,amount:o.amount,simulate}); if(!r.ok) throw E(402,r.error||'Payment failed');
      const t=await store.transition(id,['awaiting_payment'],'paid',buyer,{payment_id:r.paymentId});
      if(!t){await gateway.refund({paymentId:r.paymentId,amount:o.amount}); throw E(409,'Order changed, payment returned');} // lost a race (e.g. expired): never keep money without an order
      await note(t.seller,id,'paid',`Order #${id} is paid and held safely in escrow. Please ship it.`); return view(t); },
    async ship(seller,id,{tracking}={}){ const o=await mine(id,seller); if(o.seller!==seller) throw E(403,'Only the seller can ship');
      const t=await store.transition(id,['paid'],'shipped',seller,{tracking:clean(tracking||'').slice(0,120)||null,auto_release_at:new Date(now().getTime()+AUTO_RELEASE_DAYS*864e5)});
      if(!t) throw E(409,'Order cannot be shipped now'); await note(t.buyer,id,'shipped',`Order #${id} has been shipped${t.tracking?` (${t.tracking})`:''}. Confirm when it arrives.`); return view(t); },
    async confirm(buyer,id){ const o=await mine(id,buyer); if(o.buyer!==buyer) throw E(403,'Only the buyer can confirm'); return release(o,buyer,'Buyer confirmed delivery'); },
    async cancel(uid,id){ const o=await mine(id,uid); const paid=o.status==='paid'; if(o.seller===uid&&!paid) throw E(409,'Seller can cancel only a paid, unshipped order');
      const t=await store.transition(id,['awaiting_payment','paid'],paid?'refunded':'cancelled',uid,{}); if(!t) throw E(409,'Order can no longer be cancelled');
      if(paid){const rf=await gateway.refund({paymentId:o.payment_id,amount:o.amount}); await store.transition(id,['refunded'],'refunded','system',{refund_id:rf.refundId});}
      await back(o); const other=uid===o.buyer?o.seller:o.buyer; await note(other,id,'cancelled',`Order #${id} was cancelled${paid?' and the buyer was refunded':''}.`); return view(await store.getOrder(id)); },
    async dispute(buyer,id){ const o=await mine(id,buyer); if(o.buyer!==buyer) throw E(403,'Only the buyer can report a problem');
      const t=await store.transition(id,['shipped'],'disputed',buyer,{auto_release_at:null}); if(!t) throw E(409,'You can report a problem only after shipping');
      await note(t.seller,id,'disputed',`${await name(buyer)} reported a problem with order #${id}. Payment stays held until it is resolved.`); return view(t); },
    async get(uid,id){const o=await mine(id,uid); return {...view(o),events:await store.orderEvents(id)};},
    // Called by the background worker.
    async sweep(){ let n=0;
      for(const o of await store.dueAutoRelease(now())){ try{await release(o,'system','Auto-released after '+AUTO_RELEASE_DAYS+' days');n++;}catch{} }
      for(const o of await store.staleUnpaid(new Date(now().getTime()-UNPAID_MINUTES*6e4))){ const t=await store.transition(o.id,['awaiting_payment'],'cancelled','system'); if(t){await back(o);await note(o.buyer,o.id,'expired',`Order #${o.id} expired because it was not paid in ${UNPAID_MINUTES} minutes.`);n++;} }
      return n; } };
  async function release(o,actor,why){ const t=await store.transition(o.id,['shipped'],'completed',actor); if(!t) throw E(409,'Order cannot be completed now'); // atomic: only one caller wins, so money is released once
    const p=await gateway.payout({sellerUpi:o.seller,amount:o.amount}); await store.transition(o.id,['completed'],'completed','system',{payout_id:p.payoutId});
    await note(o.seller,o.id,'released',`₹${o.amount} for order #${o.id} was released to your account. ${why}.`); return view(await store.getOrder(o.id)); }
}
export const view=o=>({id:o.id,itemId:o.item_id,qty:o.qty,amount:o.amount,status:o.status,statusLabel:LABEL[o.status]||o.status,channel:o.channel,escrow:o.escrow,tracking:o.tracking,at:o.at,updatedAt:o.updated_at});
export const isPending=s=>PENDING.includes(s);
