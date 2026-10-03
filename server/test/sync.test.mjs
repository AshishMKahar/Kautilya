import test from 'node:test'; import assert from 'node:assert/strict';
import {memoryStore} from '../store.js'; import {fake} from './helpers.mjs';
const clear=()=>{for(const k of Object.keys(process.env)) if(/^(AMAZON|FLIPKART|PUBLIC_BASE)/.test(k)) delete process.env[k];};
const load=()=>import('../sync.js?'+Math.random()); // fresh module = fresh token caches
const seed=async(ch)=>{const s=memoryStore(); const it=await s.addItem('a@x',{title_en:'Saree',desc_en:'Handloom',desc_hi:'x',price:999,image:'IMG',channels:[ch]}); await s.enqueue(it.id,ch); return s;};
const status=async s=>(await s.jobsForItems([1]))[0];

test('no credentials -> needs_setup, no retry burned, retried later',async()=>{clear(); process.env.PUBLIC_BASE_URL='https://api.example.com';
  const {runDue}=await load(); const s=await seed('amazon'); await runDue(s);
  const j=await status(s); assert.equal(j.status,'needs_setup'); assert.equal(j.attempts,0); assert.match(j.error,/AMAZON_REFRESH_TOKEN/);
  assert.equal((await s.dueJobs(new Date())).length,0); assert.equal((await s.dueJobs(new Date(Date.now()+11*6e4))).length,1);});

test('missing PUBLIC_BASE_URL -> needs_setup',async()=>{clear(); const {runDue}=await load(); const s=await seed('flipkart'); await runDue(s); assert.match((await status(s)).error,/PUBLIC_BASE_URL/);});

test('amazon: LWA token + validation-preview PUT with expected shape',async()=>{clear();
  const f=await fake((c)=>c.url.startsWith('/token')?[200,{access_token:'AT',expires_in:3600}]:[200,{status:'ACCEPTED',issues:[]}]);
  Object.assign(process.env,{PUBLIC_BASE_URL:'https://api.example.com',AMAZON_LWA_CLIENT_ID:'cid',AMAZON_LWA_CLIENT_SECRET:'sec',AMAZON_REFRESH_TOKEN:'rt',AMAZON_SELLER_ID:'SELLER1',AMAZON_TOKEN_URL:f.url+'/token',AMAZON_SPAPI_BASE:f.url});
  const {runDue}=await load(); const s=await seed('amazon'); await runDue(s); f.close();
  const [tok,put]=f.calls; assert.match(tok.body,/grant_type=refresh_token/); assert.match(tok.body,/refresh_token=rt/);
  assert.equal(put.method,'PUT'); assert.match(put.url,/^\/listings\/2021-08-01\/items\/SELLER1\/SS-1\?marketplaceIds=A21TJRUUN4KGV&mode=VALIDATION_PREVIEW$/); assert.equal(put.headers['x-amz-access-token'],'AT');
  const b=JSON.parse(put.body); assert.equal(b.attributes.item_name[0].value,'Saree'); assert.equal(b.attributes.main_product_image_locator[0].media_location,'https://api.example.com/media/1'); assert.equal(b.attributes.purchasable_offer[0].our_price[0].schedule[0].value_with_tax,999);
  const j=await status(s); assert.equal(j.status,'validated'); assert.equal(j.attempts,1);});

test('amazon INVALID -> failed permanently with issue text',async()=>{clear();
  const f=await fake((c)=>c.url.startsWith('/token')?[200,{access_token:'AT'}]:[200,{status:'INVALID',issues:[{message:'brand is required'}]}]);
  Object.assign(process.env,{PUBLIC_BASE_URL:'https://x',AMAZON_LWA_CLIENT_ID:'c',AMAZON_LWA_CLIENT_SECRET:'s',AMAZON_REFRESH_TOKEN:'r',AMAZON_SELLER_ID:'S',AMAZON_TOKEN_URL:f.url+'/token',AMAZON_SPAPI_BASE:f.url});
  const {runDue}=await load(); const s=await seed('amazon'); await runDue(s); f.close(); const j=await status(s); assert.equal(j.status,'failed'); assert.match(j.error,/brand is required/);});

