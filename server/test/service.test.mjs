import test from 'node:test'; import assert from 'node:assert/strict';
import {memoryStore} from '../store.js'; import {mockGateway} from '../payments.js'; import {authService,orderService,HttpError} from '../service.js';
let t0=Date.now(); const clock={t:()=>new Date(t0)}; const adv=ms=>{t0+=ms;};
const setup=async()=>{ const store=memoryStore(); const A=authService({store,sign:u=>'jwt.'+u,exposeMockCode:true,now:clock.t}); const O=orderService({store,gateway:mockGateway(),now:clock.t});
  const login=async upi=>{const s=await A.start({upi,name:'N '+upi}); adv(31e3); return A.verify({upi,code:s.mock.code});};
  await login('seller@okaxis'); await login('buyer@okicici'); await login('other@ybl');
  const item=await store.addItem('seller@okaxis',{title_en:'Pot',desc_en:'d',desc_hi:'h',price:100.1,image:'I',channels:['app'],stock:3}); return {store,A,O,item}; };
const rejects=(p,status)=>assert.rejects(p,e=>e instanceof HttpError&&e.status===status,'expected HTTP '+status);

test('login: QR -> bank info + credit -> code -> tokens; wrong codes lock out; expiry; throttle',async()=>{
  const store=memoryStore(),A=authService({store,sign:u=>'jwt.'+u,exposeMockCode:true,now:clock.t});
  const s=await A.start({upi:'a@apl',name:'Asha'}); assert.equal(s.bank.app,'Amazon Pay'); assert.equal(s.bank.accountNumber,null); assert.match(s.mock.code,/^\d{6}$/);
  await rejects(A.start({upi:'a@apl',name:'x'}),429); adv(31e3);
  const s2=await A.start({upi:'a@apl',name:'Asha'}); const wrong=s2.mock.code==='000000'?'111111':'000000';
  for(let i=0;i<5;i++) await rejects(A.verify({upi:'a@apl',code:wrong}),401); await rejects(A.verify({upi:'a@apl',code:wrong}),429);
  await rejects(A.verify({upi:'a@apl',code:s2.mock.code}),400,'challenge dropped after lockout');
  adv(31e3); const s3=await A.start({upi:'a@apl',name:'Asha'}); adv(11*6e4); await rejects(A.verify({upi:'a@apl',code:s3.mock.code}),400);
  adv(31e3); const s4=await A.start({upi:'a@apl',name:'Asha'}); const ok=await A.verify({upi:'a@apl',code:s4.mock.code,name:'  Asha Devi '}); assert.equal(ok.profile.verified,true); assert.equal(ok.profile.name,'Asha Devi'); assert.ok(ok.token&&ok.refreshToken);
  await rejects(A.verify({upi:'a@apl',code:s4.mock.code}),400,'code is single use'); });
test('production: no code leaks in the scan response',async()=>{ const A=authService({store:memoryStore(),sign:u=>u,exposeMockCode:false,now:clock.t}); const s=await A.start({upi:'p@okaxis',name:'P'}); assert.equal(s.mock,undefined); assert.ok(!JSON.stringify(s).includes('code')); });
test('refresh tokens rotate; reuse revokes the family; logout revokes all',async()=>{
  const {A}=await setup(); const s=await A.start({upi:'z@okaxis',name:'Z'}); const l=await A.verify({upi:'z@okaxis',code:s.mock.code});
  const r1=await A.refresh(l.refreshToken); assert.notEqual(r1.refreshToken,l.refreshToken);
  await rejects(A.refresh(l.refreshToken),401);              // replay of the old token
  await rejects(A.refresh(r1.refreshToken),401);             // family now dead, even the "good" newer token
  await rejects(A.refresh('garbage'),401); await rejects(A.refresh(l.refreshToken.split('.')[0]+'.wrong'),401);
  adv(31e3); const s2=await A.start({upi:'z@okaxis',name:'Z'}); const l2=await A.verify({upi:'z@okaxis',code:s2.mock.code}); await A.logout('z@okaxis'); await rejects(A.refresh(l2.refreshToken),401); });

