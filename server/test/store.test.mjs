import test from 'node:test'; import assert from 'node:assert/strict';
import {memoryStore,pgStore} from '../store.js';
const stores={memory:async()=>memoryStore()};
try{ const {newDb}=await import('pg-mem'); stores['postgres (pg-mem)']=async()=>{const {Pool}=newDb().adapters.createPg();return pgStore(new Pool());}; }catch{ console.warn('pg-mem not installed: skipping the Postgres contract run (run npm install)'); }
for(const [name,make] of Object.entries(stores)) test(`store contract: ${name}`,async()=>{
  const s=await make();
  await s.upsertUser({uid:'a@x',upi:'a@x',name:'A',bank:{app:'GPay'},verified:true}); assert.equal((await s.getUser('a@x')).name,'A'); assert.equal((await s.getUser('a@x')).verified,true);
  const it=await s.addItem('a@x',{title_en:'t',desc_en:'d',desc_hi:'h',price:999.5,image:'IMG',channels:['app'],stock:2}); await s.addItem('b@x',{title_en:'u',desc_en:'d',desc_hi:'h',price:5,image:'I2',channels:['app']});
  assert.equal(it.price,999.5); assert.equal((await s.getItem(it.id)).image,'IMG'); assert.equal(await s.getItem(99),null);
  assert.deepEqual((await s.listItems({seller:'a@x'})).map(i=>i.id),[1]); assert.deepEqual((await s.listItems({excludeSeller:'a@x'})).map(i=>i.id),[2]);
  assert.equal((await s.listItems())[0].image,undefined,'lists must not carry photos');
  assert.equal(await s.reserveStock(1,2),true); assert.equal(await s.reserveStock(1,1),false); assert.deepEqual((await s.listItems({inStock:true})).map(i=>i.id),[2]); await s.releaseStock(1,1); assert.equal((await s.getItem(1)).stock,1);
  const o=await s.addOrder({item_id:1,qty:2,buyer:'b@x',seller:'a@x',amount:1999,channel:'app',ship_to:'addr'}); assert.equal(o.status,'awaiting_payment'); assert.equal((await s.ordersBySeller('a@x'))[0].amount,1999); assert.equal((await s.ordersByBuyer('a@x')).length,0);
  assert.equal(await s.transition(o.id,['paid'],'shipped','x'),null,'wrong source state is rejected');
  const p=await s.transition(o.id,['awaiting_payment'],'paid','b@x',{payment_id:'P1'}); assert.equal(p.status,'paid'); assert.equal(p.payment_id,'P1'); assert.equal(await s.transition(o.id,['awaiting_payment'],'paid','b@x'),null);
  assert.deepEqual((await s.orderEvents(o.id)).map(e=>e.to_status),['awaiting_payment','paid']);
  const m=await s.addOrder({item_id:1,qty:1,buyer:'amazon:customer',seller:'a@x',amount:500,channel:'amazon',status:'paid',escrow:false,external_id:'X1'}); assert.ok(m); assert.equal(await s.addOrder({item_id:1,qty:1,buyer:'amazon:customer',seller:'a@x',amount:500,channel:'amazon',external_id:'X1'}),null,'duplicate marketplace order ignored');
  assert.equal((await s.setMarketStatus('amazon','X1','completed')).status,'completed'); assert.equal(await s.setMarketStatus('amazon','X1','completed'),null);
  await s.addNote('a@x',{order_id:1,kind:'k',text:'hi'}); assert.equal(await s.unreadCount('a@x'),1); await s.markNotesRead('a@x'); assert.equal(await s.unreadCount('a@x'),0); assert.equal((await s.notesFor('a@x'))[0].text,'hi');
  await s.putChallenge('a@x',{code_hash:'h',name:'A',exp:new Date(Date.now()+6e4)}); assert.equal(await s.bumpChallenge('a@x'),1); assert.equal((await s.getChallenge('a@x')).attempts,1); await s.dropChallenge('a@x'); assert.equal(await s.getChallenge('a@x'),null);
  await s.addSession({id:'s1',uid:'a@x',family:'f',hash:'h',exp:new Date(Date.now()+6e4)}); assert.equal(await s.useSession('s1'),true); assert.equal(await s.useSession('s1'),false); await s.addSession({id:'s2',uid:'a@x',family:'f',hash:'h',exp:new Date(Date.now()+6e4)}); await s.revokeFamily('f'); assert.equal(await s.useSession('s2'),false);
  await s.audit('a@x','test');
  const j=await s.enqueue(1,'amazon'); assert.equal((await s.dueJobs(new Date())).length,1);
  await s.updateJob(j.id,{status:'done',external_id:'SS-1',attempts:1}); assert.equal((await s.dueJobs(new Date())).length,0);
  const js=await s.jobsForItems([1]); assert.equal(js[0].status,'done'); assert.equal(js[0].external_id,'SS-1'); assert.equal((await s.jobsForItems([2])).length,0);
});
