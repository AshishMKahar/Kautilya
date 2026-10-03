// Built-in listing writer (no AI key needed). Detects the craft from what the artisan typed/said and fills bilingual copy.
// [id, keywords (en/hinglish/devanagari), EN noun, HI noun, fallback price range INR, search query]
const CATS=[
 ['saree',['saree','sari','साड़ी','साड़ी','banarasi','chanderi','paithani'],'Handloom Saree','हथकरघा साड़ी',[1200,6500],'handloom saree'],
 ['pottery',['pot','pottery','clay','matka','diya','terracotta','मिट्टी','कुल्हड़','घड़ा','दीया'],'Handmade Clay Pottery','हाथ से बना मिट्टी का बर्तन',[150,1200],'terracotta pottery handmade'],
 ['basket',['basket','bamboo','cane','jute','wicker','टोकरी','बांस','बाँस','सूप'],'Handwoven Bamboo & Cane Basket','हाथ से बुनी बाँस की टोकरी',[250,1500],'bamboo basket handmade'],
 ['jewellery',['jewel','jewellery','jewelry','necklace','earring','bangle','kada','झुमके','गहने','हार','चूड़ी','कंगन'],'Handcrafted Artisan Jewellery','हस्तनिर्मित आभूषण',[300,3000],'handmade jewellery artisan'],
 ['woodcraft',['wood','wooden','sandalwood','channapatna','toy','लकड़ी','खिलौना'],'Hand-carved Wooden Craft','हाथ से तराशा लकड़ी का सामान',[300,3500],'wooden handicraft'],
 ['textile',['shawl','stole','dupatta','scarf','bedsheet','rug','carpet','durrie','dari','कालीन','शॉल','दुपट्टा','चादर'],'Handwoven Textile','हथकरघा कपड़ा',[500,4500],'handloom shawl stole'],
 ['painting',['painting','madhubani','warli','gond','pattachitra','art','पेंटिंग','चित्र'],'Traditional Hand-painted Artwork','पारंपरिक हाथ से बनी पेंटिंग',[400,6000],'madhubani painting handmade'],
 ['metal',['brass','copper','bidri','dhokra','bell metal','pital','पीतल','तांबा','ताँबा','कांसा'],'Handcrafted Brass & Metal Ware','हस्तनिर्मित पीतल/धातु का सामान',[500,5000],'brass handicraft'],
 ['leather',['leather','jutti','mojari','chappal','kolhapuri','जूती','चमड़ा','चप्पल'],'Handcrafted Leather Footwear','हस्तनिर्मित चमड़े की जूती',[400,2500],'kolhapuri chappal handmade'],
 ['food',['pickle','achar','papad','jaggery','millet','masala','अचार','पापड़','गुड़'],'Homemade Traditional Food','घर का बना पारंपरिक खाना',[100,600],'homemade pickle'],
];
const OTHER=['craft',[],'Handmade Craft Product','हस्तनिर्मित शिल्प',[200,2000],'handmade handicraft'];
export const categories=()=>CATS.map(c=>c[0]);
const norm=s=>String(s||'').toLowerCase();
export function detect(text,hint){
  const t=norm(text), h=norm(hint); const byHint=CATS.find(c=>c[0]===h); if(byHint) return byHint;
  let best=null,score=0; for(const c of CATS){const s=c[1].filter(k=>t.includes(norm(k))).length; if(s>score){best=c;score=s;}}
  return best||OTHER; }
const cap=s=>s.replace(/\b\w/g,m=>m.toUpperCase());
const hasLatin=s=>/[A-Za-z]/.test(s), hasDeva=s=>/[\u0900-\u097F]/.test(s);
export function makeListing({text='',textEn='',category,craftOf,material}={}){
  const c=detect(`${text} ${textEn}`,category), [id,,en,hi,range,q]=c; const place=craftOf?` from ${cap(String(craftOf).slice(0,40))}`:'', mat=material?` ${norm(material).slice(0,40)}`:'';
  const enHint=String(textEn||(hasLatin(text)?text:'')).trim().slice(0,160), hiHint=hasDeva(text)?String(text).trim().slice(0,160):'';
  const title_en=`${cap(mat.trim())||''} ${en}${place}`.trim().replace(/\s+/g,' ').slice(0,120);
  const desc_en=`${en} made by hand by an Indian artisan${place}. Each piece is unique, so small variations are a mark of authenticity.${enHint?` Details from the maker: ${enHint}.`:''} Buying directly supports the artisan and keeps traditional craft alive. Gift-ready and made with care.`;
  const desc_hi=`${hi} — भारतीय कारीगर के हाथों से बना${craftOf?` (${String(craftOf).slice(0,40)})`:''}। हर पीस अनोखा है, इसलिए हल्का फ़र्क़ हाथ की कारीगरी की पहचान है।${hiHint?` कारीगर के अनुसार: ${hiHint}।`:''} सीधे कारीगर से खरीदने पर उनकी कमाई बढ़ती है।`;
  const keywords=[...new Set([en.toLowerCase(),`handmade ${q}`,'handicraft','artisan made','indian handicraft','buy direct from artisan','gift',craftOf&&`${norm(craftOf).slice(0,30)} craft`,mat.trim()&&`${mat.trim()} ${id}`].filter(Boolean))].slice(0,10);
  return {category:id,title_en,desc_en,desc_hi,keywords,query:`${mat.trim()} ${q}`.trim(),fallbackRange:range}; }
