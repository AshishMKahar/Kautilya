// Storage layer: Postgres when DATABASE_URL is set (Neon/Supabase/Render), otherwise in-memory (demo only).
// Every state change on an order goes through transition(): one atomic compare-and-set, so double-clicks and races cannot pay, ship or release twice.
const desc=(a,b)=>b.id-a.id;
const PATCH=['payment_id','payout_id','refund_id','tracking','auto_release_at'];
export function memoryStore(){
  const users={},items=[],orders=[],jobs=[],events=[],notes=[],sessions={},chall={},audits=[]; let jid=0,oid=0,eid=0,nid=0;
  const stripImg=({image,...i})=>i;
  return {kind:'memory',
    async upsertUser(u){users[u.uid]={...users[u.uid],...u};return users[u.uid];},
    async getUser(uid){return users[uid]||null;},
    async addItem(seller,b){const it={id:items.length+1,seller,stock:1,...b};items.push(it);return it;},
    async listItems({seller,excludeSeller,limit=50,inStock}={}){return items.filter(i=>(!seller||i.seller===seller)&&(!excludeSeller||i.seller!==excludeSeller)&&(!inStock||i.stock>0)).sort(desc).slice(0,limit).map(stripImg);},
    async getItem(id){return items.find(i=>i.id===id)||null;},
    async reserveStock(id,qty){const it=items.find(i=>i.id===id); if(!it||it.stock<qty) return false; it.stock-=qty; return true;},
    async releaseStock(id,qty){const it=items.find(i=>i.id===id); if(it) it.stock+=qty;},
    async addOrder(o){const r={id:++oid,status:'awaiting_payment',escrow:true,payment_id:null,payout_id:null,refund_id:null,tracking:null,ship_to:null,external_id:null,auto_release_at:null,...o,at:new Date(),updated_at:new Date()};
      if(r.external_id&&orders.some(x=>x.channel===r.channel&&x.external_id===r.external_id)) return null; orders.push(r);events.push({id:++eid,order_id:r.id,actor:'system',from_status:null,to_status:r.status,at:new Date()});return r;},
    async getOrder(id){return orders.find(o=>o.id===id)||null;},
    async transition(id,from,to,actor,patch={}){const o=orders.find(x=>x.id===id); if(!o||!from.includes(o.status)) return null;
      const from_status=o.status; o.status=to; o.updated_at=new Date(); for(const k of PATCH) if(k in patch) o[k]=patch[k]; events.push({id:++eid,order_id:id,actor,from_status,to_status:to,at:new Date()}); return {...o};},
    async setMarketStatus(channel,external_id,to){const o=orders.find(x=>x.channel===channel&&x.external_id===external_id); if(!o||o.status===to) return null; const f=o.status; o.status=to; o.updated_at=new Date(); events.push({id:++eid,order_id:o.id,actor:'marketplace',from_status:f,to_status:to,at:new Date()}); return {...o};},
    async ordersBySeller(seller){return orders.filter(o=>o.seller===seller).sort(desc);},
    async ordersByBuyer(buyer){return orders.filter(o=>o.buyer===buyer).sort(desc);},
    async orderEvents(id){return events.filter(e=>e.order_id===id);},
    async dueAutoRelease(now){return orders.filter(o=>o.status==='shipped'&&o.escrow&&o.auto_release_at&&o.auto_release_at<=now);},
    async staleUnpaid(before){return orders.filter(o=>o.status==='awaiting_payment'&&o.escrow&&o.at<=before);},
    async addNote(uid,n){const r={id:++nid,uid,order_id:null,read:false,at:new Date(),...n};notes.push(r);return r;},
    async notesFor(uid,limit=50){return notes.filter(n=>n.uid===uid).sort(desc).slice(0,limit);},
    async unreadCount(uid){return notes.filter(n=>n.uid===uid&&!n.read).length;},
    async markNotesRead(uid){notes.filter(n=>n.uid===uid).forEach(n=>n.read=true);},
    async putChallenge(upi,c){chall[upi]={...c,attempts:0};}, async getChallenge(upi){return chall[upi]||null;},
    async bumpChallenge(upi){const c=chall[upi]; if(c) c.attempts++; return c?c.attempts:0;}, async dropChallenge(upi){delete chall[upi];},
    async addSession(s){sessions[s.id]={...s,used:false,revoked:false};},
    async getSession(id){return sessions[id]||null;},
    async useSession(id){const s=sessions[id]; if(!s||s.used||s.revoked) return false; s.used=true; return true;},
    async revokeFamily(family){Object.values(sessions).forEach(s=>{if(s.family===family) s.revoked=true;});},
    async revokeUser(uid){Object.values(sessions).forEach(s=>{if(s.uid===uid) s.revoked=true;});},
    async audit(uid,event,meta={}){audits.push({uid,event,meta,at:new Date()}); if(audits.length>1000) audits.shift();}, _audits:audits,
    async enqueue(itemId,channel){const j={id:++jid,item_id:itemId,channel,status:'pending',attempts:0,external_id:null,error:null,next_run:new Date()};jobs.push(j);return j;},
    async dueJobs(now,limit=10){return jobs.filter(j=>['pending','needs_setup'].includes(j.status)&&j.next_run<=now).slice(0,limit);},
    async updateJob(id,p){Object.assign(jobs.find(j=>j.id===id),p);},
    async jobsForItems(ids){return jobs.filter(j=>ids.includes(j.item_id));},
    async liveJobs(){return jobs.filter(j=>['done','validated'].includes(j.status));}};
}
export async function pgStore(pool){
  const q=(t,p)=>pool.query(t,p);
  await q(`
    CREATE TABLE IF NOT EXISTS users(uid TEXT PRIMARY KEY, upi TEXT NOT NULL, name TEXT NOT NULL, bank JSONB, verified BOOLEAN NOT NULL DEFAULT false);
    CREATE TABLE IF NOT EXISTS items(id SERIAL PRIMARY KEY, seller TEXT NOT NULL, title_en TEXT NOT NULL, desc_en TEXT NOT NULL, desc_hi TEXT NOT NULL, price NUMERIC NOT NULL, image TEXT NOT NULL, channels JSONB NOT NULL DEFAULT '["app"]', stock INT NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY, item_id INT NOT NULL, qty INT NOT NULL DEFAULT 1, buyer TEXT NOT NULL, seller TEXT NOT NULL, amount NUMERIC NOT NULL, channel TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now(),
      status TEXT NOT NULL DEFAULT 'awaiting_payment', escrow BOOLEAN NOT NULL DEFAULT true, payment_id TEXT, payout_id TEXT, refund_id TEXT, tracking TEXT, ship_to TEXT, external_id TEXT, auto_release_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS order_events(id SERIAL PRIMARY KEY, order_id INT NOT NULL, actor TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS notifications(id SERIAL PRIMARY KEY, uid TEXT NOT NULL, order_id INT, kind TEXT NOT NULL, text TEXT NOT NULL, read BOOLEAN NOT NULL DEFAULT false, at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS challenges(upi TEXT PRIMARY KEY, code_hash TEXT NOT NULL, name TEXT NOT NULL, exp TIMESTAMPTZ NOT NULL, attempts INT NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, uid TEXT NOT NULL, family TEXT NOT NULL, hash TEXT NOT NULL, exp TIMESTAMPTZ NOT NULL, used BOOLEAN NOT NULL DEFAULT false, revoked BOOLEAN NOT NULL DEFAULT false);
    CREATE TABLE IF NOT EXISTS audit(id SERIAL PRIMARY KEY, uid TEXT, event TEXT NOT NULL, meta JSONB, at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS sync_jobs(id SERIAL PRIMARY KEY, item_id INT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INT NOT NULL DEFAULT 0, external_id TEXT, error TEXT, next_run TIMESTAMPTZ NOT NULL DEFAULT now());
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bank JSONB; ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS stock INT NOT NULL DEFAULT 1;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'awaiting_payment'; ALTER TABLE orders ADD COLUMN IF NOT EXISTS escrow BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_id TEXT; ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_id TEXT; ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_id TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking TEXT; ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_to TEXT; ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_id TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_release_at TIMESTAMPTZ; ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    CREATE UNIQUE INDEX IF NOT EXISTS orders_ext ON orders(channel,external_id);
    CREATE INDEX IF NOT EXISTS orders_buyer ON orders(buyer); CREATE INDEX IF NOT EXISTS orders_seller ON orders(seller); CREATE INDEX IF NOT EXISTS notes_uid ON notifications(uid);`);
  const num=r=>r&&{...r,price:Number(r.price)}, ord=r=>r&&{...r,amount:Number(r.amount)}, row=async(t,p)=>(await q(t,p)).rows[0]||null;
  return {kind:'postgres',
    async upsertUser(u){return row('INSERT INTO users(uid,upi,name,bank,verified) VALUES($1,$2,$3,$4,$5) ON CONFLICT(uid) DO UPDATE SET name=EXCLUDED.name, bank=COALESCE(EXCLUDED.bank,users.bank), verified=users.verified OR EXCLUDED.verified RETURNING *',[u.uid,u.upi,u.name,u.bank?JSON.stringify(u.bank):null,!!u.verified]);},
    async getUser(uid){return row('SELECT * FROM users WHERE uid=$1',[uid]);},
    async addItem(seller,b){return num(await row('INSERT INTO items(seller,title_en,desc_en,desc_hi,price,image,channels,stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[seller,b.title_en,b.desc_en,b.desc_hi,b.price,b.image,JSON.stringify(b.channels),b.stock||1]));},
    async listItems({seller,excludeSeller,limit=50,inStock}={}){return (await q('SELECT id,seller,title_en,desc_en,desc_hi,price,channels,stock FROM items WHERE ($1::text IS NULL OR seller=$1) AND ($2::text IS NULL OR seller<>$2) AND ($4::boolean IS NOT TRUE OR stock>0) ORDER BY id DESC LIMIT $3',[seller||null,excludeSeller||null,limit,!!inStock])).rows.map(num);},
    async getItem(id){return num(await row('SELECT * FROM items WHERE id=$1',[id]));},
    async reserveStock(id,qty){return !!(await row('UPDATE items SET stock=stock-$2 WHERE id=$1 AND stock>=$2 RETURNING id',[id,qty]));},
    async releaseStock(id,qty){await q('UPDATE items SET stock=stock+$2 WHERE id=$1',[id,qty]);},
    async addOrder(o){const r=await row('INSERT INTO orders(item_id,qty,buyer,seller,amount,channel,status,escrow,ship_to,external_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING *',
        [o.item_id,o.qty,o.buyer,o.seller,o.amount,o.channel,o.status||'awaiting_payment',o.escrow!==false,o.ship_to||null,o.external_id||null]); if(!r) return null;
      await q('INSERT INTO order_events(order_id,actor,from_status,to_status) VALUES($1,$2,NULL,$3)',[r.id,'system',r.status]); return ord(r);},
    async getOrder(id){return ord(await row('SELECT * FROM orders WHERE id=$1',[id]));},
    async transition(id,from,to,actor,patch={}){const ks=PATCH.filter(k=>k in patch); // column names come from the PATCH whitelist, values are bound parameters
      const r=await row(`UPDATE orders SET status=$2, updated_at=now()${ks.map((k,i)=>`, ${k}=$${i+4}`).join('')} WHERE id=$1 AND status = ANY($3::text[]) RETURNING *`,[id,to,from,...ks.map(k=>patch[k])]);
      if(!r) return null; await q('INSERT INTO order_events(order_id,actor,from_status,to_status) VALUES($1,$2,$3,$4)',[id,actor,from.length===1?from[0]:null,to]); return ord(r);},
    async setMarketStatus(channel,external_id,to){const r=await row('UPDATE orders SET status=$3, updated_at=now() WHERE channel=$1 AND external_id=$2 AND status<>$3 RETURNING *',[channel,external_id,to]); if(!r) return null;
      await q('INSERT INTO order_events(order_id,actor,from_status,to_status) VALUES($1,$2,NULL,$3)',[r.id,'marketplace',to]); return ord(r);},
    async ordersBySeller(s){return (await q('SELECT * FROM orders WHERE seller=$1 ORDER BY id DESC LIMIT 200',[s])).rows.map(ord);},
    async ordersByBuyer(b){return (await q('SELECT * FROM orders WHERE buyer=$1 ORDER BY id DESC LIMIT 200',[b])).rows.map(ord);},
    async orderEvents(id){return (await q('SELECT * FROM order_events WHERE order_id=$1 ORDER BY id',[id])).rows;},
    async dueAutoRelease(now){return (await q("SELECT * FROM orders WHERE status='shipped' AND escrow AND auto_release_at IS NOT NULL AND auto_release_at<=$1 LIMIT 50",[now])).rows.map(ord);},
    async staleUnpaid(before){return (await q("SELECT * FROM orders WHERE status='awaiting_payment' AND escrow AND at<=$1 LIMIT 50",[before])).rows.map(ord);},
    async addNote(uid,n){return row('INSERT INTO notifications(uid,order_id,kind,text) VALUES($1,$2,$3,$4) RETURNING *',[uid,n.order_id||null,n.kind,n.text]);},
    async notesFor(uid,limit=50){return (await q('SELECT * FROM notifications WHERE uid=$1 ORDER BY id DESC LIMIT $2',[uid,limit])).rows;},
    async unreadCount(uid){return Number((await row('SELECT count(*) AS n FROM notifications WHERE uid=$1 AND NOT read',[uid])).n);},
    async markNotesRead(uid){await q('UPDATE notifications SET read=true WHERE uid=$1 AND NOT read',[uid]);},
    async putChallenge(upi,c){await q('INSERT INTO challenges(upi,code_hash,name,exp,attempts) VALUES($1,$2,$3,$4,0) ON CONFLICT(upi) DO UPDATE SET code_hash=EXCLUDED.code_hash,name=EXCLUDED.name,exp=EXCLUDED.exp,attempts=0',[upi,c.code_hash,c.name,c.exp]);},
    async getChallenge(upi){return row('SELECT * FROM challenges WHERE upi=$1',[upi]);},
    async bumpChallenge(upi){const r=await row('UPDATE challenges SET attempts=attempts+1 WHERE upi=$1 RETURNING attempts',[upi]); return r?r.attempts:0;},
    async dropChallenge(upi){await q('DELETE FROM challenges WHERE upi=$1',[upi]);},
    async addSession(s){await q('INSERT INTO sessions(id,uid,family,hash,exp) VALUES($1,$2,$3,$4,$5)',[s.id,s.uid,s.family,s.hash,s.exp]);},
    async getSession(id){return row('SELECT * FROM sessions WHERE id=$1',[id]);},
    async useSession(id){return !!(await row('UPDATE sessions SET used=true WHERE id=$1 AND NOT used AND NOT revoked RETURNING id',[id]));},
    async revokeFamily(f){await q('UPDATE sessions SET revoked=true WHERE family=$1',[f]);},
    async revokeUser(uid){await q('UPDATE sessions SET revoked=true WHERE uid=$1',[uid]);},
    async audit(uid,event,meta={}){await q('INSERT INTO audit(uid,event,meta) VALUES($1,$2,$3)',[uid||null,event,JSON.stringify(meta)]);},
    async enqueue(itemId,channel){return row('INSERT INTO sync_jobs(item_id,channel) VALUES($1,$2) RETURNING *',[itemId,channel]);},
    async dueJobs(now,limit=10){return (await q("SELECT * FROM sync_jobs WHERE status IN ('pending','needs_setup') AND next_run<=$1 ORDER BY id LIMIT $2",[now,limit])).rows;},
    async updateJob(id,p){const k=Object.keys(p).filter(c=>['status','attempts','external_id','error','next_run'].includes(c));await q(`UPDATE sync_jobs SET ${k.map((c,i)=>`${c}=$${i+2}`).join(',')} WHERE id=$1`,[id,...k.map(c=>p[c])]);},
    async jobsForItems(ids){if(!ids.length) return []; return (await q('SELECT * FROM sync_jobs WHERE item_id = ANY($1::int[])',[ids])).rows;},
    async liveJobs(){return (await q("SELECT * FROM sync_jobs WHERE status IN ('done','validated')")).rows;}};
}
export async function openStore(){
  if(!process.env.DATABASE_URL){console.warn('DATABASE_URL not set: using in-memory store (data lost on restart)');return memoryStore();}
  const {default:pg}=await import('pg');
  // TLS certificate verification is ON by default. Only set DATABASE_SSL=off for a local Postgres; DATABASE_CA for a private CA.
  const ssl=process.env.DATABASE_SSL==='off'?false:{rejectUnauthorized:true,...(process.env.DATABASE_CA?{ca:process.env.DATABASE_CA}:{})};
  return pgStore(new pg.Pool({connectionString:process.env.DATABASE_URL,ssl,max:5,statement_timeout:10000}));
}
