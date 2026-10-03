import {createContext,useCallback,useContext,useEffect,useMemo,useState,ReactNode} from 'react';
import {Pressable,Text,View} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {c} from '@/lib/theme';

// Languages: full English, full Hindi, full Marathi. The choice is remembered on the phone (also after logout).
// Text typed or generated per item (titles, descriptions) and messages sent by the server stay as stored.
export type Lang='en'|'hi'|'mr';
export const LANGS:[Lang,string][]=[['en','English'],['hi','हिन्दी'],['mr','मराठी']];
const KEY='lang';

// key -> [English, Hindi, Marathi]. {name} placeholders are filled by t(key,{name:value}).
const D:Record<string,[string,string,string]>={
  'common.retry':['Retry','फिर कोशिश करें','पुन्हा प्रयत्न करा'],
  'err':['Error','गड़बड़','त्रुटी'],
  'problem':['Problem','गड़बड़','समस्या'],
  'yes':['Yes','हाँ','हो'],
  'no':['No','नहीं','नाही'],
  'verified':['verified','सत्यापित','पडताळलेले'],
  'lang.title':['Language','भाषा','भाषा'],

  // titles + tabs
  'title.item':['Item','सामान','वस्तू'],
  'title.order':['Order','ऑर्डर','ऑर्डर'],
  'title.notifications':['Notifications','सूचनाएँ','सूचना'],
  'title.profile':['Profile','प्रोफ़ाइल','प्रोफाइल'],
  'tab.sell':['Sell','बेचें','विका'],
  'tab.items':['My items','मेरा सामान','माझा माल'],
  'tab.items.l':['Items','सामान','माल'],
  'tab.shop':['Shop','खरीदें','खरेदी करा'],
  'tab.shop.l':['Shop','खरीदें','खरेदी'],
  'tab.orders':['Orders','ऑर्डर','ऑर्डर'],
  'tab.earnings':['Earnings','कमाई','कमाई'],

  // brand + sign-in
  'brand.tag':['Your virtual business manager','आपका डिजिटल बिज़नेस मैनेजर','तुमचा डिजिटल व्यवसाय व्यवस्थापक'],
  'ob.allowCam':['Allow camera','कैमरा चालू करें','कॅमेरा सुरू करा'],
  'ob.openSettings':['Open Settings and allow Camera','सेटिंग्स में कैमरा चालू करें','सेटिंग्जमध्ये कॅमेरा सुरू करा'],
  'ob.demo':['🎬 Try demo','🎬 डेमो में आज़माएँ','🎬 डेमो वापरून पहा'],
  'ob.demoNote':['Skip the UPI QR and open a sample artisan account','बिना QR के एक कारीगर खाते में जाएँ','QR शिवाय एका नमुना कारागीर खात्यात जा'],
  'ob.scanTitle':['Scan your UPI QR','अपना UPI QR दिखाएँ','तुमचा UPI QR स्कॅन करा'],
  'ob.scanHint':['GPay / Amazon Pay / PhonePe → “My QR”. We read only your UPI ID and name.','GPay / Amazon Pay / PhonePe → “My QR”. हम सिर्फ UPI ID और नाम पढ़ते हैं।','GPay / Amazon Pay / PhonePe → “My QR”. आम्ही फक्त तुमचा UPI ID आणि नाव वाचतो.'],
  'ob.profile':['Your profile','आपकी प्रोफ़ाइल','तुमची प्रोफाइल'],
  'pf.upi':['UPI ID','UPI ID','UPI ID'],
  'pf.app':['App','ऐप','अ‍ॅप'],
  'pf.bank':['Bank','बैंक','बँक'],
  'pf.name':['Name','नाम','नाव'],
  'pf.status':['Status','स्थिति','स्थिती'],
  'pf.displayName':['Display name','नाम','नाव'],
  'ob.handleNote':['App and bank are inferred from your UPI handle (@{h}); a QR never contains an account number.','ऐप और बैंक UPI handle (@{h}) से पहचाने गए हैं। खाता नंबर QR में नहीं होता और हम नहीं माँगते।','अ‍ॅप आणि बँक तुमच्या UPI हँडलवरून (@{h}) ओळखले आहेत. QR मध्ये खाते क्रमांक नसतो आणि आम्ही तो मागत नाही.'],
  'ob.verifyTitle':['🏦 ₹1 verification (MOCK)','🏦 ₹1 सत्यापन (नकली)','🏦 ₹1 पडताळणी (नमुना)'],
  'ob.verifyMock':['A real bank would credit ₹1 with the code in the narration. Mock for now:','असली बैंक आपके खाते में ₹1 भेजकर कोड narration में देगा। अभी यह नकली है:','खरी बँक तुमच्या खात्यात ₹1 जमा करून कोड नरेशनमध्ये देईल. सध्या हे नमुना आहे:'],
  'ob.verifyReal':['We credited ₹1; read the 6-digit code in the narration.','हमने आपके बैंक में ₹1 भेजा है, narration में 6 अंक का कोड देखें।','आम्ही तुमच्या बँकेत ₹1 पाठवले आहेत; नरेशनमधील ६ अंकी कोड पहा.'],
  'ob.create':['✔ Create account','✔ खाता बनाएँ','✔ खाते तयार करा'],
  'ob.rescan':['Scan again','दोबारा स्कैन करें','पुन्हा स्कॅन करा'],

  // shop / items / orders / notifications
  'shop.empty':['No items from other sellers yet','अभी कोई सामान नहीं','अजून कोणताही माल नाही'],
  'items.empty':['Nothing yet. Add items from the Sell tab first.','अभी कुछ नहीं · पहले "बेचें" से सामान जोड़ें','अजून काही नाही. आधी "विका" टॅबमधून माल जोडा.'],
  'items.left':['{n} left','{n} बचे','{n} शिल्लक'],
  'items.sold':['sold out','खत्म','संपले'],
  'ch.gem':['GeM (Govt e-Marketplace)','GeM (सरकारी ई-मार्केट)','GeM (सरकारी ई-मार्केट)'],
  'ch.app':['App','ऐप','अ‍ॅप'],
  'sy.pending':['Queued','कतार में','रांगेत'],
  'sy.needs_setup':['Needs setup','सेटअप बाकी','सेटअप बाकी'],
  'sy.validated':['Validated','जाँचा गया','तपासले'],
  'sy.done':['Live','लाइव','लाइव्ह'],
  'sy.failed':['Failed','फेल','अयशस्वी'],
  'ord.bought':['Bought','मेरी खरीद','माझी खरेदी'],
  'ord.received':['Received','मिले ऑर्डर','मिळालेल्या ऑर्डर'],
  'ord.emptyBuyer':['No purchases yet','अभी कोई खरीद नहीं','अजून कोणतीही खरेदी नाही'],
  'ord.emptySeller':['No orders received yet','अभी कोई ऑर्डर नहीं मिला','अजून एकही ऑर्डर मिळाली नाही'],
  'notif.empty':['No notifications yet','कोई सूचना नहीं','अजून कोणतीही सूचना नाही'],
  'st.awaiting_payment':['Awaiting payment','पेमेंट बाकी','पेमेंट बाकी'],
  'st.paid':['Paid, in escrow','पेमेंट सुरक्षित','पेमेंट सुरक्षित (एस्क्रो)'],
  'st.shipped':['Shipped','भेजा गया','पाठवले'],
  'st.completed':['Completed','पूरा हुआ','पूर्ण झाले'],
  'st.refunded':['Refunded','पैसे वापस','पैसे परत'],
  'st.cancelled':['Cancelled','रद्द','रद्द'],
  'st.disputed':['Problem reported','समस्या बताई','समस्या कळवली'],

  // profile
  'prof.verified':['✔ ₹1 verified (mock)','✔ ₹1 सत्यापित (नकली)','✔ ₹1 पडताळले (नमुना)'],
  'prof.notVerified':['Not verified','सत्यापित नहीं','पडताळलेले नाही'],
  'prof.note':['We do not hold your account number; only your UPI ID, name and the app/bank inferred from the UPI handle.','खाता नंबर हमारे पास नहीं है; सिर्फ UPI ID, नाम और UPI handle से पहचाना ऐप/बैंक।','तुमचा खाते क्रमांक आमच्याकडे नाही; फक्त UPI ID, नाव आणि UPI हँडलवरून ओळखलेले अ‍ॅप/बँक.'],
  'prof.logout':['Log out','लॉग आउट','लॉग आउट'],
  'prof.logoutQ':['Log out?','लॉग आउट?','लॉग आउट करायचे?'],
  'prof.logoutMsg':['You will be signed out on this phone.','इस फ़ोन पर आप साइन आउट हो जाएँगे।','या फोनवर तुम्ही साइन आउट व्हाल.'],

  // item detail
  'item.seller':['Seller: {n}','बेचने वाले · {n}','विक्रेता: {n}'],
  'item.soldOut':['Sold out','खत्म','संपले'],
  'item.addr':['Delivery address with PIN','डिलीवरी का पता, पिन कोड सहित','पिन कोडसह डिलिव्हरीचा पत्ता'],
  'item.escrow':['🔒 Your payment is held in escrow until you confirm delivery.','🔒 आपका पैसा तब तक सुरक्षित (escrow) रहेगा जब तक आप सामान मिलने की पुष्टि नहीं करते।','🔒 तुम्ही माल मिळाल्याची खात्री देईपर्यंत तुमचे पैसे सुरक्षित (एस्क्रो) राहतील.'],
  'item.order':['🛒 Order · ₹{n}','🛒 ऑर्डर करें · ₹{n}','🛒 ऑर्डर करा · ₹{n}'],

  // order detail
  'role.seller':['Seller','बेचने वाले','विक्रेता'],
  'role.buyer':['Buyer','खरीदार','खरेदीदार'],
  'od.market':['{ch} holds the money and handles delivery for this order.','इस ऑर्डर का पैसा {ch} के पास है और वही डिलीवरी संभालता है।','या ऑर्डरचे पैसे {ch} कडे आहेत आणि तेच डिलिव्हरी सांभाळतात.'],
  'od.shipTo':['Ship to','डिलीवरी का पता','डिलिव्हरीचा पत्ता'],
  'od.mockPay':['🧪 This is a MOCK payment: no real money moves. It is held in escrow until you confirm delivery.','🧪 यह नकली पेमेंट है, असली पैसा नहीं कटेगा। पैसा तब तक रुका रहेगा जब तक आप डिलीवरी की पुष्टि नहीं करते।','🧪 हे नकली (नमुना) पेमेंट आहे, खरे पैसे कापले जाणार नाहीत. तुम्ही डिलिव्हरीची खात्री देईपर्यंत ते एस्क्रोमध्ये राहील.'],
  'od.pay':['💳 Pay ₹{n} (mock)','💳 ₹{n} भरें','💳 ₹{n} भरा (नमुना)'],
  'od.tracking':['Courier / tracking (optional)','कूरियर / ट्रैकिंग नंबर (वैकल्पिक)','कुरिअर / ट्रॅकिंग क्रमांक (ऐच्छिक)'],
  'od.ship':['🚚 Mark shipped','🚚 भेज दिया','🚚 पाठवले'],
  'od.confirm':['✅ Confirm delivery','✅ सामान मिल गया','✅ माल मिळाला'],
  'od.confirmQ':['Release the money?','पैसे जारी करें?','पैसे द्यायचे?'],
  'od.confirmMsg':['The seller will receive the money.','विक्रेता को पैसे मिल जाएँगे।','विक्रेत्याला पैसे मिळतील.'],
  'od.dispute':['⚠️ Report a problem','⚠️ समस्या है','⚠️ समस्या आहे'],
  'od.disputeQ':['Report a problem?','समस्या बताएँ?','समस्या कळवायची?'],
  'od.disputeMsg':['Payment stays on hold.','पैसे रुके रहेंगे।','पैसे थांबवले जातील.'],
  'od.cancel':['Cancel order','ऑर्डर रद्द करें','ऑर्डर रद्द करा'],
  'od.cancelQ':['Cancel this order?','ऑर्डर रद्द करें?','ऑर्डर रद्द करायची?'],
  'od.cancelMsg':['This order will be cancelled.','ऑर्डर रद्द कर दी जाएगी।','ही ऑर्डर रद्द केली जाईल.'],
  'od.cancelMsgPaid':['The order will be cancelled and the buyer refunded.','ऑर्डर रद्द होगी और खरीदार को पैसे वापस मिलेंगे।','ऑर्डर रद्द करून खरेदीदाराला पैसे परत दिले जातील.'],
  'od.autoRelease':['Money auto-releases 7 days after shipping unless you report a problem.','7 दिन में जवाब न मिलने पर पैसे अपने आप विक्रेता को जारी हो जाएँगे।','७ दिवसांत उत्तर न मिळाल्यास पैसे आपोआप विक्रेत्याला दिले जातील.'],
  'od.disputed':['Payment is on hold. Dispute resolution is not built yet.','पैसे रुके हुए हैं। समाधान की सुविधा अभी बनी नहीं है।','पैसे थांबवले आहेत. वाद सोडवण्याची सुविधा अजून तयार नाही.'],
  'od.history':['History','इतिहास','इतिहास'],

  // sell
  'cat.saree':['Saree','साड़ी','साडी'],'cat.pottery':['Pottery','मिट्टी','मातीकाम'],'cat.basket':['Basket','टोकरी','टोपली'],
  'cat.jewellery':['Jewellery','गहने','दागिने'],'cat.woodcraft':['Woodcraft','लकड़ी','लाकूडकाम'],'cat.textile':['Textile','कपड़ा','कापड'],
  'cat.painting':['Painting','पेंटिंग','चित्रकला'],'cat.metal':['Metal','धातु','धातू'],'cat.leather':['Leather','चमड़ा','चामडे'],
  'cat.food':['Food','खाना','खाद्यपदार्थ'],'cat.craft':['Other','अन्य','इतर'],
  'sl.takePhoto':['📷 Take photo','📷 फोटो खींचें','📷 फोटो काढा'],
  'sl.gallery':['🖼️ Choose from gallery','🖼️ गैलरी से चुनें','🖼️ गॅलरीतून निवडा'],
  'sl.camTitle':['Camera','कैमरा','कॅमेरा'],
  'sl.camStarting':['Camera is starting, wait a moment','कैमरा शुरू हो रहा है, एक पल रुकें','कॅमेरा सुरू होत आहे, क्षणभर थांबा'],
  'sl.camFail':['Could not capture. Please use the gallery instead.','फोटो नहीं ली जा सकी। गैलरी से चुनें।','फोटो काढता आला नाही. कृपया गॅलरीतून निवडा.'],
  'sl.polishing':['✨ Studio is polishing your photo…','✨ स्टूडियो फोटो बना रहा है…','✨ स्टुडिओ फोटो तयार करत आहे…'],
  'sl.studio':['✨ Studio','✨ स्टूडियो','✨ स्टुडिओ'],
  'sl.original':['Original','मूल','मूळ'],
  'sl.bgRemoved':['🧹 Background removed','🧹 बैकग्राउंड हटाया','🧹 बॅकग्राउंड काढले'],
  'sl.bgKept':['🖼️ Busy background kept','🖼️ बैकग्राउंड भीड़भाड़ वाला, वैसा ही रखा','🖼️ बॅकग्राउंड गर्दीचे आहे, तसेच ठेवले'],
  'sl.bgNA':['ℹ️ Studio unavailable, original photo','ℹ️ स्टूडियो उपलब्ध नहीं, मूल फोटो','ℹ️ स्टुडिओ उपलब्ध नाही, मूळ फोटो'],
  'sl.light':['💡 Lighting corrected','💡 रोशनी सुधारी','💡 प्रकाश सुधारला'],
  'sl.size':['📐 {s} white, marketplace-ready','📐 {s} सफ़ेद','📐 {s} पांढरा, मार्केटप्लेससाठी तयार'],
  'sl.voice':['🎤 Describe by voice','🎤 बोलकर बताएँ','🎤 बोलून सांगा'],
  'sl.stop':['⏹ Stop ({s}s)','⏹ रोकें ({s}s)','⏹ थांबवा ({s}s)'],
  'sl.speak':['🎙️ Tap & speak','🎙️ दबाकर बोलें','🎙️ दाबून बोला'],
  'sl.listening':['Understanding your voice…','सुन रहे हैं…','ऐकत आहे…'],
  'sl.english':['🔤 English:','🔤 अंग्रेज़ी:','🔤 इंग्रजी:'],
  'sl.demoVoice':['DEMO transcript. This is a sample, not what you said.','डेमो ट्रांसक्रिप्ट। यह एक नमूना है, आपने जो बोला वो नहीं।','डेमो ट्रान्सक्रिप्ट. हा एक नमुना आहे, तुम्ही जे बोललात ते नाही.'],
  'sl.sampleVoice':['🎭 Use a sample voice note (demo)','🎭 नमूना आवाज़ आज़माएँ','🎭 नमुना आवाज वापरून पहा (डेमो)'],
  'sl.voiceTitle':['Voice','आवाज़','आवाज'],
  'sl.micTitle':['Microphone','माइक','माइक'],
  'sl.micMsg':['Please allow the microphone','माइक की अनुमति दें','माइकला परवानगी द्या'],
  'sl.what':['What is it?','यह क्या है?','हे काय आहे?'],
  'sl.typeHint':['or type, e.g. handmade clay matka, 2 litre','या यहाँ लिखें, जैसे: हाथ से बना मिट्टी का मटका, 2 लीटर','किंवा येथे लिहा, उदा. हाताने बनवलेला मातीचा माठ, 2 लिटर'],
  'sl.place':['Craft from (optional)','कहाँ का? (वैकल्पिक)','कुठले? (ऐच्छिक)'],
  'sl.make':['✨ Make listing & price','✨ लिस्टिंग और दाम बनाएँ','✨ लिस्टिंग आणि किंमत तयार करा'],
  'sl.writerAI':['🤖 AI-written listing (local model)','🤖 AI से लिखी लिस्टिंग (लोकल मॉडल)','🤖 AI ने लिहिलेली लिस्टिंग (लोकल मॉडेल)'],
  'sl.writerBuiltin':['📝 Built-in listing writer','📝 बिल्ट-इन लिस्टिंग राइटर','📝 अंगभूत लिस्टिंग लेखक'],
  'sl.tags':['🔎 Search tags','🔎 SEO टैग','🔎 SEO टॅग'],
  'sl.suggested':['Suggested price (₹{a}–{b})','सुझाया दाम (₹{a}–{b})','सुचवलेली किंमत (₹{a}–{b})'],
  'sl.belowCost':['⚠️ Below your cost of ₹{f}','⚠️ यह दाम आपकी लागत (₹{f}) से कम है','⚠️ ही किंमत तुमच्या खर्चापेक्षा (₹{f}) कमी आहे'],
  'sl.how':['How this price is built','दाम कैसे बना','किंमत कशी ठरली'],
  'sl.material':['Material','सामग्री','साहित्य'],
  'sl.labour':['Labour ({h} h)','मेहनत ({h} घंटे)','मेहनत ({h} तास)'],
  'sl.overhead':['Overheads','खर्च','इतर खर्च'],
  'sl.breakeven':['Break-even','कम से कम दाम','किमान किंमत'],
  'sl.margin':['Margin','मुनाफ़ा','नफा'],
  'sl.qty':['Quantity','कितने पीस','किती नग'],
  'sl.sellOn':['Sell on','कहाँ बेचें','कुठे विकायचे'],
  'sl.b2b':['🏛️ GeM / ONDC: reach government and bulk B2B buyers','🏛️ GeM / ONDC: सरकारी और थोक (B2B) खरीदारों तक पहुँच','🏛️ GeM / ONDC: सरकारी आणि घाऊक (B2B) खरेदीदारांपर्यंत पोहोच'],
  'sl.useStudio':['✨ The Studio photo will be listed','✨ स्टूडियो फोटो लगेगी','✨ स्टुडिओ फोटो वापरला जाईल'],
  'sl.useOrig':['📷 The original photo will be listed','📷 मूल फोटो लगेगी','📷 मूळ फोटो वापरला जाईल'],
  'sl.publish':['✔ Start selling','✔ बेचना शुरू करें','✔ विक्री सुरू करा'],
  'sl.edit':['← Edit details','← बदलें','← बदला'],
  'sl.retake':['Retake photo','दूसरी फोटो','दुसरा फोटो'],
  'sl.doneTitle':['Done ✓','हो गया ✓','झाले ✓'],
  'sl.doneMsg':['Item listed','सामान लिस्ट हो गया','माल लिस्ट झाला'],

  // earnings
  'earn.total':['Earned (released)','कुल कमाई (जारी हो चुकी)','एकूण कमाई (जारी झालेली)'],
  'earn.pending':['🔒 Pending: paid or shipped, not yet released','🔒 रुकी हुई (escrow / marketplace)','🔒 थांबलेली (एस्क्रो / मार्केटप्लेस)'],
  'earn.empty':['No sales yet','अभी कोई बिक्री नहीं','अजून विक्री नाही'],
};