test('5xx -> retried with backoff, fails after 5 attempts',async()=>{clear();
  const f=await fake((c)=>c.url.startsWith('/token')?[200,{access_token:'AT'}]:[503,{message:'busy'}]);
  Object.assign(process.env,{PUBLIC_BASE_URL:'https://x',AMAZON_LWA_CLIENT_ID:'c',AMAZON_LWA_CLIENT_SECRET:'s',AMAZON_REFRESH_TOKEN:'r',AMAZON_SELLER_ID:'S',AMAZON_TOKEN_URL:f.url+'/token',AMAZON_SPAPI_BASE:f.url});
  const {runDue}=await load(); const s=await seed('amazon'); let t=Date.now();
  await runDue(s,undefined,new Date(t)); let j=await status(s); assert.equal(j.status,'pending'); assert.equal(j.attempts,1); assert.ok(j.next_run>new Date(t));
  assert.equal(await runDue(s,undefined,new Date(t+1)),0,'not due yet');
  for(let i=0;i<4;i++){t+=2**6*6e4; await runDue(s,undefined,new Date(t));} f.close(); j=await status(s); assert.equal(j.status,'failed'); assert.equal(j.attempts,5);});

test('flipkart: basic-auth client-credentials token, then listing POST',async()=>{clear();
  const f=await fake((c)=>c.url.startsWith('/oauth-service')?[200,{access_token:'FT',expires_in:3600}]:[200,{listingId:'LST123'}]);
  Object.assign(process.env,{PUBLIC_BASE_URL:'https://api.example.com',FLIPKART_APP_ID:'id',FLIPKART_APP_SECRET:'secret',FLIPKART_OAUTH_BASE:f.url,FLIPKART_LISTING_URL:f.url+'/sellers/listings'});
  const {runDue}=await load(); const s=await seed('flipkart'); await runDue(s); f.close();
  const [tok,post]=f.calls; assert.equal(tok.url,'/oauth-service/oauth/token?grant_type=client_credentials&scope=Seller_Api'); assert.equal(tok.headers.authorization,'Basic '+Buffer.from('id:secret').toString('base64'));
  assert.equal(post.headers.authorization,'Bearer FT'); const j=await status(s); assert.equal(j.status,'done'); assert.equal(j.external_id,'LST123');});

test('flipkart without listing URL -> needs_setup',async()=>{clear(); Object.assign(process.env,{PUBLIC_BASE_URL:'https://x',FLIPKART_APP_ID:'i',FLIPKART_APP_SECRET:'s'});
  const {runDue}=await load(); const s=await seed('flipkart'); await runDue(s); assert.match((await status(s)).error,/FLIPKART_LISTING_URL/);});

test('mock marketplace: listing goes live, a fake sale is imported once as an escrow-free order, status updates flow to earnings',async()=>{
  clear(); process.env.PUBLIC_BASE_URL='https://api.example.com'; process.env.MOCK_MARKETPLACE='1';
  const {runDue,importOrders,mockMarket}=await load(); mockMarket._reset(); const s=await seed('amazon'); await runDue(s);
  assert.equal((await status(s)).status,'done'); assert.match((await status(s)).error,/MOCK/);
  mockMarket.sale('amazon',1,2,999); assert.equal(await importOrders(s),1); assert.equal(await importOrders(s),0,'idempotent');
  const [o]=await s.ordersBySeller('a@x'); assert.equal(o.channel,'amazon'); assert.equal(o.escrow,false); assert.equal(o.amount,1998); assert.equal(o.status,'paid');
  mockMarket.advance(o.external_id,'completed'); assert.equal(await importOrders(s),1); assert.equal((await s.ordersBySeller('a@x'))[0].status,'completed');
  assert.deepEqual((await s.notesFor('a@x')).map(n=>n.kind),['market_status','market_order']);
  mockMarket.sale('amazon',999,1,10); assert.equal(await importOrders(s),0,'unknown SKU/item ignored'); delete process.env.MOCK_MARKETPLACE; });