test('escrow happy path: order -> pay (held) -> ship -> confirm (released once) -> earnings count only when released',async()=>{
  const {store,O,item}=await setup(); const o=await O.create('buyer@okicici',{itemId:item.id,qty:2,shipTo:'12 MG Road, Pune 411001'});
  assert.equal(o.amount,200.2,'money math is exact'); assert.equal(o.status,'awaiting_payment'); assert.equal((await store.getItem(item.id)).stock,1);
  await rejects(O.pay('seller@okaxis',o.id),403); await rejects(O.pay('other@ybl',o.id),404);
  await rejects(O.pay('buyer@okicici',o.id,{simulate:'fail'}),402); assert.equal((await store.getOrder(o.id)).status,'awaiting_payment');
  const p=await O.pay('buyer@okicici',o.id); assert.equal(p.status,'paid'); await rejects(O.pay('buyer@okicici',o.id),409,'no double charge');
  await rejects(O.confirm('buyer@okicici',o.id),409,'cannot release before shipping');
  await rejects(O.ship('buyer@okicici',o.id),403); const sh=await O.ship('seller@okaxis',o.id,{tracking:'DTDC 123'}); assert.equal(sh.status,'shipped');
  const rs=await Promise.allSettled([O.confirm('buyer@okicici',o.id),O.confirm('buyer@okicici',o.id),O.confirm('buyer@okicici',o.id)]);
  assert.equal(rs.filter(r=>r.status==='fulfilled').length,1,'concurrent confirms release exactly once'); const done=await store.getOrder(o.id); assert.equal(done.status,'completed'); assert.match(done.payout_id,/^mock_pot_/);
  const notes=await store.notesFor('seller@okaxis'); assert.deepEqual(notes.map(n=>n.kind).sort(),['new_order','paid','released']); assert.equal((await store.notesFor('buyer@okicici'))[0].kind,'shipped');
  const ev=(await O.get('buyer@okicici',o.id)).events.map(e=>e.to_status); assert.deepEqual(ev,['awaiting_payment','paid','shipped','completed','completed']); });
test('stock: no overselling (concurrent), cancel/refund restores it, strangers see 404, own item blocked',async()=>{
  const {store,O,item}=await setup(); const rs=await Promise.allSettled([1,2,3,4].map(()=>O.create('buyer@okicici',{itemId:item.id,qty:1,shipTo:'addr 123456'})).map(p=>p));
  assert.equal(rs.filter(r=>r.status==='fulfilled').length,3); assert.equal((await store.getItem(item.id)).stock,0); await rejects(O.create('buyer@okicici',{itemId:item.id,qty:1,shipTo:'addr 123456'}),409);
  await rejects(O.create('seller@okaxis',{itemId:item.id,qty:1,shipTo:'addr 123456'}),400); const id1=(await store.ordersByBuyer('buyer@okicici'))[0].id;
  await O.pay('buyer@okicici',id1); const c=await O.cancel('buyer@okicici',id1); assert.equal(c.status,'refunded'); assert.match((await store.getOrder(id1)).refund_id,/^mock_rfd_/); assert.equal((await store.getItem(item.id)).stock,1);
  await rejects(O.cancel('buyer@okicici',id1),409); await rejects(O.get('other@ybl',id1),404); });
test('seller can cancel only a paid unshipped order; shipped orders cannot be cancelled; dispute freezes auto-release',async()=>{
  const {store,O,item}=await setup(); const a=await O.create('buyer@okicici',{itemId:item.id,qty:1,shipTo:'addr 123456'}); await rejects(O.cancel('seller@okaxis',a.id),409);
  await O.pay('buyer@okicici',a.id); await O.ship('seller@okaxis',a.id); await rejects(O.cancel('buyer@okicici',a.id),409); await rejects(O.dispute('seller@okaxis',a.id),403);
  assert.equal((await O.dispute('buyer@okicici',a.id)).status,'disputed'); adv(10*864e5); await O.sweep(); assert.equal((await store.getOrder(a.id)).status,'disputed','dispute is never auto-released'); });
test('sweeper: auto-release 7 days after shipping; unpaid orders expire and return stock',async()=>{
  const {store,O,item}=await setup(); const a=await O.create('buyer@okicici',{itemId:item.id,qty:1,shipTo:'addr 123456'}); await O.pay('buyer@okicici',a.id); await O.ship('seller@okaxis',a.id);
  const b=await O.create('buyer@okicici',{itemId:item.id,qty:1,shipTo:'addr 123456'}); assert.equal((await store.getItem(item.id)).stock,1);
  adv(31*6e4); await O.sweep(); assert.equal((await store.getOrder(b.id)).status,'cancelled'); assert.equal((await store.getItem(item.id)).stock,2); assert.equal((await store.getOrder(a.id)).status,'shipped');
  adv(7*864e5); assert.equal(await O.sweep(),1); assert.equal((await store.getOrder(a.id)).status,'completed'); assert.equal(await O.sweep(),0,'sweeping twice releases nothing twice'); });
