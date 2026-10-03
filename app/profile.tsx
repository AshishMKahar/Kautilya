import {Alert,ScrollView,Text,View,ActivityIndicator} from 'react-native';
import {useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api,logout} from '@/lib/api';
import {c,card} from '@/lib/theme';
import {Btn} from '@/components/ui';
import {LangPills,useLang} from '@/lib/i18n';
export default function Profile(){
  const r=useRouter(); const qc=useQueryClient(); const {t,lang}=useLang(); const {data:p,isPending}=useQuery({queryKey:['me'],queryFn:()=>api<any>('/me')});
  if(isPending) return <View style={{flex:1,justifyContent:'center',backgroundColor:c.cotton}}><ActivityIndicator size="large" color={c.madder}/></View>;
  const Row=({k,v}:{k:string;v:string})=><View><Text style={{color:c.mute,fontSize:14}}>{k}</Text><Text selectable style={{fontSize:18,fontWeight:'700'}}>{v}</Text></View>;
  return <ScrollView style={{backgroundColor:c.cotton}} contentContainerStyle={{padding:16,gap:12}}>
    <View style={{...card,gap:12}}>
      <Row k={t('pf.name')} v={p.name}/><Row k={t('pf.upi')} v={p.upi}/><Row k={t('pf.app')} v={p.bank.app}/><Row k={t('pf.bank')} v={p.bank.bank}/>
      <Row k={t('pf.status')} v={p.verified?t('prof.verified'):t('prof.notVerified')}/></View>
    <View style={{...card,gap:10}}><Text style={{color:c.mute,fontSize:14}}>🌐 {t('lang.title')}</Text><LangPills/></View>
    <Btn bg={c.turmeric} t={({en:'Marketplace keys (Amazon / Flipkart)',hi:'मार्केटप्लेस कुंजियाँ (Amazon / Flipkart)',mr:'मार्केटप्लेस की (Amazon / Flipkart)'} as Record<string,string>)[lang]} onPress={()=>r.push('/integrations')}/>
    <Text style={{color:c.mute,fontSize:13}}>{t('prof.note')}</Text>
    <Btn bg={c.madder} t={t('prof.logout')} onPress={()=>Alert.alert(t('prof.logoutQ'),t('prof.logoutMsg'),[{text:t('no'),style:'cancel'},{text:t('yes'),onPress:async()=>{await logout();qc.clear();r.replace('/onboard');}}])}/>
  </ScrollView>;
}
