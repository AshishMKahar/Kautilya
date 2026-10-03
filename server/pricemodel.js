// Dynamic Pricing Assistant: a transparent, explainable model (not a trained neural net). It combines
//   (a) cost-plus floor: raw material + fair-wage labour + overheads, so an artisan is never nudged to sell below cost
//   (b) live market median from Amazon.in / Flipkart (pricing.js), adjusted for how intricate the piece looks in the photo
//   (c) a seasonal-demand factor (festive / wedding months)
// and returns the suggested price, a sensible range, the break-even floor and a breakdown the artisan can read.
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export const LABOUR_RATE=()=>Number(process.env.LABOUR_RATE)||100;   // INR per hour, a fair skilled-craft wage; override per region
// category -> [typical raw-material cost per piece INR, typical labour hours per piece]
export const BASE={saree:[800,24],pottery:[45,3],basket:[90,6],jewellery:[250,8],woodcraft:[180,10],textile:[450,18],painting:[120,14],metal:[600,12],leather:[250,7],food:[60,2],craft:[100,6]};
const MATERIALS=[[/silk|रेशम|रेशमी|पट्ट/i,'silk',2.2],[/wool|ऊन|pashmina|पश्मीना/i,'wool',1.8],[/silver|चाँदी|चांदी/i,'silver',5],[/sandal|चंदन/i,'sandalwood',4],
  [/zari|ज़री|जरी/i,'zari',1.5],[/copper|तांबा|ताँबा/i,'copper',1.5],[/brass|पीतल/i,'brass',1.4],[/cotton|सूती|कपास/i,'cotton',1],[/terracotta|clay|मिट्टी|माटी/i,'clay',1],[/bamboo|cane|बांस|बाँस/i,'bamboo',1]];
const SEASON={10:[1.08,'Festive season (Navratri / Diwali / Durga Puja)'],11:[1.08,'Festive & wedding season'],12:[1.04,'Winter wedding season'],1:[1.03,'Wedding season'],3:[1.03,'Holi / Eid gifting'],4:[1.02,'Wedding season']};
const nice=x=>x<100?Math.round(x/5)*5:x<1000?Math.round(x/10)*10:Math.round(x/50)*50;
export function priceModel({category='craft',text='',market=null,intricacy,now=new Date()}={}){
  const [m0,h0]=BASE[category]||BASE.craft, t=String(text), factors=[];
  let matMult=1,matName=null; for(const [re,name,mult] of MATERIALS) if(re.test(t)&&mult>matMult){matMult=mult;matName=name;}
  if(matName) factors.push({k:'material',en:`${matName} raises material cost ×${matMult}`,hi:`${matName}: सामग्री का खर्च ×${matMult}`});
  let size=1; if(/\b(large|big|xl|jumbo)\b|बड़ा|बड़ी|बड़े/i.test(t)){size=1.35;factors.push({k:'size',en:'Large size ×1.35',hi:'बड़ा साइज़ ×1.35'});} else if(/\b(small|mini|tiny)\b|छोटा|छोटी|छोटे/i.test(t)){size=.7;factors.push({k:'size',en:'Small size ×0.7',hi:'छोटा साइज़ ×0.7'});}
  let hours=h0*(size>1?1.25:size<1?.8:1); const d=/(\d{1,3})\s*(?:days?|din|दिन)/i.exec(t), hr=/(\d{1,3})\s*(?:hours?|hrs?|ghante|घंटे)/i.exec(t);
  if(d){hours=Number(d[1])*6;factors.push({k:'time',en:`${d[1]} days of work (6 h/day)`,hi:`${d[1]} दिन की मेहनत (6 घंटे/दिन)`});} else if(hr){hours=Number(hr[1]);factors.push({k:'time',en:`${hr[1]} hours of work`,hi:`${hr[1]} घंटे की मेहनत`});}
  const intr=Number.isFinite(intricacy)?clamp(intricacy,0,1):null;
  if(intr!==null){ hours*=.85+.5*intr; factors.push({k:'detail',en:`Photo detail score ${Math.round(intr*100)}/100 adjusts labour time`,hi:`फोटो में बारीकी ${Math.round(intr*100)}/100 के हिसाब से मेहनत`}); }
  hours=Math.max(.5,Math.round(hours*10)/10);
  const material=Math.round(m0*matMult*size), labour=Math.round(hours*LABOUR_RATE()), overhead=Math.round((material+labour)*.10), floor=material+labour+overhead, margin=Math.round(floor*.15), target=floor+margin;
  const mo=now.getMonth()+1, [sf,sn]=SEASON[mo]||[1,null]; if(sn) factors.push({k:'season',en:`${sn} ×${sf}`,hi:`त्योहार/शादी का मौसम ×${sf}`});
  let raw,note,noteHi,basis; const lo=market?.range?.[0], hi=market?.range?.[1];
  if(market?.live){ const adj=market.price*(.92+.16*(intr??.5)); raw=Math.max(adj*sf,target); basis='market';
    if(adj*sf<target){note=`Market median ₹${market.price} is below your cost. We suggest the cost-plus price so you do not lose money.`;noteHi=`बाज़ार का दाम ₹${market.price} आपकी लागत से कम है। नुकसान से बचने के लिए लागत+मुनाफ़े वाला दाम सुझाया है।`;}
    else {note=`Based on ${market.samples} live marketplace prices (median ₹${market.price}), adjusted for detail and season, and checked against your cost.`;noteHi=`${market.samples} ताज़ा मार्केटप्लेस दामों (औसत ₹${market.price}) के आधार पर, बारीकी और मौसम के हिसाब से।`;} }
  else { const mid=market?.range?(lo+hi)/2:target; raw=Math.max(target,(.5*mid+.5*target))*sf; basis='estimate';
    note='Live prices were unavailable, so this blends typical prices for this craft with your cost (material + fair wage + margin).';noteHi='ताज़ा बाज़ार दाम नहीं मिले, इसलिए इस शिल्प के आम दाम और आपकी लागत को मिलाकर सुझाव दिया है।'; }
  const price=Math.max(nice(raw),Math.ceil(floor/5)*5), range=[Math.max(Math.ceil(floor*1.03),nice(price*.88)),nice(price*1.18)];
  return {price,range,floor,basis,hours,breakdown:{material,labour,overhead,margin},factors,season:sn?{factor:sf,label:sn}:null,
    market:market?.live?{median:market.price,samples:market.samples,range:market.range}:null,note,noteHi,method:'rule-based: cost-plus floor + live market median + detail + season'};
}
