// Kautilya API. Run: cd server && npm install && npm start   (no API keys needed: AI runs on local models from `npm run models`, with built-in fallbacks; price scraper built in; payments mocked)
import './env.js';
import express from 'express'; import helmet from 'helmet'; import rateLimit from 'express-rate-limit'; import jwt from 'jsonwebtoken'; import {z} from 'zod';
import {openStore} from './store.js'; import {startWorker,SYNC_CHANNELS,mockMarket,importOrders,adapters} from './sync.js'; import {sealCreds,openCreds} from './vault.js'; import {CHANNELS,normalise,view as credView,BadCreds} from './integrations.js';
import {checkSecret,sniffImage,toDataUrl,clean} from './security.js'; import {parseUpiQr,UPI_RE} from './bank.js';
import {makeListing,categories} from './listing.js'; import {suggestPrice} from './pricing.js';
import {mockGateway,MOCK} from './payments.js'; import {enhancePhoto,analyseImage,hasSharp} from './studio.js'; import {priceModel} from './pricemodel.js'; import {transcribe,aiListing,writerReady,langCodes} from './ai.js'; import {has} from './models.js'; import {seedDemo} from './demo.js'; import {authService,orderService,HttpError,publicProfile,view} from './service.js';

const PROD=process.env.NODE_ENV==='production';
const SECRET=checkSecret(process.env.JWT_SECRET);
if(MOCK&&PROD&&process.env.ALLOW_MOCK_IN_PRODUCTION!=='1') throw new Error('Mock payments/bank verification must not run in production. Plug in a real gateway, or set ALLOW_MOCK_IN_PRODUCTION=1 for a demo deployment (no real money moves).');
if(MOCK&&PROD) console.warn('WARNING: MOCK payments + mock bank verification are ON in production. Demo only.');
const DEMO=process.env.DEMO_MODE==='1'&&(!PROD||process.env.ALLOW_MOCK_IN_PRODUCTION==='1');   // one-tap demo login + seeded artisans; never on in a real production deployment
const exposeMockCode=MOCK&&!PROD;       // the mock "bank credit" code is returned to the app only outside production
const store=await openStore(), gateway=mockGateway(); if(DEMO) await seedDemo(store).catch(e=>console.error('demo seed failed',e.message));
const sign=uid=>jwt.sign({},SECRET,{algorithm:'HS256',subject:uid,issuer:'kautilya',audience:'kautilya-app',expiresIn:900});
const A=authService({store,sign,exposeMockCode}), O=orderService({store,gateway});

const app=express(); app.disable('x-powered-by'); app.set('trust proxy',Number(process.env.TRUST_PROXY_HOPS??1));
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'none'"],frameAncestors:["'none'"]}},referrerPolicy:{policy:'no-referrer'},hsts:{maxAge:63072000,includeSubDomains:true}}));
app.use((q,r,n)=>{ if(!q.path.startsWith('/media/')) r.set('Cache-Control','no-store'); n(); });
const lim=(windowMs,max,message)=>rateLimit({windowMs,max,standardHeaders:true,legacyHeaders:false,message:{error:message||'Too many requests, slow down'}});
app.use(lim(6e4,120)); // global, per IP, applied before the body is parsed
app.use(express.json({limit:'6mb',strict:true,type:'application/json'}));
const authLim=lim(15*6e4,20,'Too many attempts. Try again later'), heavyLim=lim(6e4,15), orderLim=lim(6e4,20);

// ---- helpers ----
const wrap=f=>(q,r,n)=>f(q,r).catch(e=>{ if(e instanceof HttpError) return r.status(e.status).json({error:e.message}); if(e instanceof z.ZodError) return r.status(400).json({error:'Invalid request'});
  console.error('error',e.name,e.message); r.status(500).json({error:'Server error, try again'}); });   // never leak stack traces or SQL
