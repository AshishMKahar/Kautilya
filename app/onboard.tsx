import {useEffect,useRef,useState} from 'react';
import {Alert,Linking,ScrollView,Text,TextInput,View,ActivityIndicator} from 'react-native';
import {CameraView,useCameraPermissions} from 'expo-camera';
import {useRouter} from 'expo-router';
import * as Haptics from 'expo-haptics';
import {api,auth,BASE} from '@/lib/api';
import {c,card} from '@/lib/theme';
import {Btn} from '@/components/ui';
import {BrandHero} from '@/components/brand';
import {LangPills,useLang} from '@/lib/i18n';
// Flow: 1) scan the UPI QR shown on the user's own screen (GPay / Amazon Pay / PhonePe ...)  2) we read UPI ID + name from it and infer app/bank from the handle
// 3) confirm profile  4) enter the code from the ₹1 verification credit (MOCK bank for now)  5) account + profile created.
type Scan={bank:{app:string;bank:string;handle:string;recognised:boolean;maskedUpi:string};name:string;mock?:{amount:number;narration:string;code:string}};
export default function Onboard(){
  const [perm,ask]=useCameraPermissions(); const r=useRouter(); const busy=useRef(false); const {t}=useLang();
  const [scan,setScan]=useState<Scan|null>(null); const [upi,setUpi]=useState(''); const [name,setName]=useState(''); const [code,setCode]=useState(''); const [loading,setLoading]=useState(false);
  const [demo,setDemo]=useState(false); const [srv,setSrv]=useState('checking…'); const [last,setLast]=useState(''); const [camErr,setCamErr]=useState(''); const [ready,setReady]=useState(false); const cool=useRef(0);
  useEffect(()=>{api<{demo?:boolean}>('/health').then(h=>{setDemo(!!h.demo);setSrv('✔ connected');}).catch(e=>setSrv('✖ '+(e?.message||'unreachable')));},[]);   // server says whether one-tap demo login is switched on (DEMO_MODE=1)
  const run=async(f:()=>Promise<void>)=>{ if(busy.current) return; busy.current=true; setLoading(true); try{await f();}catch(e:any){cool.current=Date.now()+4000; Alert.alert(t('problem'),e.message);} finally{busy.current=false;setLoading(false);} };
  const DemoBtn=()=>demo?<View style={{gap:6}}><Btn bg={c.turmeric} t={t('ob.demo')} disabled={loading} onPress={()=>run(async()=>{const res=await api('/auth/demo',{}); await auth.set(res.token,res.refreshToken); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); r.replace('/(tabs)/sell');})}/>
    <Text style={{color:c.mute,fontSize:12,textAlign:'center'}}>{t('ob.demoNote')}</Text></View>:null;
  if(!perm?.granted) return <View style={{flex:1,justifyContent:'center',padding:24,gap:20,backgroundColor:c.cotton}}><BrandHero/><LangPills/><Text onPress={()=>perm&&!perm.canAskAgain?Linking.openSettings():ask()} style={{fontSize:22,fontWeight:'700',color:c.indigo,textAlign:'center'}}>{perm&&!perm.canAskAgain?t('ob.openSettings'):t('ob.allowCam')}</Text><DemoBtn/></View>;

  if(!scan) return <View style={{flex:1,backgroundColor:c.cotton,padding:16,gap:12,paddingTop:8}}>
    <BrandHero compact/>
    <LangPills/>
    <Text selectable style={{fontSize:26,fontWeight:'800',color:c.indigo}}>{t('ob.scanTitle')}</Text>
    <Text style={{color:c.mute,fontSize:15}}>{t('ob.scanHint')}</Text>
    <CameraView style={{flex:1,borderRadius:20,overflow:'hidden'}} barcodeScannerSettings={{barcodeTypes:['qr']}} onCameraReady={()=>setReady(true)} onMountError={e=>setCamErr(e.message)}
      onBarcodeScanned={({data})=>{ if(busy.current||Date.now()<cool.current) return; setLast(data.slice(0,70)); data=data.trim(); if(!/^upi:\/\/pay\?/i.test(data)) return; run(async()=>{ const s=await api<Scan>('/auth/scan',{qr:data}); const q=new URLSearchParams(data.split('?')[1]); setUpi((q.get('pa')||'').toLowerCase()); setName(s.name); setScan(s); }); }}/>
    <Text style={{fontSize:12,color:c.mute}}>Camera: {camErr?'✖ '+camErr:ready?'✔ ready':'starting…'}  ·  Server: {srv}{'\n'}API: {BASE}{'\n'}Last scan: {last||'(nothing read yet)'}{last&&!/^upi:\/\/pay\?/i.test(last.trim())?'  ← not a UPI QR, ignored':''}</Text>
    {loading&&<ActivityIndicator color={c.madder}/>}<DemoBtn/></View>;

  return <ScrollView style={{backgroundColor:c.cotton}} contentContainerStyle={{padding:16,gap:12}} keyboardShouldPersistTaps="handled">
    <Text style={{fontSize:24,fontWeight:'800',color:c.indigo}}>{t('ob.profile')}</Text>
    <View style={{...card,gap:6}}>
      <Text style={{color:c.mute}}>{t('pf.upi')}</Text><Text selectable style={{fontSize:20,fontWeight:'700'}}>{upi}</Text>
      <Text style={{color:c.mute,marginTop:6}}>{t('pf.app')}</Text><Text style={{fontSize:18,fontWeight:'700'}}>{scan.bank.app}</Text>
      <Text style={{color:c.mute,marginTop:6}}>{t('pf.bank')}</Text><Text style={{fontSize:18,fontWeight:'700'}}>{scan.bank.bank}</Text>
      <Text style={{color:c.mute,fontSize:13,marginTop:6}}>{t('ob.handleNote',{h:scan.bank.handle})}</Text></View>
    <Text style={{color:c.mute}}>{t('pf.displayName')}</Text>
    <TextInput value={name} onChangeText={setName} maxLength={80} style={{...card,fontSize:18}} accessibilityLabel="Display name"/>
    <View style={{...card,gap:8,borderWidth:1,borderColor:c.turmeric}}>
      <Text style={{fontWeight:'800',fontSize:16}}>{t('ob.verifyTitle')}</Text>
      {scan.mock?<Text selectable style={{fontSize:15}}>{t('ob.verifyMock')}{'\n'}<Text style={{fontWeight:'800'}}>{scan.mock.narration}</Text></Text>
        :<Text style={{fontSize:15}}>{t('ob.verifyReal')}</Text>}
      <TextInput value={code} onChangeText={t=>setCode(t.replace(/\D/g,'').slice(0,6))} keyboardType="number-pad" placeholder="••••••" maxLength={6} textContentType="oneTimeCode" autoComplete="sms-otp" style={{...card,fontSize:28,letterSpacing:8,textAlign:'center'}} accessibilityLabel="Verification code"/></View>
    <Btn bg={c.madder} disabled={loading||code.length!==6||!name.trim()} t={loading?'…':t('ob.create')} onPress={()=>run(async()=>{
      const res=await api('/auth/verify',{upi,code,name:name.trim()}); await auth.set(res.token,res.refreshToken); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); r.replace('/(tabs)/sell'); })}/>
    <Text onPress={()=>{setScan(null);setCode('');}} style={{textAlign:'center',color:c.indigo,fontSize:16,padding:8}}>{t('ob.rescan')}</Text>
  </ScrollView>;
}
