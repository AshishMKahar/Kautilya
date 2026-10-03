import test from 'node:test'; import assert from 'node:assert/strict';
import sharp from 'sharp';
import {enhancePhoto,analyseImage,findForeground} from '../studio.js'; import {priceModel} from '../pricemodel.js';
import {transcribe,sniffAudio,aiListing,decodeAudio} from '../ai.js'; import {seed,unseed} from '../models.js'; import {makeListing} from '../listing.js';
import {memoryStore} from '../store.js'; import {authService} from '../service.js'; import {seedDemo} from '../demo.js';

const noise=i=>{let t=Math.imul(i^0x9E3779B9,0x85EBCA6B);t^=t>>>13;t=Math.imul(t,0xC2B2AE35);t^=t>>>16;return t&255;};
const photo=async(bg,dark=1)=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><rect width="900" height="700" fill="${bg}"/><ellipse cx="450" cy="360" rx="220" ry="200" fill="rgb(${Math.round(180*dark)},${Math.round(60*dark)},${Math.round(40*dark)})"/><rect x="380" y="300" width="140" height="120" fill="rgb(${Math.round(230*dark)},${Math.round(190*dark)},${Math.round(60*dark)})"/></svg>`)).jpeg().toBuffer();
const px=async(buf,x,y)=>{const {data,info}=await sharp(buf).raw().toBuffer({resolveWithObject:true}); const i=(y*info.width+x)*info.channels; return [data[i],data[i+1],data[i+2]];};

test('studio: plain background is removed, product centred on 1200x1200 pure white JPEG',async()=>{
  const out=await enhancePhoto(await photo('#cfcac0')); const m=await sharp(out.buf).metadata();
  assert.equal(m.format,'jpeg'); assert.equal(m.width,1200); assert.equal(m.height,1200);
  assert.equal(out.report.background,'removed'); assert.equal(out.report.method,'built-in');
  for(const [x,y] of [[5,5],[1190,5],[5,1190],[1190,1190]]){ const p=await px(out.buf,x,y); assert.ok(p.every(v=>v>=248),'corner is white '+p); }
  const c=await px(out.buf,600,600); assert.ok(c.some(v=>v<235),'product present in the middle '+c); });
test('studio: product keeps its shape and fills the frame (guards against buffer-stride bugs)',async()=>{
  const out=await enhancePhoto(await photo('#cfcac0')); const {data,info}=await sharp(out.buf).raw().toBuffer({resolveWithObject:true});
  let x0=1e9,y0=1e9,x1=-1,y1=-1; for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++){ const i=(y*info.width+x)*3; if(data[i]<200||data[i+1]<200||data[i+2]<200){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } }
  const bw=x1-x0+1, bh=y1-y0+1; assert.ok(bh>=.6*1200&&bh<=.9*1200,'height '+bh); assert.ok(bw/bh>.95&&bw/bh<1.3,'aspect '+(bw/bh)); assert.ok(Math.abs((x0+x1)/2-600)<40,'centred x'); });
test('studio: product colour is preserved (no grey/olive wash)',async()=>{
  const out=await enhancePhoto(await photo('#cfcac0')); const c=await px(out.buf,520,700); // body of the red-brown ellipse
  assert.ok(c[0]>c[1]+30&&c[1]>=c[2]-10,'still red/brown-dominant '+c); });
test('studio: dark photo is brightened and the report says lighting was fixed',async()=>{
  const out=await enhancePhoto(await photo('#2a2824',.45)); assert.equal(out.report.lighting.fixed,true); assert.ok(out.report.lighting.exposure>1.1,'exposure lift '+out.report.lighting.exposure); });
test('studio: busy background -> keeps the photo instead of producing a bad cut-out',async()=>{
  const w=300,h=300,raw=Buffer.alloc(w*h*3); for(let i=0;i<raw.length;i++) raw[i]=noise(i);
  const noisy=await sharp(raw,{raw:{width:w,height:h,channels:3}}).jpeg().toBuffer(); const out=await enhancePhoto(noisy); assert.equal(out.report.background,'kept'); assert.equal((await sharp(out.buf).metadata()).width,1200); });
test('studio: findForeground rejects an all-background frame',()=>{ const rgb=Buffer.alloc(40*40*3,200); assert.equal(findForeground(rgb,40,40),null); });
test('image analysis: plain vs detailed',async()=>{
  const flat=await sharp({create:{width:300,height:300,channels:3,background:'#888'}}).jpeg().toBuffer(); const w=300,raw=Buffer.alloc(w*w*3); for(let i=0;i<raw.length;i++) raw[i]=noise(i);
  const busy=await sharp(raw,{raw:{width:w,height:w,channels:3}}).png().toBuffer(); assert.ok((await analyseImage(flat)).intricacy<.1); assert.ok((await analyseImage(busy)).intricacy>.5); });

test('pricing: never suggests below cost; market below cost is flagged',()=>{
  const m=priceModel({category:'pottery',text:'handmade clay matka 2 litre',market:{live:true,price:60,range:[40,90],samples:20},now:new Date('2026-06-10')});
  assert.ok(m.price>=m.floor,'price>=floor'); assert.equal(m.breakdown.material+m.breakdown.labour+m.breakdown.overhead,m.floor); assert.match(m.note,/below your cost/); assert.ok(m.range[0]>=m.floor); });
test('pricing: silk + days of work + festive season raise the price; breakdown is explained',()=>{
  const a=priceModel({category:'saree',text:'cotton saree',now:new Date('2026-06-10')}), b=priceModel({category:'saree',text:'banarasi silk saree with zari, took 15 days',now:new Date('2026-10-10')});
  assert.ok(b.price>a.price*1.5,`${b.price} vs ${a.price}`); assert.equal(b.hours,90); assert.ok(b.factors.some(f=>f.k==='season')); assert.ok(b.factors.some(f=>f.k==='material')); assert.ok(b.factors.some(f=>f.k==='time')); });
test('pricing: live market median is used when it clears the cost floor; intricacy nudges it',()=>{
  const mk={live:true,price:6000,range:[4500,7500],samples:30}, plain=priceModel({category:'saree',text:'saree',market:mk,intricacy:0,now:new Date('2026-06-10')}), rich=priceModel({category:'saree',text:'saree',market:mk,intricacy:1,now:new Date('2026-06-10')});
  assert.match(rich.note,/live marketplace/); assert.ok(rich.price>plain.price); assert.equal(rich.market.median,6000); });
test('pricing: no live data -> estimate that still respects cost',()=>{ const m=priceModel({category:'jewellery',text:'silver earrings',market:{live:false,range:[300,3000]},now:new Date('2026-06-10')}); assert.equal(m.basis,'estimate'); assert.ok(m.price>=m.floor); });

test('voice: always a labelled demo transcript per language; unknown language falls back to Hindi',async()=>{
  const t=await transcribe({audio:'',lang:'ta'}); assert.equal(t.demo,true); assert.equal(t.lang,'ta'); assert.match(t.original,/[\u0B80-\u0BFF]/); assert.match(t.english,/bamboo basket/);
  const k=await transcribe({audio:'',lang:'pa'}); assert.equal(k.lang,'hi'); });
const sal=(f)=>{ const S=320,a=new Float32Array(S*S); for(let y=0;y<S;y++) for(let x=0;x<S;x++) a[y*S+x]=f(x,y); return a; };
test('studio: U2-Net mask is used when the model is available; bad/failed model falls back to built-in',async()=>{
  let seen; seed('bg',async(chw,S)=>{ seen={len:chw.length,S,max:Math.max(...chw.slice(0,5000))}; return sal((x,y)=>((x-160)/100)**2+((y-165)/90)**2<1?4.2:-3.1); });
  const ok=await enhancePhoto(await photo('#cfcac0')); assert.equal(ok.report.method,'u2net'); assert.equal(ok.report.background,'removed'); assert.equal(seen.len,3*320*320); assert.ok(seen.max<3,'input is normalised');
  seed('bg',async()=>{ throw new Error('onnx exploded'); }); const bad=await enhancePhoto(await photo('#cfcac0')); assert.equal(bad.report.method,'built-in');
  seed('bg',async()=>sal(()=>1)); const all=await enhancePhoto(await photo('#cfcac0')); assert.equal(all.report.method,'built-in','whole-frame saliency is rejected'); unseed('bg'); });
test('voice: Whisper path transcribes in the language and translates to English',async()=>{
  const calls=[]; const asr=async(pcm,o)=>{ calls.push(o); return {text:o.task==='translate'?' handwoven silk saree ':'हाथ से बुनी रेशमी साड़ी'}; };
  const audio=Buffer.concat([Buffer.alloc(4),Buffer.from('ftypM4A '),Buffer.alloc(200,1)]).toString('base64'), _decode=async()=>new Float32Array(16000);
  const t=await transcribe({audio,lang:'hi',_pipe:asr,_decode}); assert.equal(t.demo,false); assert.equal(t.english,'handwoven silk saree'); assert.match(t.original,/साड़ी/); assert.deepEqual(calls.map(c=>c.task).sort(),['transcribe','translate']); assert.ok(calls.every(c=>c.language==='hi'));
  calls.length=0; const e=await transcribe({audio,lang:'en',_pipe:asr,_decode}); assert.equal(calls.length,1); assert.equal(e.lang,'en');
  await assert.rejects(transcribe({audio:'AAAA',lang:'hi',_pipe:asr,_decode}),/audio/i);
  await assert.rejects(transcribe({audio,lang:'hi',_pipe:async()=>{throw new Error('x');},_decode}),e=>e.status===502); });
test('audio sniffing accepts real containers only',()=>{ assert.equal(sniffAudio(Buffer.concat([Buffer.alloc(4),Buffer.from('ftypM4A '),Buffer.alloc(100)]).toString('base64')).type,'audio/mp4'); assert.equal(sniffAudio(Buffer.from('<html>'.padEnd(100)).toString('base64')),null); });
test('audio decode: a real WAV becomes 16 kHz mono float samples (needs ffmpeg)',async t=>{
  const sr=8000,n=sr,b=Buffer.alloc(44+n*2); b.write('RIFF',0); b.writeUInt32LE(36+n*2,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(sr,24); b.writeUInt32LE(sr*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++) b.writeInt16LE(Math.round(12000*Math.sin(i*.2)),44+i*2);
  let pcm; try{ pcm=await decodeAudio(sniffAudio(b.toString('base64'))); }catch(e){ if(/ENOENT/.test(String(e))) return t.skip('ffmpeg not installed'); throw e; }
  assert.ok(Math.abs(pcm.length-16000)<200,'resampled to ~1 s at 16 kHz: '+pcm.length); assert.ok(Math.max(...pcm)>.2&&Math.max(...pcm)<=1); });
const llm=text=>async()=>[{generated_text:[{role:'user',content:'q'},{role:'assistant',content:text}]}];
test('local LLM writer: validated, partial output kept, junk and timeouts fall back to built-in',async()=>{
  const cats=['saree','craft','pottery'], hi='यह हाथ से बुनी हुई रेशमी साड़ी बनारस के कारीगरों ने बनाई है और बहुत सुंदर है।';
  assert.equal(await aiListing({text:'x',cats}),null,'no model -> null');
  const good=await aiListing({text:'रेशमी साड़ी',cats,_pipe:llm('```json\n'+JSON.stringify({title_en:'Handwoven Silk Saree',desc_en:'A handwoven silk saree made by village weavers with care and patience over many days.',desc_hi:hi,keywords:['Silk Saree','handloom','banarasi','gift'],category:'saree'})+'\n```')});
  assert.equal(good.category,'saree'); assert.equal(good.desc_hi,hi); assert.deepEqual(good.keywords,['silk saree','handloom','banarasi','gift']);
  const part=await aiListing({text:'x',category:'craft',cats,_pipe:llm(JSON.stringify({title_en:'Silk Saree Weave',desc_en:'A handwoven silk saree made by village weavers with care and patience.',desc_hi:'english only text',keywords:['a'],category:'pottery'}))});
  assert.equal(part.desc_hi,undefined,'non-Devanagari Hindi dropped'); assert.equal(part.keywords,undefined); assert.equal(part.category,undefined,'artisan category wins');
  assert.equal(await aiListing({text:'x',cats,_pipe:llm('sorry, I cannot')}),null); assert.equal(await aiListing({text:'x',cats,_pipe:async()=>{throw new Error('oom');}}),null);
  assert.equal(await aiListing({text:'x',cats,_pipe:llm('{"title_en":"Hi","desc_en":"short"}')}),null,'too short -> null'); });
test('built-in writer: English transcript drives detection + SEO tags; Devanagari only in the Hindi text',()=>{
  const L=makeListing({text:'இது கூடை',textEn:'handmade bamboo basket',craftOf:'Assam'}); assert.equal(L.category,'basket'); assert.ok(L.keywords.includes('handicraft')); assert.ok(L.keywords.length>=6);
  assert.match(L.desc_en,/handmade bamboo basket/); assert.doesNotMatch(L.desc_hi,/இது/); });

test('demo: one-tap login works and seeding is idempotent with a populated shop, items and earnings',async()=>{
  const store=memoryStore(); await seedDemo(store); await seedDemo(store); const A=authService({store,sign:u=>'jwt.'+u});
  const d=await A.demo(); assert.equal(d.profile.upi,'demo.artisan@okaxis'); assert.ok(d.token&&d.refreshToken);
  assert.equal((await store.listItems({seller:'demo.artisan@okaxis'})).length,2); assert.equal((await store.listItems({excludeSeller:'demo.artisan@okaxis'})).length,2);
  const orders=await store.ordersBySeller('demo.artisan@okaxis'); assert.equal(orders.length,3); assert.ok(orders.every(o=>o.status==='completed'));
  const it=await store.getItem(1); assert.match(it.image,/^data:image\/jpeg;base64,/); });
