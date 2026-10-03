import test from 'node:test'; import assert from 'node:assert/strict';
import {memoryStore} from '../store.js'; import {fake} from './helpers.mjs';
import {seal,open,sealCreds,openCreds} from '../vault.js'; import {normalise,view,trustedUrl,BadCreds} from '../integrations.js';
const clear=()=>{for(const k of Object.keys(process.env)) if(/^(AMAZON|FLIPKART|PUBLIC_BASE|MOCK_MARKETPLACE|KAUTILYA_TEST)/.test(k)) delete process.env[k];};
const load=()=>import('../sync.js?'+Math.random());
process.env.JWT_SECRET='x'.repeat(40);
const AMZ={lwa_client_id:'cid',lwa_client_secret:'sec',refresh_token:'rt',seller_id:'SELLER9'};

test('vault: round trip, tamper, and owner binding',()=>{
  const b=sealCreds({a:1,secret:'S3CR3T'},'u1','amazon'); assert.ok(!b.includes('S3CR3T'));
  assert.deepEqual(openCreds(b,'u1','amazon'),{a:1,secret:'S3CR3T'});
  assert.equal(openCreds(b,'u2','amazon'),null,'another user cannot open it'); assert.equal(openCreds(b,'u1','flipkart'),null,'another marketplace cannot open it');
  assert.equal(open(b.slice(0,-3)+'AAA','u1|amazon'),null,'tampered text is rejected'); assert.equal(open('garbage','x'),null);
  assert.notEqual(sealCreds({a:1},'u1','amazon'),sealCreds({a:1},'u1','amazon'),'random IV each time');});

test('vault: refuses to run without a 32+ char key',()=>{ const k=process.env.JWT_SECRET; process.env.JWT_SECRET='short'; assert.throws(()=>seal('x','y'),/32/); process.env.JWT_SECRET=k;});

test('normalise: required fields, unknown fields, whitespace, blank secret keeps the saved one',()=>{
  assert.throws(()=>normalise('amazon',{...AMZ,seller_id:''}),BadCreds);
  assert.throws(()=>normalise('amazon',{...AMZ,evil:'1'}),/Unknown field/); assert.throws(()=>normalise('shopify',{}),/Unknown marketplace/);
  assert.throws(()=>normalise('amazon',{...AMZ,refresh_token:'a b'}),/spaces/);
  const first=normalise('amazon',{...AMZ,live:true}); assert.equal(first.live,true);
  const edited=normalise('amazon',{...AMZ,lwa_client_secret:'',refresh_token:'',seller_id:'NEW'},first); assert.equal(edited.lwa_client_secret,'sec'); assert.equal(edited.refresh_token,'rt'); assert.equal(edited.seller_id,'NEW'); assert.equal(edited.live,true);});

