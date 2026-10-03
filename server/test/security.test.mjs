import test from 'node:test'; import assert from 'node:assert/strict';
import {checkSecret,sniffImage,safeEq,clean,otp} from '../security.js'; import {parseUpiQr,bankInfo,maskUpi} from '../bank.js';
import {makeListing,detect} from '../listing.js'; import {suggestPrice,summarise,_clearCache} from '../pricing.js';
const jpeg=Buffer.concat([Buffer.from([0xFF,0xD8,0xFF,0xE0]),Buffer.alloc(100,1)]).toString('base64');
test('JWT secret must be long and not a placeholder',()=>{ assert.throws(()=>checkSecret('short')); assert.throws(()=>checkSecret(undefined)); assert.throws(()=>checkSecret('change-me-'+'x'.repeat(40))); assert.ok(checkSecret('k'.repeat(10)+'Zq9!'.repeat(10))); });
test('image sniffing trusts bytes: jpeg ok, svg/html/oversize/garbage rejected',()=>{
  assert.equal(sniffImage(jpeg).type,'image/jpeg'); assert.equal(sniffImage('data:image/jpeg;base64,'+jpeg).type,'image/jpeg');
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'.padEnd(80,' ')).toString('base64')),null);
  assert.equal(sniffImage(Buffer.from('<html><body>'.padEnd(80,' ')).toString('base64')),null); assert.equal(sniffImage('data:image/svg+xml;base64,'+jpeg),null);
  assert.equal(sniffImage('not base64!!'),null); assert.equal(sniffImage(Buffer.concat([Buffer.from([0xFF,0xD8,0xFF]),Buffer.alloc(5e6)]).toString('base64')),null); });
test('safeEq, clean, otp',()=>{ assert.ok(safeEq('abc','abc')); assert.ok(!safeEq('abc','abd')); assert.ok(!safeEq('abc','abcd'));
  assert.equal(clean('a\u202Eb\n\n  c\u0000'),'a b c'); assert.match(otp(),/^\d{6}$/); });
test('UPI QR parsing + bank/app inference; rejects junk',()=>{
  assert.deepEqual(parseUpiQr('upi://pay?pa=Ramesh@OKHDFCBANK&pn=Ramesh%20K&cu=INR'),{upi:'ramesh@okhdfcbank',name:'Ramesh K'});
  for(const bad of ['http://x','upi://pay?pa=nohandle','upi://pay?pa=a@b','upi://pay?pn=x',null,'upi://pay?pa='+'a'.repeat(700)+'@okaxis','upi://pay?pa=x y@okaxis']) assert.equal(parseUpiQr(bad),null,String(bad).slice(0,30));
  assert.equal(bankInfo('a1@okaxis').app,'Google Pay'); assert.equal(bankInfo('a1@apl').app,'Amazon Pay'); assert.equal(bankInfo('a1@zzz').recognised,false); assert.equal(bankInfo('a1@okaxis').accountNumber,null);
  assert.ok(!maskUpi('ramesh@okaxis').includes('ramesh')); });
test('listing writer detects craft in English/Hinglish/Hindi, no AI key',()=>{
  assert.equal(detect('beautiful banarasi saree').at(0),'saree'); assert.equal(detect('मिट्टी का दीया').at(0),'pottery'); assert.equal(detect('xyz').at(0),'craft'); assert.equal(detect('xyz','metal').at(0),'metal');
  const l=makeListing({text:'bamboo basket',craftOf:'Assam'}); assert.match(l.title_en,/Basket.*Assam/); assert.ok(l.desc_hi.length>20&&/[\u0900-\u097F]/.test(l.desc_hi)); });
test('price summary drops outliers; scraper uses live data, falls back when blocked, never calls unknown hosts',async()=>{
  assert.deepEqual(summarise([100,110,120,130,140,99999,2]).price,120);
  const html=[450,480,520,560,610].map(p=>`<span class="a-price-whole">${p}</span>`).join(''); const seen=[]; _clearCache();
  const f=async u=>{seen.push(String(u));return {ok:true,body:null,text:async()=>html};};
  const r=await suggestPrice('pot',[1,2],{fetchImpl:f}); assert.equal(r.live,true); assert.equal(r.price,520); assert.ok(seen.every(u=>/^https:\/\/www\.(amazon\.in|flipkart\.com)\//.test(u)));
  _clearCache(); const b=await suggestPrice('pot2',[100,300],{fetchImpl:async()=>({ok:true,body:null,text:async()=>'<html>Enter the characters you see below</html>'})}); assert.equal(b.live,false); assert.deepEqual(b.range,[100,300]);
  _clearCache(); process.env.PRICE_SCRAPE='off'; let called=0; const o=await suggestPrice('pot3',[100,300],{fetchImpl:async()=>{called++;}}); delete process.env.PRICE_SCRAPE; assert.equal(called,0); assert.equal(o.live,false); });