const authn=async(q,r,n)=>{ try{ const h=q.headers.authorization||''; if(!h.startsWith('Bearer ')) throw 0;
    q.uid=jwt.verify(h.slice(7),SECRET,{algorithms:['HS256'],issuer:'kautilya',audience:'kautilya-app'}).sub; if(!q.uid||!(await store.getUser(q.uid))) throw 0; n(); }
  catch{ r.status(401).json({error:'Login again'}); } };
const id=z.coerce.number().int().positive().max(2147483647);
const S=(max,min=1)=>z.string().trim().min(min).max(max);
const upiS=z.string().trim().toLowerCase().regex(UPI_RE);

// ---- public ----
app.get('/health',(q,r)=>r.json({ok:true,mock:MOCK,demo:DEMO,ai:{background:has.bg()?'u2net':'built-in',speech:has.whisper()?'whisper':'demo',writer:writerReady()?'local-llm':'built-in'}}));
// Product photos are public on purpose (Amazon/Flipkart fetch them by URL). Served from sniffed bytes with nosniff + sandbox CSP, never as SVG/HTML.
app.get('/media/:id',wrap(async(q,r)=>{ const it=await store.getItem(id.parse(q.params.id)); if(!it) return r.status(404).end(); const img=sniffImage(it.image.replace(/^data:[^,]*,/,'')); if(!img) return r.status(404).end();
  r.set({'Content-Type':img.type,'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=86400','Cross-Origin-Resource-Policy':'cross-origin','Content-Security-Policy':"default-src 'none'; sandbox"}).send(img.buf); }));

// ---- auth: scan QR -> bank info -> verify (mock penny-drop) -> account ----
app.post('/auth/scan',authLim,wrap(async(q,r)=>{ const {qr}=z.object({qr:z.string().max(600)}).strict().parse(q.body); const p=parseUpiQr(qr); if(!p) throw new HttpError(400,'This is not a valid UPI QR');
  r.json(await A.start(p)); }));                                                   // returns bank/app info + (mock) verification credit
app.post('/auth/verify',authLim,wrap(async(q,r)=>{ const b=z.object({upi:upiS,code:z.string().regex(/^\d{6}$/),name:S(80).optional()}).strict().parse(q.body); r.json(await A.verify(b)); }));
app.post('/auth/demo',authLim,wrap(async(q,r)=>{ if(!DEMO) throw new HttpError(404,'Not found'); r.json(await A.demo()); }));
app.post('/auth/refresh',authLim,wrap(async(q,r)=>{ const {refreshToken}=z.object({refreshToken:S(120)}).strict().parse(q.body); r.json(await A.refresh(refreshToken)); }));
app.post('/auth/logout',authn,wrap(async(q,r)=>{ await A.logout(q.uid); r.json({ok:true}); }));
app.get('/me',authn,wrap(async(q,r)=>{ const u=await store.getUser(q.uid); r.json(publicProfile(u)); }));

// ---- marketplace keys: an artisan connects their OWN Amazon / Flipkart seller account. Stored encrypted; the app only ever sees status and non-secret fields. ----
const credLim=lim(15*6e4,40,'Too many attempts. Try again later'), testLim=lim(6e4,5);
const chanS=z.enum(CHANNELS);
const loadCreds=async(uid,ch)=>{ const row=await store.getCred(uid,ch); if(!row) return null; const c=openCreds(row.blob,uid,ch); return c?{creds:c,updated_at:row.updated_at}:null; };
app.get('/integrations',authn,wrap(async(q,r)=>{ const channels={}; for(const ch of CHANNELS){ const x=await loadCreds(q.uid,ch); channels[ch]=credView(ch,x?.creds,x?.updated_at); } r.json({channels}); }));
app.post('/integrations/save',authn,credLim,wrap(async(q,r)=>{
  const b=z.object({channel:chanS,fields:z.record(z.string().max(40),z.union([z.string().max(1300),z.boolean()]))}).strict().parse(q.body);
  const old=(await loadCreds(q.uid,b.channel))?.creds||null; let merged;
  try{ merged=normalise(b.channel,b.fields,old); }catch(e){ if(e instanceof BadCreds) throw new HttpError(400,e.message); throw e; }
  await store.putCred(q.uid,b.channel,sealCreds(merged,q.uid,b.channel)); await store.audit(q.uid,'integration_set',{channel:b.channel});
  r.json(credView(b.channel,merged,new Date())); }));
