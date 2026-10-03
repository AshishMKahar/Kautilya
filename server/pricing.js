// Built-in price scraper. Reads public search-result pages of Amazon.in and Flipkart, extracts listed prices, and returns a robust
// suggestion (median, with p25-p75 as the range). If both sites block us or return too few prices, falls back to a built-in
// category table and says so. Scraping is best-effort: sites change markup, rate-limit and may forbid it in their terms.
// Turn it off with PRICE_SCRAPE=off. Only the hosts below are ever contacted (no user-supplied URLs => no SSRF).
const UA='Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const MAX_BYTES=1.5*1024*1024, TIMEOUT=6000, TTL=6*3600e3, cache=new Map();
const num=s=>Number(String(s).replace(/[,\s]/g,''));
const ok=n=>Number.isFinite(n)&&n>=20&&n<=500000;
export const parsers={
  amazon:html=>[...html.matchAll(/class="a-price-whole">\s*([\d,]+)/g)].map(m=>num(m[1])).filter(ok),
  flipkart:html=>[...html.matchAll(/(?:₹|&#8377;|Rs\.?\s?)\s?([\d,]{2,9})(?![\d,]*%)/g)].map(m=>num(m[1])).filter(ok)};
export const SOURCES=[
  {name:'amazon',host:'www.amazon.in',url:q=>`https://www.amazon.in/s?k=${encodeURIComponent(q)}`},
  {name:'flipkart',host:'www.flipkart.com',url:q=>`https://www.flipkart.com/search?q=${encodeURIComponent(q)}`}];
async function readCapped(r){const reader=r.body?.getReader?.(); if(!reader) return (await r.text()).slice(0,MAX_BYTES); let n=0,out=[];
  for(;;){const {done,value}=await reader.read(); if(done) break; n+=value.length; if(n>MAX_BYTES){reader.cancel();break;} out.push(value);} return Buffer.concat(out).toString('utf8');}
async function fetchSource(src,q,fetchImpl){
  const u=new URL(src.url(q)); if(u.protocol!=='https:'||u.host!==src.host&&!src.testOk) throw new Error('blocked host');
  const ctl=new AbortController(), t=setTimeout(()=>ctl.abort(),TIMEOUT);
  try{const r=await fetchImpl(u,{headers:{'user-agent':UA,'accept-language':'en-IN,en;q=0.9',accept:'text/html'},redirect:'manual',signal:ctl.signal});
    if(!r.ok) throw new Error('http '+r.status); const html=await readCapped(r);
    if(/captcha|robot check|Enter the characters you see/i.test(html.slice(0,20000))) throw new Error('bot check'); return html;}
  finally{clearTimeout(t);} }
const pct=(a,p)=>a[Math.min(a.length-1,Math.max(0,Math.round((a.length-1)*p)))];
export function summarise(prices){ // drop outliers beyond 2.5x/0.4x of the median, then median + quartiles
  const s=[...prices].sort((a,b)=>a-b), m0=pct(s,.5), k=s.filter(x=>x>=m0*.4&&x<=m0*2.5);
  return {price:Math.round(pct(k,.5)),range:[Math.round(pct(k,.25)),Math.round(pct(k,.75))],n:k.length}; }
export async function suggestPrice(query,fallbackRange,{fetchImpl=globalThis.fetch,sources=SOURCES,now=Date.now()}={}){
  const key=query.toLowerCase(), hit=cache.get(key); if(hit&&hit.exp>now) return hit.v;
  const fb=()=>{const [lo,hi]=fallbackRange; return {price:Math.round((lo+hi)/2),range:[lo,hi],samples:0,live:false,sources:[],note:'Live prices unavailable; showing a typical range for this craft.'};};
  if(process.env.PRICE_SCRAPE==='off') return fb();
  const used=[],all=[];
  await Promise.all(sources.map(async s=>{try{const p=(s.parse||parsers[s.name])(await fetchSource(s,query,fetchImpl)).slice(0,30); if(p.length){all.push(...p);used.push({name:s.name,count:p.length});}}catch(e){used.push({name:s.name,count:0,error:String(e.message).slice(0,60)});}}));
  if(all.length<5){const f=fb(); f.sources=used; return f;}
  const sm=summarise(all), v={price:sm.price,range:sm.range,samples:sm.n,live:true,sources:used,note:`Based on ${sm.n} current marketplace prices.`};
  cache.set(key,{v,exp:now+TTL}); if(cache.size>200) cache.delete(cache.keys().next().value); return v; }
export const _clearCache=()=>cache.clear();
