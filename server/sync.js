// Marketplace sync: a small retrying job queue + Amazon/Flipkart adapters.
// Model: the platform lists artisans' products under ONE platform seller account per marketplace (SKU = SS-<itemId>).
// Neither adapter has been run against the live marketplaces (needs approved seller accounts); see DEPLOY.md.
import {openCreds} from './vault.js'; import {trustedUrl} from './integrations.js';
const E=process.env, MAX_ATTEMPTS=5;
class NeedsSetup extends Error{}   // credentials/config missing: park the job, don't burn retries
class Permanent extends Error{}    // marketplace rejected the data: retrying won't help
const body=async r=>{const t=await r.text(); try{return JSON.parse(t);}catch{return {raw:t.slice(0,300)};}};
const http=async(r,what)=>{ if(r.ok) return body(r); const b=await body(r); const m=`${what} ${r.status}: ${JSON.stringify(b).slice(0,300)}`;
  throw (r.status===429||r.status>=500)?new Error(m):new Permanent(m);};
// ---- MOCK marketplace (MOCK_MARKETPLACE=1, used only when real credentials are missing): fake listings go 'live' and a dev-only
// endpoint can drop fake sales into this inbox so the "marketplace orders -> earnings" path can be demoed end to end. Nothing is sent anywhere.
const mockOn=()=>E.MOCK_MARKETPLACE==='1'; const inbox=[]; let mseq=0;
export const mockMarket={
  sale(channel,itemId,qty=1,price){ const o={externalId:`MOCK-${channel.toUpperCase()}-${++mseq}`,sku:`SS-${itemId}`,qty,amount:Math.round(price*qty*100)/100,status:'paid',at:new Date()}; inbox.push({channel,...o}); return o; },
  advance(externalId,status){ const o=inbox.find(x=>x.externalId===externalId); if(!o||!['shipped','completed','cancelled'].includes(status)) return null; o.status=status; return o; },
  drain:channel=>inbox.filter(o=>o.channel===channel), _reset:()=>{inbox.length=0;}};
export const publicBase=()=>(E.PUBLIC_BASE_URL||'').replace(/\/$/,'');

// ---- Amazon SP-API (Listings Items 2021-08-01, India marketplace) ----
// creds=null -> the platform account from the AMAZON_* env vars. creds={...} -> the artisan's OWN seller account (saved encrypted, see integrations.js).
const amzCfg=c=>c?{id:c.lwa_client_id,secret:c.lwa_client_secret,rt:c.refresh_token,seller:c.seller_id,ptype:c.product_type||'PRODUCT',live:c.live===true,own:true}
  :{id:E.AMAZON_LWA_CLIENT_ID,secret:E.AMAZON_LWA_CLIENT_SECRET,rt:E.AMAZON_REFRESH_TOKEN,seller:E.AMAZON_SELLER_ID,ptype:E.AMAZON_PRODUCT_TYPE||'PRODUCT',live:E.AMAZON_LIVE==='1',own:false};