app.post('/integrations/remove',authn,credLim,wrap(async(q,r)=>{
  const {channel}=z.object({channel:chanS}).strict().parse(q.body); await store.delCred(q.uid,channel); await store.audit(q.uid,'integration_removed',{channel}); r.json(credView(channel,null)); }));
app.post('/integrations/test',authn,testLim,wrap(async(q,r)=>{
  const {channel}=z.object({channel:chanS}).strict().parse(q.body); const x=await loadCreds(q.uid,channel); if(!x) throw new HttpError(404,'Save your keys first');
  r.json(await adapters[channel].check(x.creds)); }));

// ---- listing helper (built in, no AI key): text + category -> bilingual listing + scraped market price ----
app.get('/ai/categories',authn,(q,r)=>r.json(categories()));
app.get('/ai/capabilities',authn,wrap(async(q,r)=>r.json({languages:Object.fromEntries(Object.entries({hi:'हिन्दी',mr:'मराठी',gu:'ગુજરાતી',bn:'বাংলা',ta:'தமிழ்',te:'తెలుగు',kn:'ಕನ್ನಡ',ml:'മലയാളം',pa:'ਪੰਜਾਬੀ',od:'ଓଡ଼ିଆ',en:'English'})),
  studio:await hasSharp(),background:has.bg()?'u2net':'built-in',speech:has.whisper()?'whisper':'demo',writer:writerReady()?'local-llm':'built-in',prices:process.env.PRICE_SCRAPE==='off'?'typical-ranges':'live'})));
// AI Image Studio: background removal + lighting fix + 1200x1200 white e-commerce framing. Falls back to the original photo if image tooling is unavailable.
app.post('/ai/enhance',authn,heavyLim,wrap(async(q,r)=>{ const b=z.object({image:z.string().max(8e6)}).strict().parse(q.body); const img=sniffImage(b.image); if(!img) throw new HttpError(400,'Photo must be a JPEG, PNG or WebP under 4 MB');
  let out=null; try{ out=await enhancePhoto(img.buf); }catch(e){ console.error('studio',e.message); }
  if(!out) return r.json({image:null,report:{background:'unavailable',method:'none',size:null,lighting:{fixed:false}}});
  r.json({image:toDataUrl({type:'image/jpeg',buf:out.buf}),report:out.report}); }));
// Voice note -> transcript (regional language) + English translation with local Whisper; labelled DEMO transcript if the model is not downloaded.
app.post('/ai/voice',authn,heavyLim,wrap(async(q,r)=>{ const b=z.object({audio:z.string().max(5.6e6).default(''),lang:z.enum(langCodes()).default('hi')}).strict().parse(q.body);
  try{ r.json(await transcribe({audio:b.audio,lang:b.lang})); }catch(e){ throw new HttpError(e.status||502,e.status?e.message:'Voice service is busy, please type it instead'); } }));
// Listing: text (any language) + category -> bilingual SEO listing (local LLM if downloaded, else built-in) + explainable price (market + cost + photo detail + season)
app.post('/ai/listing',authn,heavyLim,wrap(async(q,r)=>{ const b=z.object({text:S(400,0).default(''),textEn:S(400,0).optional(),category:z.enum(categories()).optional(),craftOf:S(40).optional(),material:S(40).optional(),image:z.string().max(8e6).optional()}).strict().parse(q.body);
  const img=b.image?sniffImage(b.image):null; if(b.image&&!img) throw new HttpError(400,'Photo must be a JPEG, PNG or WebP under 4 MB');
  const args={text:clean(b.text),textEn:b.textEn&&clean(b.textEn),category:b.category,craftOf:b.craftOf&&clean(b.craftOf),material:b.material&&clean(b.material)};
  const base=makeListing(args); const ai=await aiListing({...args,cats:categories()}); const L=ai?{...base,...ai}:base;
  const [P,feat]=await Promise.all([suggestPrice(base.query,base.fallbackRange),img?analyseImage(img.buf):null]);
  const M=priceModel({category:L.category,text:`${args.text} ${args.textEn||''} ${args.material||''}`,market:P,intricacy:feat?.intricacy});
  const {query,fallbackRange,...listing}=L; r.json({...listing,writer:ai?'local-llm':'built-in',price:M.price,range:M.range,pricing:M,
    priceInfo:{live:P.live,samples:P.samples,sources:P.sources.map(s=>s.name+(s.count?'':' (unavailable)')),note:M.note,noteHi:M.noteHi}}); }));