test('flipkart links must be https on flipkart hosts (no SSRF to other sites or internal addresses)',()=>{
  for(const bad of ['http://api.flipkart.net/x','https://evil.com/x','https://api.flipkart.net.evil.com/x','https://169.254.169.254/latest','https://user:pw@api.flipkart.net/x','https://api.flipkart.net:8443/x','nonsense','https://localhost/x'])
    assert.throws(()=>trustedUrl(bad),BadCreds,bad);
  assert.match(trustedUrl('https://api.flipkart.net/sellers/skus/listings'),/^https:\/\/api\.flipkart\.net\//);
  assert.equal(normalise('flipkart',{app_id:'i',app_secret:'s',listing_url:'https://seller.flipkart.com/api/l'}).orders_url,undefined);});

test('view never contains secrets',()=>{
  const v=view('amazon',normalise('amazon',AMZ),new Date()); const text=JSON.stringify(v);
  for(const secret of ['sec','rt"']) assert.ok(!text.includes(`"value":"${secret.replace('"','')}"`));
  assert.ok(!text.includes('"sec"')&&!text.includes('"rt"')); assert.equal(v.fields.find(f=>f.name==='lwa_client_secret').set,true); assert.equal(v.fields.find(f=>f.name==='seller_id').value,'SELLER9');
  assert.equal(view('amazon',null).connected,false);});

test('store keeps only the sealed text, per user and channel',async()=>{
  const s=memoryStore(); await s.putCred('u1','amazon','BLOB1'); await s.putCred('u2','amazon','BLOB2');
  assert.equal((await s.getCred('u1','amazon')).blob,'BLOB1'); assert.equal(await s.getCred('u1','flipkart'),null); assert.equal((await s.credUsers('amazon')).length,2);
  await s.delCred('u1','amazon'); assert.equal(await s.getCred('u1','amazon'),null);});

test('a listing uses the seller\'s OWN amazon keys, not the platform account',async()=>{clear();
  const f=await fake(c=>c.url.startsWith('/token')?[200,{access_token:'OWNAT'}]:[200,{status:'ACCEPTED',issues:[]}]);
  Object.assign(process.env,{PUBLIC_BASE_URL:'https://api.example.com',AMAZON_TOKEN_URL:f.url+'/token',AMAZON_SPAPI_BASE:f.url});
  const {runDue}=await load(); const s=memoryStore(); const it=await s.addItem('seller@x',{title_en:'Saree',desc_en:'d',desc_hi:'x',price:500,image:'I',channels:['amazon']}); await s.enqueue(it.id,'amazon');
  await s.putCred('seller@x','amazon',sealCreds(normalise('amazon',AMZ),'seller@x','amazon')); await runDue(s); f.close();
  const [tok,put]=f.calls; assert.match(tok.body,/client_id=cid/); assert.match(tok.body,/refresh_token=rt/); assert.match(put.url,/\/items\/SELLER9\/SS-1\?/); assert.match(put.url,/VALIDATION_PREVIEW/); assert.equal(put.headers['x-amz-access-token'],'OWNAT');
  const j=(await s.jobsForItems([1]))[0]; assert.equal(j.status,'validated'); assert.match(j.error,/Publish live/);});

test('unreadable saved keys park the job instead of silently using the platform account',async()=>{clear(); process.env.PUBLIC_BASE_URL='https://x';
  const {runDue}=await load(); const s=memoryStore(); const it=await s.addItem('a@x',{title_en:'T',desc_en:'d',desc_hi:'x',price:5,image:'I',channels:['amazon']}); await s.enqueue(it.id,'amazon');
  await s.putCred('a@x','amazon',sealCreds(AMZ,'someone-else','amazon')); await runDue(s);
  const j=(await s.jobsForItems([1]))[0]; assert.equal(j.status,'needs_setup'); assert.match(j.error,/enter them again/);});

test('flipkart own keys: token + listing POST to the seller\'s link',async()=>{clear();
  const f=await fake(c=>c.url.startsWith('/oauth-service')?[200,{access_token:'FKAT'}]:[200,{listingId:'L1'}]);
  Object.assign(process.env,{PUBLIC_BASE_URL:'https://api.example.com',FLIPKART_OAUTH_BASE:f.url,KAUTILYA_TEST_URLS:'1'});
  const {runDue}=await load(); const s=memoryStore(); const it=await s.addItem('s@x',{title_en:'Saree',desc_en:'d',desc_hi:'x',price:500,image:'I',channels:['flipkart']}); await s.enqueue(it.id,'flipkart');
  await s.putCred('s@x','flipkart',sealCreds(normalise('flipkart',{app_id:'myid',app_secret:'mysec',listing_url:f.url+'/listings'}),'s@x','flipkart')); await runDue(s); f.close();
  const [tok,post]=f.calls; assert.equal(tok.headers.authorization,'Basic '+Buffer.from('myid:mysec').toString('base64')); assert.equal(post.url,'/listings'); assert.equal(post.headers.authorization,'Bearer FKAT');
  assert.equal((await s.jobsForItems([1]))[0].external_id,'L1');});

test('orders pulled with a seller\'s keys can only attach to THAT seller\'s items',async()=>{clear(); process.env.PUBLIC_BASE_URL='https://x';
  const {importOrders}=await load(); const s=memoryStore();
  const mine=await s.addItem('me@x',{title_en:'Mine',desc_en:'d',desc_hi:'x',price:10,image:'I',channels:[]}); const theirs=await s.addItem('other@x',{title_en:'Theirs',desc_en:'d',desc_hi:'x',price:10,image:'I',channels:[]});
  await s.putCred('me@x','amazon',sealCreds(AMZ,'me@x','amazon'));
  const calls=[]; const ad={amazon:{async pull(since,creds){ calls.push(creds?creds.seller_id:null); return creds?[{externalId:'O1',sku:`SS-${mine.id}`,qty:1,amount:10,status:'paid'},{externalId:'O2',sku:`SS-${theirs.id}`,qty:1,amount:10,status:'paid'}]:[]; }}};
  const n=await importOrders(s,ad); assert.deepEqual(calls,[null,'SELLER9']); assert.equal(n,1);
  assert.equal((await s.ordersBySeller('me@x')).length,1); assert.equal((await s.ordersBySeller('other@x')).length,0);});
