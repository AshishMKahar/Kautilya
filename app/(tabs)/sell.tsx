import {useEffect,useRef,useState} from 'react';
import {Alert,Pressable,ScrollView,Text,TextInput,ActivityIndicator,View} from 'react-native';
import {Image} from 'expo-image';
import {CameraView,useCameraPermissions} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {AudioModule,RecordingPresets,setAudioModeAsync,useAudioRecorder,useAudioRecorderState} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import Animated,{FadeInDown} from 'react-native-reanimated';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {c,card} from '@/lib/theme';
import {Btn} from '@/components/ui';
import {useLang} from '@/lib/i18n';
// Sell flow = the three AI helpers in order:
//  1) AI Image Studio      photo -> background removed, light fixed, 1200x1200 white marketplace shot (before/after toggle)
//  2) Multilingual cataloger  speak in your language (or type) -> English + Hindi SEO listing
//  3) Dynamic price assistant market + material + labour + season -> price with a breakdown and a "never below cost" floor
const CATS:[string,string][]=[['saree','साड़ी'],['pottery','मिट्टी'],['basket','टोकरी'],['jewellery','गहने'],['woodcraft','लकड़ी'],['textile','कपड़ा'],['painting','पेंटिंग'],['metal','धातु'],['leather','चमड़ा'],['food','खाना'],['craft','अन्य']];
const CH=[['app','ऐप'],['amazon','Amazon'],['flipkart','Flipkart'],['gem','GeM'],['ondc','ONDC']];
const LANGS:[string,string][]=[['hi','हिन्दी'],['mr','मराठी'],['gu','ગુજરાતી'],['bn','বাংলা'],['ta','தமிழ்'],['te','తెలుగు'],['kn','ಕನ್ನಡ'],['ml','മലയാളം'],['pa','ਪੰਜਾਬੀ'],['od','ଓଡ଼ିଆ'],['en','English']];
const chip=(on:boolean)=>({paddingVertical:8,paddingHorizontal:14,borderRadius:20,backgroundColor:on?c.indigo:'#fff'});
const Badge=({t,good}:{t:string;good?:boolean})=><Text style={{fontSize:13,fontWeight:'700',color:good===false?c.mute:c.green,backgroundColor:'#fff',paddingVertical:5,paddingHorizontal:10,borderRadius:12,overflow:'hidden'}}>{t}</Text>;
export default function Sell(){
  const cam=useRef<CameraView>(null); const qc=useQueryClient(); const [camReady,setCamReady]=useState(false); const {t,lang:ui}=useLang();
  const [camPerm,askCam]=useCameraPermissions();
  useEffect(()=>{ if(camPerm&&!camPerm.granted&&camPerm.canAskAgain) askCam(); },[camPerm]);
  const [photo,setPhoto]=useState<any>(null); const [enh,setEnh]=useState<any>(null); const [view,setView]=useState<'studio'|'orig'>('studio'); const [L,setL]=useState<any>(null);
  const [text,setText]=useState(''); const [textEn,setTextEn]=useState(''); const [cat,setCat]=useState<string|undefined>(); const [place,setPlace]=useState(''); const [stock,setStock]=useState(1); const [price,setPrice]=useState(''); const [ch,setCh]=useState<string[]>(['app']);
  const [lang,setLang]=useState('hi'); const [demoVoice,setDemoVoice]=useState(false);
  const rec=useAudioRecorder(RecordingPresets.HIGH_QUALITY); const rs=useAudioRecorderState(rec);

  // 1) Studio: runs automatically whenever a photo arrives. If the server cannot enhance, we quietly keep the original.
  const studio=useMutation({mutationFn:(b64:string)=>api('/ai/enhance',{image:b64}),onSuccess:(d:any)=>{setEnh(d);setView(d.image?'studio':'orig');},onError:()=>{setEnh({image:null,report:{background:'unavailable'}});setView('orig');}});
  const takePhoto=(p:any)=>{setPhoto(p);setEnh(null);setL(null);studio.mutate(p.base64);};
  const pick=async()=>{ const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:.5,base64:true}); const a=r.assets?.[0]; if(!r.canceled&&a?.base64) takePhoto({uri:a.uri,base64:a.base64}); };

  // 2) Voice note -> transcript in the artisan's language + English translation
  const voice=useMutation({mutationFn:(audio:string)=>api('/ai/voice',{audio,lang}),onSuccess:(d:any)=>{setText(d.original);setTextEn(d.english);setDemoVoice(!!d.demo);},onError:(e:any)=>Alert.alert(t('sl.voiceTitle'),e.message)});
  const startRec=async()=>{ try{ const p=await AudioModule.requestRecordingPermissionsAsync(); if(!p.granted){Alert.alert(t('sl.micTitle'),t('sl.micMsg'));return;}
    await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true}); await rec.prepareToRecordAsync(); rec.record(); }catch(e:any){Alert.alert(t('err'),e.message);} };
  const stopRec=async()=>{ try{ await rec.stop(); await setAudioModeAsync({allowsRecording:false}); if(!rec.uri) throw new Error('Recording failed'); voice.mutate(await FileSystem.readAsStringAsync(rec.uri,{encoding:'base64' as any})); }catch(e:any){Alert.alert(t('err'),e.message);} };
  useEffect(()=>{ if(rs.isRecording&&rs.durationMillis>=30000) stopRec(); },[rs.isRecording,rs.durationMillis]);   // 30 s cap keeps uploads small and speech-to-text fast

  // 3) Listing + price
  const gen=useMutation({mutationFn:()=>api('/ai/listing',{text,textEn:textEn||undefined,category:cat,craftOf:place.trim()||undefined,image:photo.base64}),onSuccess:(d:any)=>{setL(d);setPrice(String(d.price));},onError:(e:any)=>Alert.alert(t('err'),e.message)});
  const useStudio=view==='studio'&&!!enh?.image;
  const pub=useMutation({mutationFn:()=>api('/items',{title_en:L.title_en,desc_en:(L.desc_en+(L.keywords?.length?` Search tags: ${L.keywords.join(', ')}.`:'')).slice(0,2000),desc_hi:L.desc_hi,price:Number(price),stock,image:useStudio?enh.image:photo.base64,channels:ch}),
    onError:(e:any)=>Alert.alert(t('err'),e.message),
    onSuccess:()=>{Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);qc.invalidateQueries({queryKey:['items']});reset();Alert.alert(t('sl.doneTitle'),t('sl.doneMsg'));}});
  const reset=()=>{setPhoto(null);setEnh(null);setL(null);setText('');setTextEn('');setDemoVoice(false);setCat(undefined);setPlace('');setStock(1);setCh(['app']);setView('studio');};
  const priceOk=/^\d{1,7}(\.\d{1,2})?$/.test(price)&&Number(price)>0;

  if(!photo) return <View style={{flex:1,padding:16,gap:12,backgroundColor:c.cotton}}><CameraView ref={cam} onCameraReady={()=>setCamReady(true)} style={{flex:1,borderRadius:20,overflow:'hidden'}}/>
    <Btn bg={c.madder} t={t('sl.takePhoto')} onPress={async()=>{ if(!camReady){Alert.alert(t('sl.camTitle'),t('sl.camStarting'));return;} try{const p=await cam.current?.takePictureAsync({base64:true,quality:.5}); if(p) takePhoto(p);}catch{Alert.alert(t('sl.camTitle'),t('sl.camFail'));} }}/>
    <Text onPress={pick} accessibilityRole="button" style={{textAlign:'center',color:c.indigo,fontSize:18,fontWeight:'700',padding:8}}>{t('sl.gallery')}</Text></View>;

  const rp=enh?.report;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{backgroundColor:c.cotton}} contentContainerStyle={{padding:16,gap:12}}>
    {/* ---- AI Image Studio ---- */}
    <View style={{borderRadius:20,overflow:'hidden',backgroundColor:'#fff'}}>
      <Image source={{uri:useStudio?enh.image:photo.uri}} style={{width:'100%',aspectRatio:useStudio?1:4/3}} contentFit={useStudio?'contain':'cover'}/>
      {studio.isPending&&<View style={{position:'absolute',inset:0,backgroundColor:'#ffffffcc',alignItems:'center',justifyContent:'center',gap:8}}><ActivityIndicator size="large" color={c.madder}/><Text style={{fontWeight:'700',color:c.indigo}}>{t('sl.polishing')}</Text></View>}</View>
    {!!enh?.image&&<View style={{flexDirection:'row',gap:8}}>
      <Pressable accessibilityRole="button" onPress={()=>setView('studio')} style={chip(view==='studio')}><Text style={{color:view==='studio'?'#fff':c.ink,fontSize:16}}>{t('sl.studio')}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={()=>setView('orig')} style={chip(view==='orig')}><Text style={{color:view==='orig'?'#fff':c.ink,fontSize:16}}>{t('sl.original')}</Text></Pressable></View>}
    {!!rp&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
      {rp.background==='removed'&&<Badge t={t('sl.bgRemoved')}/>}
      {rp.background==='kept'&&<Badge good={false} t={t('sl.bgKept')}/>}
      {rp.background==='unavailable'&&<Badge good={false} t={t('sl.bgNA')}/>}
      {!!rp.lighting?.fixed&&<Badge t={t('sl.light')}/>}
      {!!rp.size&&<Badge t={t('sl.size',{s:rp.size})}/>}</View>}

    {!L&&<>
      {/* ---- Multilingual auto-cataloger: voice ---- */}
      <View style={{...card,gap:10}}>
        <Text style={{fontSize:17,fontWeight:'700'}}>{t('sl.voice')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{LANGS.map(([k,n])=><Pressable key={k} accessibilityRole="button" onPress={()=>setLang(k)} style={{...chip(lang===k),backgroundColor:lang===k?c.indigo:c.cotton}}><Text style={{color:lang===k?'#fff':c.ink,fontSize:16}}>{n}</Text></Pressable>)}</ScrollView>
        <Pressable accessibilityRole="button" disabled={voice.isPending} onPress={rs.isRecording?stopRec:startRec} style={{backgroundColor:rs.isRecording?c.madder:c.indigo,opacity:voice.isPending?.5:1,padding:16,borderRadius:16,alignItems:'center'}}>
          <Text style={{color:'#fff',fontSize:19,fontWeight:'700'}}>{rs.isRecording?t('sl.stop',{s:Math.floor((rs.durationMillis||0)/1000)}):t('sl.speak')}</Text></Pressable>
        {voice.isPending&&<View style={{flexDirection:'row',gap:8,alignItems:'center'}}><ActivityIndicator color={c.madder}/><Text style={{color:c.mute}}>{t('sl.listening')}</Text></View>}
        {!!textEn&&<View style={{gap:4}}><Text selectable style={{fontSize:16}}>🗣️ {text}</Text>{textEn!==text&&<Text selectable style={{fontSize:15,color:c.mute}}>{t('sl.english')} {textEn}</Text>}</View>}
        {demoVoice&&<Text style={{fontSize:12,color:c.turmeric,fontWeight:'700'}}>{t('sl.demoVoice')}</Text>}
        <Text onPress={()=>!voice.isPending&&voice.mutate('')} style={{fontSize:14,color:c.indigo,textDecorationLine:'underline'}}>{t('sl.sampleVoice')}</Text></View>
      <Text style={{fontSize:17,fontWeight:'700'}}>{t('sl.what')}</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{CATS.map(([k,h])=><Pressable key={k} onPress={()=>setCat(cat===k?undefined:k)} style={chip(cat===k)}><Text style={{color:cat===k?'#fff':c.ink,fontSize:16}}>{t('cat.'+k)}</Text></Pressable>)}</View>
      <TextInput multiline maxLength={400} value={text} onChangeText={v=>{setText(v);setTextEn('');}} placeholder={t('sl.typeHint')} style={{...card,fontSize:17,minHeight:90}}/>
      <TextInput maxLength={40} value={place} onChangeText={setPlace} placeholder={t('sl.place')} style={{...card,fontSize:17}}/>
      <Btn t={t('sl.make')} disabled={gen.isPending||studio.isPending||(!text.trim()&&!cat)} onPress={()=>gen.mutate()}/>
      {gen.isPending&&<ActivityIndicator color={c.madder}/>}</>}

    {L&&<Animated.View entering={FadeInDown} style={{gap:10}}>
      <View style={{flexDirection:'row',gap:6,flexWrap:'wrap'}}><Badge good={L.writer==='local-llm'} t={L.writer==='local-llm'?t('sl.writerAI'):t('sl.writerBuiltin')}/></View>
      <TextInput maxLength={120} style={{...card,fontSize:18}} value={L.title_en} onChangeText={v=>setL({...L,title_en:v})}/>
      <TextInput multiline maxLength={2000} style={{...card,fontSize:17,minHeight:90}} value={L.desc_hi} onChangeText={v=>setL({...L,desc_hi:v})}/>
      <TextInput multiline maxLength={2000} style={{...card,fontSize:17,minHeight:90}} value={L.desc_en} onChangeText={v=>setL({...L,desc_en:v})}/>
      {!!L.keywords?.length&&<View style={{gap:6}}><Text style={{fontSize:14,color:c.mute}}>{t('sl.tags')}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{L.keywords.map((k:string)=><Text key={k} style={{backgroundColor:'#fff',color:c.indigo,paddingVertical:4,paddingHorizontal:10,borderRadius:12,overflow:'hidden',fontSize:14}}>#{k}</Text>)}</View></View>}
      {/* ---- Dynamic pricing assistant ---- */}
      <View style={{...card,gap:6}}>
        <Text style={{fontSize:16,color:c.mute}}>{t('sl.suggested',{a:L.range?.[0],b:L.range?.[1]})}</Text>
        <TextInput keyboardType="decimal-pad" value={price} onChangeText={v=>setPrice(v.replace(/[^\d.]/g,''))} maxLength={10} style={{fontSize:30,fontWeight:'800',color:c.madder,fontVariant:['tabular-nums']}}/>
        {!!L.pricing&&priceOk&&Number(price)<L.pricing.floor&&<Text style={{color:c.madder,fontWeight:'700',fontSize:15}}>{t('sl.belowCost',{f:L.pricing.floor})}</Text>}
        <Text style={{fontSize:13,color:L.priceInfo?.live?c.green:c.mute}}>{L.priceInfo?.live?'🟢 ':'⚪ '}{ui==='en'?L.priceInfo?.note:(L.priceInfo?.noteHi||L.priceInfo?.note)}{L.priceInfo?.live?` (${L.priceInfo.sources.join(', ')})`:''}</Text>
        {!!L.pricing&&<View style={{marginTop:6,gap:3,borderTopWidth:1,borderTopColor:'#eee',paddingTop:8}}>
          <Text style={{fontWeight:'800',fontSize:15}}>{t('sl.how')}</Text>
          {([[t('sl.material'),L.pricing.breakdown.material],[t('sl.labour',{h:L.pricing.hours}),L.pricing.breakdown.labour],[t('sl.overhead'),L.pricing.breakdown.overhead]] as [string,number][]).map(([k,v])=><View key={k} style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{fontSize:15}}>{k}</Text><Text style={{fontSize:15,fontVariant:['tabular-nums']}}>₹{v}</Text></View>)}
          <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{fontSize:15,fontWeight:'800'}}>{t('sl.breakeven')}</Text><Text style={{fontSize:15,fontWeight:'800',fontVariant:['tabular-nums']}}>₹{L.pricing.floor}</Text></View>
          <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{fontSize:15}}>{t('sl.margin')}</Text><Text style={{fontSize:15,fontVariant:['tabular-nums']}}>₹{L.pricing.breakdown.margin}</Text></View>
          {(L.pricing.factors||[]).map((f:any,i:number)=><Text key={i} style={{fontSize:13,color:c.mute}}>• {ui==='en'?f.en:(f.hi||f.en)}</Text>)}</View>}</View>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',...card}}><Text style={{fontSize:17,fontWeight:'700'}}>{t('sl.qty')}</Text>
        <View style={{flexDirection:'row',alignItems:'center',gap:18}}><Text onPress={()=>setStock(s=>Math.max(1,s-1))} style={{fontSize:30,padding:6}}>−</Text><Text style={{fontSize:24,fontWeight:'800'}}>{stock}</Text><Text onPress={()=>setStock(s=>Math.min(100,s+1))} style={{fontSize:30,padding:6}}>+</Text></View></View>
      <Text style={{fontSize:16,fontWeight:'700'}}>{t('sl.sellOn')}</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{CH.map(([k,h])=><Pressable key={k} disabled={k==='app'} onPress={()=>setCh(x=>x.includes(k)?x.filter(y=>y!==k):[...x,k])} style={chip(ch.includes(k))}><Text style={{color:ch.includes(k)?'#fff':c.ink,fontSize:16}}>{k==='app'?t('ch.app'):h}</Text></Pressable>)}</View>
      {(ch.includes('gem')||ch.includes('ondc'))&&<Text style={{fontSize:13,color:c.mute}}>{t('sl.b2b')}</Text>}
      <Text style={{fontSize:13,color:c.mute}}>{useStudio?t('sl.useStudio'):t('sl.useOrig')}</Text>
      <Btn t={t('sl.publish')} bg={c.turmeric} disabled={pub.isPending||studio.isPending||!priceOk||!L.title_en.trim()} onPress={()=>pub.mutate()}/>
      <Text onPress={()=>setL(null)} style={{textAlign:'center',color:c.indigo,fontSize:16,padding:8}}>{t('sl.edit')}</Text></Animated.View>}
    <Text onPress={reset} style={{textAlign:'center',color:c.mute,fontSize:15,padding:8}}>{t('sl.retake')}</Text>
  </ScrollView>;
}