// ---- items ----
const pub=({image,seller,...rest})=>({...rest,imageUrl:`/media/${rest.id}`});
const withSync=async items=>{ const js=await store.jobsForItems(items.map(i=>i.id)); return items.map(i=>({...pub(i),sync:js.filter(j=>j.item_id===i.id).map(j=>({channel:j.channel,status:j.status,error:j.error}))})); };
app.post('/items',authn,wrap(async(q,r)=>{ const b=z.object({title_en:S(120),desc_en:S(2000),desc_hi:S(2000),price:z.number().positive().max(1e6).multipleOf(0.01),stock:z.number().int().min(1).max(1000).default(1),
    image:z.string().max(8e6),channels:z.array(z.enum(['app',...SYNC_CHANNELS])).max(6).default(['app'])}).strict().parse(q.body);
  const img=sniffImage(b.image); if(!img) throw new HttpError(400,'Photo must be a JPEG, PNG or WebP under 4 MB');
  const it=await store.addItem(q.uid,{...b,title_en:clean(b.title_en),desc_en:clean(b.desc_en),desc_hi:clean(b.desc_hi),image:toDataUrl(img),channels:[...new Set(b.channels)]});
  for(const ch of it.channels.filter(c=>SYNC_CHANNELS.includes(c))) await store.enqueue(it.id,ch);
  await store.audit(q.uid,'item.create',{id:it.id}); r.json((await withSync([it]))[0]); }));
app.get('/items',authn,wrap(async(q,r)=>{ const limit=Math.min(Number(q.query.limit)||50,100);
  if(q.query.mine) return r.json(await withSync(await store.listItems({seller:q.uid,limit}))); r.json((await store.listItems({excludeSeller:q.uid,limit,inStock:true})).map(pub)); }));
app.get('/items/:id',authn,wrap(async(q,r)=>{ const it=await store.getItem(id.parse(q.params.id)); if(!it) throw new HttpError(404,'Item not found'); const u=await store.getUser(it.seller); r.json({...pub(it),sellerName:u?.name||'',sellerVerified:!!u?.verified}); }));

// ---- orders (escrow) ----
const orderRow=async(o,uid)=>{ const it=await store.getItem(o.item_id); const sellerSide=o.seller===uid; const cp=await store.getUser(sellerSide?o.buyer:o.seller);
  return {...view(o),title:it?.title_en||'(removed)',imageUrl:`/media/${o.item_id}`,role:sellerSide?'seller':'buyer',counterparty:cp?.name||(sellerSide?o.buyer.split(':')[0]+' customer':'Seller'), // display name only, never the other party's UPI ID
    shipTo:sellerSide&&['paid','shipped','completed','disputed'].includes(o.status)?o.ship_to:undefined}; };   // buyer's address shared with the seller only after payment
