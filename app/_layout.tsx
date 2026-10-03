import {useEffect} from 'react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Stack,useRouter} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {setAuthLost} from '@/lib/api';
import {LangProvider,useLang} from '@/lib/i18n';
const qc=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:30000}}});
const H={headerShown:true,headerStyle:{backgroundColor:'#FBF6EC'}};
function Shell(){
  const r=useRouter(); const {t,lang}=useLang();
  useEffect(()=>{ setAuthLost(()=>{qc.clear();r.replace('/onboard');}); },[r]);   // refresh failed or token revoked: wipe cached data and go back to sign-in
  return <Stack screenOptions={{headerShown:false}}>
    <Stack.Screen name="onboard" options={{...H,title:'Kautilya'}}/>
    <Stack.Screen name="item/[id]" options={{...H,title:t('title.item')}}/>
    <Stack.Screen name="order/[id]" options={{...H,title:t('title.order')}}/>
    <Stack.Screen name="notifications" options={{...H,title:t('title.notifications')}}/>
    <Stack.Screen name="profile" options={{...H,title:t('title.profile')}}/>
    <Stack.Screen name="integrations" options={{...H,title:({en:'Marketplace keys',hi:'मार्केटप्लेस कुंजियाँ',mr:'मार्केटप्लेस की'} as Record<string,string>)[lang]}}/>
  </Stack>;
}
export default function Root(){ return <LangProvider><QueryClientProvider client={qc}><StatusBar style="dark"/><Shell/></QueryClientProvider></LangProvider>; }