const amzTok=new Map();
const amazon={
  missing:()=>['AMAZON_LWA_CLIENT_ID','AMAZON_LWA_CLIENT_SECRET','AMAZON_REFRESH_TOKEN','AMAZON_SELLER_ID'].filter(k=>!E[k]),
  async token(k,force=false){ const key=k.id+'|'+k.seller, hit=amzTok.get(key); if(!force&&hit&&hit.exp>Date.now()+6e4) return hit.v;
    const b=await http(await fetch(E.AMAZON_TOKEN_URL||'https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:k.rt,client_id:k.id,client_secret:k.secret})}),'amazon auth');
    amzTok.set(key,{v:b.access_token,exp:Date.now()+(b.expires_in||3600)*1e3}); return b.access_token;},
  async check(creds){ try{ await amazon.token(amzCfg(creds),true); return {ok:true,message:'Amazon accepted these keys'}; }catch(e){ return {ok:false,message:String(e.message).replace(/\s+/g,' ').slice(0,160)}; } },
  async publish(item,{sku,imageUrl,creds=null}){
    if(!creds){ const miss=amazon.missing(); if(miss.length&&mockOn()) return {status:'done',externalId:sku,note:'MOCK marketplace listing (nothing was sent to Amazon)'}; if(miss.length) throw new NeedsSetup('Amazon: set '+miss.join(', ')); }
    const k=amzCfg(creds), mp=E.AMAZON_MARKETPLACE_ID||'A21TJRUUN4KGV', t=await amazon.token(k);
    // Attribute names/requirements vary per productType: fetch your category's schema (Product Type Definitions API) and extend this.
    const attributes={item_name:[{value:item.title_en,language_tag:'en_IN',marketplace_id:mp}],product_description:[{value:item.desc_en,language_tag:'en_IN',marketplace_id:mp}],
      main_product_image_locator:[{media_location:imageUrl,marketplace_id:mp}],
      purchasable_offer:[{currency:'INR',marketplace_id:mp,our_price:[{schedule:[{value_with_tax:item.price}]}]}]};
    const url=`${E.AMAZON_SPAPI_BASE||'https://sellingpartnerapi-eu.amazon.com'}/listings/2021-08-01/items/${encodeURIComponent(k.seller)}/${encodeURIComponent(sku)}?marketplaceIds=${mp}${k.live?'':'&mode=VALIDATION_PREVIEW'}`;
    const b=await http(await fetch(url,{method:'PUT',headers:{'x-amz-access-token':t,'content-type':'application/json'},body:JSON.stringify({productType:k.ptype,requirements:'LISTING',attributes})}),'amazon listing');
    if(b.status==='INVALID') throw new Permanent('Amazon rejected: '+(b.issues||[]).map(i=>i.message).join('; ').slice(0,300));
    return {status:k.live?'done':'validated',externalId:sku,note:k.live?null:(k.own?'Validated only: switch on "Publish live" in Marketplace keys to publish':'Validated only (set AMAZON_LIVE=1 to publish)')};},
  // Orders API (v0). UNVERIFIED against live Amazon: needs an approved seller account with the Orders role. 'Shipped' older than 7 days is treated as settled.
  async pull(since,creds=null){
    if(!creds&&amazon.missing().length) return mockOn()?mockMarket.drain('amazon'):[];
    const k=amzCfg(creds), mp=E.AMAZON_MARKETPLACE_ID||'A21TJRUUN4KGV', base=E.AMAZON_SPAPI_BASE||'https://sellingpartnerapi-eu.amazon.com', h={'x-amz-access-token':await amazon.token(k)};
    const list=await http(await fetch(`${base}/orders/v0/orders?MarketplaceIds=${mp}&CreatedAfter=${encodeURIComponent(since.toISOString())}`,{headers:h}),'amazon orders'); const out=[];
    for(const o of (list.payload?.Orders||[]).slice(0,20)){ const it=await http(await fetch(`${base}/orders/v0/orders/${encodeURIComponent(o.AmazonOrderId)}/orderItems`,{headers:h}),'amazon items');
      const st=o.OrderStatus==='Canceled'?'cancelled':o.OrderStatus==='Shipped'?(Date.now()-new Date(o.LastUpdateDate||0)>7*864e5?'completed':'shipped'):'paid';
      for(const i of (it.payload?.OrderItems||[])) out.push({externalId:`${o.AmazonOrderId}:${i.OrderItemId}`,sku:i.SellerSKU,qty:Number(i.QuantityOrdered)||1,amount:Number(i.ItemPrice?.Amount)||0,status:st,at:new Date(o.PurchaseDate)}); }
    return out; }};

// ---- Flipkart Seller API ----
// Same idea: creds=null -> platform env vars; creds={...} -> the artisan's own app. An artisan's links are re-checked (flipkart hosts only, no redirects) before every call.
const fkCfg=c=>c?{id:c.app_id,secret:c.app_secret,listing:c.listing_url,orders:c.orders_url||'',own:true}
  :{id:E.FLIPKART_APP_ID,secret:E.FLIPKART_APP_SECRET,listing:E.FLIPKART_LISTING_URL,orders:E.FLIPKART_ORDERS_URL||'',own:false};
const fkTok=new Map();
const flipkart={
  missing:()=>['FLIPKART_APP_ID','FLIPKART_APP_SECRET','FLIPKART_LISTING_URL'].filter(k=>!E[k]),
  async token(k,force=false){ const hit=fkTok.get(k.id); if(!force&&hit&&hit.exp>Date.now()+6e4) return hit.v;
    const b=await http(await fetch(`${E.FLIPKART_OAUTH_BASE||'https://api.flipkart.net'}/oauth-service/oauth/token?grant_type=client_credentials&scope=Seller_Api`,
      {headers:{authorization:'Basic '+Buffer.from(`${k.id}:${k.secret}`).toString('base64')}}),'flipkart auth');
    fkTok.set(k.id,{v:b.access_token,exp:Date.now()+(b.expires_in||3600)*1e3}); return b.access_token;},
  async check(creds){ try{ await flipkart.token(fkCfg(creds),true); return {ok:true,message:'Flipkart accepted these keys'}; }catch(e){ return {ok:false,message:String(e.message).replace(/\s+/g,' ').slice(0,160)}; } },
  async publish(item,{sku,imageUrl,creds=null}){
    if(!creds){ const miss=flipkart.missing(); if(miss.length&&mockOn()) return {status:'done',externalId:sku,note:'MOCK marketplace listing (nothing was sent to Flipkart)'}; if(miss.length) throw new NeedsSetup('Flipkart: set '+miss.join(', ')); }
    const k=fkCfg(creds), t=await flipkart.token(k);
    // UNVERIFIED payload: Flipkart's listing schema is per category vertical. Replace with the shape from your approved app's docs.
    const payload={sku,title:item.title_en,description:item.desc_en,price:item.price,images:[imageUrl]};
    const b=await http(await fetch(k.own?trustedUrl(k.listing):k.listing,{method:'POST',redirect:k.own?'error':'follow',headers:{authorization:'Bearer '+t,'content-type':'application/json'},body:JSON.stringify(payload)}),'flipkart listing');
    return {status:'done',externalId:b.listingId||b.sku||sku};},
  // UNVERIFIED placeholder: set the orders link to the shipments/orders endpoint of your approved app and adapt the mapping to its response.
  async pull(since,creds=null){
    if(!creds&&(flipkart.missing().length||!E.FLIPKART_ORDERS_URL)) return mockOn()&&flipkart.missing().length?mockMarket.drain('flipkart'):[];
    const k=fkCfg(creds); if(!k.orders) return [];
    const base=k.own?trustedUrl(k.orders):k.orders;
    const b=await http(await fetch(base+(base.includes('?')?'&':'?')+'since='+encodeURIComponent(since.toISOString()),{redirect:k.own?'error':'follow',headers:{authorization:'Bearer '+await flipkart.token(k)}}),'flipkart orders');
    return (b.orders||b.shipments||[]).map(o=>({externalId:String(o.orderItemId||o.id),sku:o.sku,qty:Number(o.quantity)||1,amount:Number(o.price||o.amount)||0,status:/cancel/i.test(o.status||'')?'cancelled':/deliver/i.test(o.status||'')?'completed':/ship|dispatch/i.test(o.status||'')?'shipped':'paid',at:new Date(o.orderDate||Date.now())})); }};
// ---- Government e-Marketplace (GeM) and ONDC: B2B / institutional buyers. Demo-mode adapters only. GeM has no public seller API we can call
// from here (sellers onboard and upload catalogues through the portal), and ONDC needs a registered seller-app. So with MOCK_MARKETPLACE=1 listings
// go 'live' and fake bulk orders can be dropped in; otherwise the job parks as needs_setup instead of pretending to publish.
const portal=(name,keys)=>({
  missing:()=>keys.filter(k=>!E[k]),
  async publish(item,{sku}){ const miss=portal_missing(keys); if(miss.length&&mockOn()) return {status:'done',externalId:sku,note:`MOCK ${name} listing (nothing was sent to ${name})`};
    if(miss.length) throw new NeedsSetup(`${name}: set ${miss.join(', ')} (and implement the ${name} client, see DEPLOY.md)`); throw new NeedsSetup(`${name}: credentials found but the live ${name} client is not implemented yet`); },
  async pull(){ return mockOn()?mockMarket.drain(name):[]; }});
const portal_missing=keys=>keys.filter(k=>!E[k]);
const gem=portal('gem',['GEM_SELLER_ID','GEM_API_KEY']), ondc=portal('ondc',['ONDC_SUBSCRIBER_ID','ONDC_SIGNING_KEY']);
export const adapters={amazon,flipkart,gem,ondc};
export const SYNC_CHANNELS=Object.keys(adapters);

// The seller's own marketplace keys (decrypted just-in-time), or null if they have not connected any.
const credsFor=async(store,uid,channel)=>{ const row=await store.getCred?.(uid,channel); if(!row) return null; const c=openCreds(row.blob,uid,channel);
  if(!c) throw new NeedsSetup(`Your saved ${channel} keys could not be read. Open Marketplace keys and enter them again`); return c; };
export async function runDue(store,ad=adapters,now=new Date()){
  let n=0;
  for(const job of await store.dueJobs(now)){ n++;
    const a=ad[job.channel], item=await store.getItem(job.item_id);
    if(!a||!item){await store.updateJob(job.id,{status:'failed',error:'unknown channel or item'});continue;}
    try{
      if(!publicBase()&&!mockOn()) throw new NeedsSetup('Set PUBLIC_BASE_URL so marketplaces can fetch photos');
      const creds=await credsFor(store,item.seller,job.channel);   // the seller's own saved keys, or null = platform account / mock
      const r=await a.publish(item,{sku:`SS-${item.id}`,imageUrl:`${publicBase()}/media/${item.id}`,creds});
      await store.updateJob(job.id,{status:r.status,external_id:r.externalId||null,error:r.note||null,attempts:job.attempts+1});
    }catch(e){
      if(e instanceof NeedsSetup) await store.updateJob(job.id,{status:'needs_setup',error:e.message,next_run:new Date(now.getTime()+10*6e4)});
      else if(e instanceof Permanent||job.attempts+1>=MAX_ATTEMPTS) await store.updateJob(job.id,{status:'failed',error:String(e.message).slice(0,300),attempts:job.attempts+1});
      else await store.updateJob(job.id,{status:'pending',error:String(e.message).slice(0,300),attempts:job.attempts+1,next_run:new Date(now.getTime()+2**(job.attempts+1)*6e4)});
    }}
  return n;
}
// Pull marketplace orders back into the app (idempotent: unique per channel + external id). Marketplace money is held by the marketplace, so these orders have escrow=false.
export async function importOrders(store,ad=adapters,now=new Date()){
  let n=0; const since=new Date(now.getTime()-30*864e5);
  // One source for the platform account, plus one per artisan who connected their own keys. Orders from an artisan's keys can only attach to THAT artisan's items.
  const sources=[];
  for(const [channel,a] of Object.entries(ad)){ if(!a.pull) continue; sources.push({channel,a,creds:null,owner:null});
    for(const row of (await store.credUsers?.(channel))||[]){ const c=openCreds(row.blob,row.uid,channel); if(c) sources.push({channel,a,creds:c,owner:row.uid}); } }
  for(const {channel,a,creds,owner} of sources){ let rows; try{rows=await a.pull(since,creds);}catch(e){console.error('order pull',channel,owner?'(own keys)':'',String(e.message).slice(0,120));continue;}
    for(const r of rows){ const m=/^SS-(\d+)$/.exec(r.sku||''); const item=m&&await store.getItem(Number(m[1])); if(!item||!(r.amount>=0)) continue; if(owner&&item.seller!==owner) continue;
      const o=await store.addOrder({item_id:item.id,qty:r.qty,buyer:`${channel}:customer`,seller:item.seller,amount:r.amount,channel,status:r.status,escrow:false,external_id:r.externalId});
      if(o){ n++; await store.addNote(item.seller,{order_id:o.id,kind:'market_order',text:`New ${channel} order: ${r.qty} x ${item.title_en} (INR${r.amount}).`}); }
      else { const u=await store.setMarketStatus(channel,r.externalId,r.status); if(u){ n++; await store.addNote(item.seller,{order_id:u.id,kind:'market_status',text:`${channel} order #${u.id} is now ${r.status}.`}); } } } }
  return n; }
export function startWorker(store,every=15e3,extra=[]){let busy=false,tick=0; const t=setInterval(async()=>{if(busy)return;busy=true;try{await runDue(store); if(++tick%4===0){await importOrders(store); for(const f of extra) await f();}}catch(e){console.error('sync worker',e);}busy=false;},every); t.unref(); return t;}