const IDX:Record<Lang,0|1|2>={en:0,hi:1,mr:2};
type Ctx={lang:Lang;setLang:(l:Lang)=>void;t:(k:string,v?:Record<string,string|number|undefined>)=>string};
const make=(lang:Lang):Ctx['t']=>(k,v)=>{ let s=(D[k]?.[IDX[lang]])??D[k]?.[0]??k; if(v) for(const x in v) s=s.split(`{${x}}`).join(String(v[x]??'')); return s; };
const L=createContext<Ctx>({lang:'en',setLang:()=>{},t:make('en')});
export const useLang=()=>useContext(L);

export function LangProvider({children}:{children:ReactNode}){
  const [lang,set]=useState<Lang>('en');
  useEffect(()=>{ SecureStore.getItemAsync(KEY).then(v=>{ if(v==='en'||v==='hi'||v==='mr') set(v); }).catch(()=>{}); },[]);
  const setLang=useCallback((l:Lang)=>{ set(l); SecureStore.setItemAsync(KEY,l).catch(()=>{}); },[]);
  const value=useMemo(()=>({lang,setLang,t:make(lang)}),[lang,setLang]);
  return <L.Provider value={value}>{children}</L.Provider>;
}

// Three pills: English | हिन्दी | मराठी. Drop it on any screen.
export function LangPills(){
  const {lang,setLang}=useLang();
  return <View style={{flexDirection:'row',gap:8,justifyContent:'center'}}>{LANGS.map(([k,n])=>
    <Pressable key={k} accessibilityRole="button" accessibilityLabel={n} onPress={()=>setLang(k)} style={{paddingVertical:8,paddingHorizontal:16,borderRadius:20,backgroundColor:lang===k?c.indigo:'#fff'}}>
      <Text style={{fontSize:16,fontWeight:'700',color:lang===k?'#fff':c.ink}}>{n}</Text></Pressable>)}</View>;
}