app.post('/orders',authn,orderLim,wrap(async(q,r)=>{ const b=z.object({itemId:id,qty:z.number().int().min(1).max(100),shipTo:S(300,10)}).strict().parse(q.body); r.json(await O.create(q.uid,b)); }));
app.get('/orders',authn,wrap(async(q,r)=>{ const as=q.query.as==='seller'?'seller':'buyer'; const os=as==='seller'?await store.ordersBySeller(q.uid):await store.ordersByBuyer(q.uid); r.json(await Promise.all(os.map(o=>orderRow(o,q.uid)))); }));
app.get('/orders/:id',authn,wrap(async(q,r)=>{ const d=await O.get(q.uid,id.parse(q.params.id)); const o=await store.getOrder(d.id); r.json({...(await orderRow(o,q.uid)),events:d.events.map(e=>({from:e.from_status,to:e.to_status,actor:e.actor==='system'||e.actor==='marketplace'?e.actor:(e.actor===o.buyer?'buyer':'seller'),at:e.at}))}); }));
const act=(path,fn)=>app.post(`/orders/:id/${path}`,authn,orderLim,wrap(async(q,r)=>{ const oid=id.parse(q.params.id); const out=await fn(q.uid,oid,z.object({simulate:z.enum(['success','fail']).optional(),tracking:S(120).optional()}).strict().parse(q.body||{})); await store.audit(q.uid,'order.'+path,{id:oid}); r.json(out); }));
act('pay',(u,i,b)=>O.pay(u,i,{simulate:MOCK?b.simulate:undefined}));   // 'simulate' only exists in mock mode
act('ship',(u,i,b)=>O.ship(u,i,b)); act('confirm',(u,i)=>O.confirm(u,i)); act('cancel',(u,i)=>O.cancel(u,i)); act('dispute',(u,i)=>O.dispute(u,i));

// ---- notifications ----
app.get('/notifications',authn,wrap(async(q,r)=>r.json({unread:await store.unreadCount(q.uid),items:(await store.notesFor(q.uid)).map(n=>({id:n.id,orderId:n.order_id,kind:n.kind,text:n.text,read:n.read,at:n.at}))})));
app.post('/notifications/read',authn,wrap(async(q,r)=>{ await store.markNotesRead(q.uid); r.json({ok:true}); }));

// ---- earnings: released app orders + completed marketplace orders count as earned; paid/shipped/disputed are "pending in escrow/marketplace" ----
app.get('/earnings',authn,wrap(async(q,r)=>{ const os=await store.ordersBySeller(q.uid), by={app:0,flipkart:0,amazon:0}, mo={}; let total=0,pending=0;
  for(const x of os){ if(x.status==='completed'){ total+=x.amount; by[x.channel]=(by[x.channel]||0)+x.amount; const m=new Date(x.at).toLocaleString('en',{month:'short'}); mo[m]=(mo[m]||0)+x.amount; } else if(['paid','shipped','disputed'].includes(x.status)) pending+=x.amount; }
  r.json({total:Math.round(total*100)/100,pending:Math.round(pending*100)/100,month:Object.entries(mo).map(([m,v])=>({m,v})),bySource:by}); }));

// ---- demo-only (mock marketplace). Not mounted in production. ----
if(!PROD&&process.env.MOCK_MARKETPLACE==='1'){
  app.post('/dev/market-sale',authn,wrap(async(q,r)=>{ const b=z.object({itemId:id,channel:z.enum(SYNC_CHANNELS),qty:z.number().int().min(1).max(10).default(1),advance:z.object({externalId:S(60),status:z.enum(['shipped','completed','cancelled'])}).optional()}).strict().parse(q.body);
    const it=await store.getItem(b.itemId); if(!it||it.seller!==q.uid) throw new HttpError(404,'Item not found'); if(b.advance) mockMarket.advance(b.advance.externalId,b.advance.status); else mockMarket.sale(b.channel,it.id,b.qty,it.price);
    await importOrders(store); r.json({ok:true}); })); }

// ---- final handlers: bad JSON, oversized bodies, unknown routes ----
app.use((q,r)=>r.status(404).json({error:'Not found'}));
app.use((e,q,r,n)=>{ if(e.type==='entity.too.large') return r.status(413).json({error:'Too large'}); if(e.type==='entity.parse.failed'||e instanceof SyntaxError) return r.status(400).json({error:'Invalid request'}); console.error('error',e.name); r.status(500).json({error:'Server error, try again'}); });
process.on('unhandledRejection',e=>console.error('unhandled',e?.message));
startWorker(store,15e3,[()=>O.sweep()]);
app.listen(process.env.PORT||3000,()=>console.log(`API up (mock payments: ${MOCK})`));
