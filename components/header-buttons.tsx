import {Alert,Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {c} from '@/lib/theme';
import {useLang} from '@/lib/i18n';
export default function HeaderButtons(){
  const r=useRouter(); const {t,setLang}=useLang(); const {data}=useQuery({queryKey:['notifications'],queryFn:()=>api<any>('/notifications'),refetchInterval:20000});
  return <View style={{flexDirection:'row',gap:18,paddingRight:16}}>
    <Text accessibilityRole="button" accessibilityLabel="Language" onPress={()=>Alert.alert(t('lang.title'),'',[{text:'English',onPress:()=>setLang('en')},{text:'हिन्दी',onPress:()=>setLang('hi')},{text:'मराठी',onPress:()=>setLang('mr')}])} style={{fontSize:24}}>🌐</Text>
    <Text accessibilityRole="button" accessibilityLabel="Notifications" onPress={()=>r.push('/notifications' as any)} style={{fontSize:24}}>🔔{!!data?.unread&&<Text style={{fontSize:13,color:'#fff',backgroundColor:c.madder,fontWeight:'800'}}> {data.unread>9?'9+':data.unread} </Text>}</Text>
    <Text accessibilityRole="button" accessibilityLabel="Profile" onPress={()=>r.push('/profile' as any)} style={{fontSize:24}}>👤</Text></View>;
}
