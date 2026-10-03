// Demo seed (DEMO_MODE=1 only): a few artisans with illustrated products so Shop / Items / Earnings are not empty on stage.
// Product photos are drawn as simple illustrations (sharp renders the SVG), clearly placeholders, not scraped or copyrighted images.
import {bankInfo} from './bank.js'; import {toDataUrl} from './security.js';
let sharpP; const getSharp=()=>sharpP??=import('sharp').then(m=>m.default).catch(()=>null);
const svg=(bg,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900"><defs><radialGradient id="g" cx="50%" cy="35%" r="80%"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient></defs><rect width="900" height="900" fill="url(#g)"/>${body}</svg>`;
const ART={
  matka:svg(['#F6E7D3','#E4C9A6'],`<ellipse cx="450" cy="760" rx="230" ry="38" fill="#00000022"/><path d="M300 330 Q220 520 330 700 Q450 780 570 700 Q680 520 600 330 Z" fill="#B5532B"/><ellipse cx="450" cy="330" rx="150" ry="42" fill="#8E3F1F"/><ellipse cx="450" cy="330" rx="118" ry="28" fill="#4A1F0E"/><path d="M310 520 Q450 560 590 520" stroke="#F1C27D" stroke-width="14" fill="none"/><path d="M322 580 Q450 620 578 580" stroke="#F1C27D" stroke-width="8" fill="none"/>`),
  basket:svg(['#EFF3E6','#CFDAB8'],`<ellipse cx="450" cy="770" rx="260" ry="36" fill="#00000022"/><path d="M200 380 L260 740 Q450 790 640 740 L700 380 Z" fill="#C79A55"/>${[...Array(7)].map((_,i)=>`<path d="M${230+i*7} ${430+i*45} Q450 ${470+i*45} ${670-i*7} ${430+i*45}" stroke="#8A6528" stroke-width="10" fill="none"/>`).join('')}<ellipse cx="450" cy="380" rx="250" ry="52" fill="#A87B38"/><ellipse cx="450" cy="380" rx="215" ry="38" fill="#6B4A19"/>`),
  saree:svg(['#FBE9E7','#F3C1B8'],`<rect x="170" y="190" width="560" height="520" rx="16" fill="#8E1B3A"/>${[...Array(9)].map((_,i)=>`<rect x="${170+i*70}" y="190" width="14" height="520" fill="${i%2?'#E0A100':'#F6D77A'}"/>`).join('')}<rect x="170" y="190" width="560" height="60" fill="#E0A100"/><rect x="170" y="650" width="560" height="60" fill="#E0A100"/>${[...Array(8)].map((_,i)=>`<circle cx="${205+i*70}" cy="450" r="20" fill="#F6D77A"/>`).join('')}`),
  lamp:svg(['#FFF4D6','#F0D48A'],`<ellipse cx="450" cy="780" rx="200" ry="30" fill="#00000022"/><path d="M330 700 L370 560 L530 560 L570 700 Z" fill="#C9962B"/><rect x="420" y="470" width="60" height="100" fill="#B07F1E"/><path d="M290 470 Q450 340 610 470 Q450 520 290 470 Z" fill="#D9A93A"/><path d="M450 330 Q500 240 450 180 Q400 240 450 330 Z" fill="#FF8A1F"/><path d="M450 300 Q475 250 450 220 Q425 250 450 300 Z" fill="#FFD25E"/>`)};
const SELLERS=[
  {upi:'demo.artisan@okaxis',name:'Lakshmi Devi (Demo)',items:[
    {art:'saree',title_en:'Handloom Cotton Saree from Chanderi',desc_en:'Handloom cotton saree with a golden zari border, woven by hand in a village cluster. Light, breathable and unique in every piece. Buying directly supports the weaver.',desc_hi:'हथकरघा सूती साड़ी, सुनहरी ज़री के बॉर्डर के साथ, गाँव के बुनकरों ने हाथ से बुनी। हर पीस अनोखा है।',price:2450,stock:4,channels:['app','gem']},
    {art:'matka',title_en:'Handmade Terracotta Matka, 2 Litre',desc_en:'Handmade terracotta water pot that keeps water naturally cool. Fired in a traditional kiln by a village potter.',desc_hi:'हाथ से बना मिट्टी का मटका, पानी को प्राकृतिक रूप से ठंडा रखता है।',price:320,stock:12,channels:['app','ondc']}],
    sales:[['saree',2450,2,'gem'],['matka',320,5,'ondc'],['saree',2450,1,'gem']]},
  {upi:'demo.weaver@oksbi',name:'Rukmini Bai',items:[
    {art:'basket',title_en:'Handwoven Bamboo & Cane Basket',desc_en:'Sturdy handwoven bamboo basket, ideal for storage or gifting. Made by a women self-help group.',desc_hi:'मज़बूत हाथ से बुनी बाँस की टोकरी, महिला स्वयं-सहायता समूह द्वारा बनाई गई।',price:540,stock:8,channels:['app']}]},
  {upi:'demo.metal@ybl',name:'Dhokra Craft Collective',items:[
    {art:'lamp',title_en:'Handcrafted Brass Diya Lamp',desc_en:'Cast brass diya with a traditional finish. A festive centrepiece and a gift that lasts.',desc_hi:'पारंपरिक फिनिश वाला पीतल का दीया। त्योहार और उपहार के लिए।',price:890,stock:6,channels:['app']}]}];
export async function seedDemo(store){
  const sharp=await getSharp(); if(!sharp){ console.warn('demo seed skipped: install sharp to draw demo product photos'); return; }
  const pics={}; for(const [k,v] of Object.entries(ART)) pics[k]=toDataUrl({type:'image/jpeg',buf:await sharp(Buffer.from(v)).jpeg({quality:82}).toBuffer()});
  for(const s of SELLERS){
    if((await store.listItems({seller:s.upi,limit:1})).length) continue;                  // already seeded (persistent database)
    await store.upsertUser({uid:s.upi,upi:s.upi,name:s.name,bank:bankInfo(s.upi),verified:true}); const made={};
    for(const {art,...it} of s.items){ const row=await store.addItem(s.upi,{...it,image:pics[art]}); made[art]=row; for(const ch of it.channels.filter(c=>c!=='app')) await store.enqueue(row.id,ch); }
    let n=0; for(const [art,amount,qty,channel] of s.sales||[]) if(made[art]) await store.addOrder({item_id:made[art].id,qty,buyer:`${channel}:customer`,seller:s.upi,amount:amount*qty,channel,status:'completed',escrow:false,external_id:`DEMO-${s.upi}-${++n}`});
  }
}
