import {useEffect} from 'react';
import {FlatList,Pressable,Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {c,card} from '@/lib/theme';
import {useLang} from '@/lib/i18n';
export default function Notifications(){
  const qc=useQueryClient(); const router=useRouter(); const {t}=useLang();
  const {data,refetch,isRefetching}=useQuery({queryKey:['notifications'],queryFn:()=>api<any>('/notifications'),refetchInterval:20000});
  const read=useMutation({mutationFn:()=>api('/notifications/read',{}),onSuccess:()=>qc.invalidateQueries({queryKey:['notifications']})});
  useEffect(()=>{ if(data?.unread) { const t=setTimeout(()=>read.mutate(),1500); return ()=>clearTimeout(t); } },[data?.unread]);   // mark read after the person has seen them
  return <FlatList style={{backgroundColor:c.cotton}} contentContainerStyle={{padding:16,gap:10}} data={data?.items??[]} keyExtractor={n=>String(n.id)} refreshing={isRefetching} onRefresh={refetch}
    ListEmptyComponent={<Text style={{fontSize:18,textAlign:'center',color:c.mute,marginTop:48}}>{t('notif.empty')}</Text>}
    renderItem={({item})=><Pressable disabled={!item.orderId} onPress={()=>router.push(`/order/${item.orderId}` as any)}><View style={{...card,gap:4,borderLeftWidth:4,borderLeftColor:item.read?'#ddd':c.madder}}>
      <Text style={{fontSize:16,fontWeight:item.read?'400':'700'}}>{item.text}</Text><Text style={{color:c.mute,fontSize:13}}>{new Date(item.at).toLocaleString('en-IN')}</Text></View></Pressable>}/>;
}
