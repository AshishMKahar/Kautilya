import {useState} from 'react';
import {ActivityIndicator,Alert,ScrollView,Switch,Text,TextInput,View} from 'react-native';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {c,card} from '@/lib/theme';
import {Btn} from '@/components/ui';
import {useLang} from '@/lib/i18n';

// Each artisan connects their OWN seller account. Keys are sent once over HTTPS, stored encrypted on the server and never shown again.
const T:Record<string,[string,string,string]>={ // key -> [English, Hindi, Marathi]
  intro:['Connect your own Amazon or Flipkart seller account. Your keys are encrypted on our server and used only to list your products and fetch your orders. Never share them with anyone.',
    'अपना Amazon या Flipkart विक्रेता खाता जोड़ें। आपकी कुंजियाँ सर्वर पर एन्क्रिप्ट रहती हैं और केवल आपके उत्पाद सूचीबद्ध करने और ऑर्डर लाने के काम आती हैं। इन्हें किसी से साझा न करें।',
    'तुमचे Amazon किंवा Flipkart विक्रेता खाते जोडा. तुमच्या की सर्व्हरवर एन्क्रिप्ट राहतात आणि फक्त उत्पादने सूचीबद्ध करण्यासाठी व ऑर्डर आणण्यासाठी वापरल्या जातात. त्या कोणालाही देऊ नका.'],
  need:['You need an approved seller account with API access on that marketplace.','उस मार्केटप्लेस पर API एक्सेस वाला स्वीकृत विक्रेता खाता चाहिए।','त्या मार्केटप्लेसवर API प्रवेश असलेले मंजूर विक्रेता खाते हवे.'],
  connected:['Connected','जुड़ा है','जोडलेले आहे'], notConnected:['Not connected','जुड़ा नहीं है','जोडलेले नाही'],
  save:['Save keys','कुंजियाँ सहेजें','की जतन करा'], test:['Test keys','कुंजियाँ जाँचें','की तपासा'], remove:['Remove keys','कुंजियाँ हटाएँ','की काढा'],
  saved:['Saved. Your keys are encrypted.','सहेजा गया। आपकी कुंजियाँ एन्क्रिप्ट हैं।','जतन केले. तुमच्या की एन्क्रिप्ट आहेत.'],
  keep:['Saved. Leave blank to keep it.','सहेजा है। रखने के लिए खाली छोड़ें।','जतन आहे. ठेवण्यासाठी रिकामे सोडा.'],
  removeQ:['Remove these keys?','ये कुंजियाँ हटाएँ?','या की काढायच्या?'], removeMsg:['Listings will go back to the platform account.','सूचियाँ प्लेटफ़ॉर्म खाते पर लौट जाएँगी।','यादी प्लॅटफॉर्म खात्यावर परत जातील.'],
  yes:['Remove','हटाएँ','काढा'], no:['Cancel','रद्द करें','रद्द करा'], problem:['Problem','समस्या','अडचण']};

type Field={name:string;label:string;secret:boolean;optional:boolean;type:'text'|'bool';set?:boolean;value?:string|boolean};
type Chan={channel:string;connected:boolean;fields:Field[]};
const NAMES:Record<string,string>={amazon:'Amazon',flipkart:'Flipkart'};

function Card({ch,tx}:{ch:Chan;tx:(k:string)=>string}){
  const qc=useQueryClient();
  const [form,setForm]=useState<Record<string,string|boolean>>(()=>Object.fromEntries(ch.fields.map(f=>[f.name,f.secret?'':(f.value??(f.type==='bool'?false:''))])));
  const [msg,setMsg]=useState('');
  const refresh=(d:Chan)=>{ qc.setQueryData(['integrations'],(o:any)=>({channels:{...(o?.channels||{}),[d.channel]:d}})); };
  const save=useMutation({mutationFn:()=>api<Chan>('/integrations/save',{channel:ch.channel,fields:form}),
    onSuccess:d=>{ refresh(d); setForm(f=>({...f,...Object.fromEntries(d.fields.filter(x=>x.secret).map(x=>[x.name,''])) })); setMsg(tx('saved')); },
    onError:(e:any)=>{ setMsg(''); Alert.alert(tx('problem'),e.message); }});
  const test=useMutation({mutationFn:()=>api<{ok:boolean;message:string}>('/integrations/test',{channel:ch.channel}),
    onSuccess:d=>setMsg((d.ok?'✅ ':'❌ ')+d.message), onError:(e:any)=>Alert.alert(tx('problem'),e.message)});
  const del=useMutation({mutationFn:()=>api<Chan>('/integrations/remove',{channel:ch.channel}),
    onSuccess:d=>{ refresh(d); setForm(Object.fromEntries(d.fields.map(f=>[f.name,f.type==='bool'?false:'']))); setMsg(''); }});
  const busy=save.isPending||test.isPending||del.isPending;
  return <View style={{...card,gap:10}}>
    <Text style={{fontSize:20,fontWeight:'800',color:c.indigo}}>{NAMES[ch.channel]||ch.channel}</Text>
    <Text style={{color:ch.connected?c.green:c.mute,fontWeight:'700'}}>{ch.connected?'✅ '+tx('connected'):tx('notConnected')}</Text>
    {ch.fields.map(f=><View key={f.name} style={{gap:4}}>
      <Text style={{color:c.mute,fontSize:14}}>{f.label}{f.secret&&f.set?'  ('+tx('keep')+')':''}</Text>
      {f.type==='bool'
        ?<Switch value={!!form[f.name]} onValueChange={v=>setForm(o=>({...o,[f.name]:v}))}/>
        :<TextInput value={String(form[f.name]??'')} onChangeText={v=>setForm(o=>({...o,[f.name]:v}))}
           secureTextEntry={f.secret} autoCapitalize="none" autoCorrect={false} spellCheck={false} textContentType="none" importantForAutofill="no"
           placeholder={f.secret&&f.set?'••••••••':''} style={{borderWidth:1,borderColor:'#D9D2C3',borderRadius:12,padding:12,fontSize:16,backgroundColor:'#fff'}}/>}
    </View>)}
    {!!msg&&<Text selectable style={{color:c.ink,fontSize:14}}>{msg}</Text>}
    {busy&&<ActivityIndicator color={c.madder}/>}
    <Btn t={tx('save')} disabled={busy} onPress={()=>{ setMsg(''); save.mutate(); }}/>
    {ch.connected&&<Btn bg={c.turmeric} t={tx('test')} disabled={busy} onPress={()=>{ setMsg(''); test.mutate(); }}/>}
    {ch.connected&&<Btn bg={c.madder} t={tx('remove')} disabled={busy} onPress={()=>Alert.alert(tx('removeQ'),tx('removeMsg'),[{text:tx('no'),style:'cancel'},{text:tx('yes'),style:'destructive',onPress:()=>del.mutate()}])}/>}
  </View>;
}

export default function Integrations(){
  const {lang}=useLang(); const i=lang==='hi'?1:lang==='mr'?2:0; const tx=(k:string)=>T[k]?.[i]??T[k]?.[0]??k;
  const {data,isPending,error}=useQuery({queryKey:['integrations'],queryFn:()=>api<{channels:Record<string,Chan>}>('/integrations')});
  if(isPending) return <View style={{flex:1,justifyContent:'center',backgroundColor:c.cotton}}><ActivityIndicator size="large" color={c.madder}/></View>;
  if(error||!data) return <View style={{flex:1,justifyContent:'center',padding:24,backgroundColor:c.cotton}}><Text style={{textAlign:'center',color:c.mute}}>{(error as any)?.message||'Error'}</Text></View>;
  return <ScrollView style={{backgroundColor:c.cotton}} contentContainerStyle={{padding:16,gap:14}} keyboardShouldPersistTaps="handled">
    <Text style={{fontSize:15,color:c.ink}}>{tx('intro')}</Text>
    <Text style={{fontSize:13,color:c.mute}}>{tx('need')}</Text>
    {Object.values(data.channels).map(ch=><Card key={ch.channel} ch={ch} tx={tx}/>)}
  </ScrollView>;
}
