import {useState} from 'react';
import {ActivityIndicator,FlatList,Pressable,Text,View} from 'react-native';
import {Image} from 'expo-image';
import {useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {api,imgUrl} from '@/lib/api';
import {c,card} from '@/lib/theme';
import {Chip} from '@/components/ui';
import {useLang} from '@/lib/i18n';
export default function Orders(){
  const [as,setAs]=useState<'buyer'|'seller'>('buyer'); const router=useRouter(); const {t}=useLang();
  const {data,isPending,isError,error,refetch,isRefetching}=useQuery({queryKey:['orders',as],queryFn:()=>api<any[]>(`/orders?as=${as}`),refetchInterval:20000});
  const Tab=({k,t}:{k:'buyer'|'seller';t:string})=><Pressable onPress={()=>setAs(k)} style={{flex:1,padding:12,borderRadius:12,alignItems:'center',backgroundColor:as===k?c.indigo:'#fff'}}><Text style={{fontSize:17,fontWeight:'700',color:as===k?'#fff':c.ink}}>{t}</Text></Pressable>;
  return <View style={{flex:1,backgroundColor:c.cotton}}>
    <View style={{flexDirection:'row',gap:8,padding:16,paddingBottom:0}}><Tab k="buyer" t={t('ord.bought')}/><Tab k="seller" t={t('ord.received')}/></View>
    {isPending?<ActivityIndicator style={{marginTop:48}} size="large" color={c.madder}/>
    :isError?<Pressable onPress={()=>refetch()}><Text style={{fontSize:20,textAlign:'center',margin:24}}>{(error as Error).message} · {t('common.retry')}</Text></Pressable>
    :<FlatList contentContainerStyle={{padding:16,gap:12}} data={data} keyExtractor={o=>String(o.id)} refreshing={isRefetching} onRefresh={refetch}
      ListEmptyComponent={<Text style={{fontSize:20,textAlign:'center',color:c.mute,marginTop:48}}>{as==='buyer'?t('ord.emptyBuyer'):t('ord.emptySeller')}</Text>}
      renderItem={({item})=><Pressable onPress={()=>router.push(`/order/${item.id}` as any)}><View style={{...card,flexDirection:'row',gap:12}}>
        <Image source={{uri:imgUrl(item.imageUrl)}} style={{width:72,height:72,borderRadius:12}} contentFit="cover"/>
        <View style={{flex:1,gap:3}}><Text numberOfLines={2} style={{fontSize:17,fontWeight:'700'}}>{item.title}</Text>
          <Text style={{fontSize:18,fontWeight:'800',color:c.madder,fontVariant:['tabular-nums']}}>{item.qty} × · ₹{item.amount}</Text>
          <Chip status={item.status}/>
          <Text style={{color:c.mute}}>{as==='buyer'?'→':'←'} {item.counterparty}{item.channel!=='app'?` · ${item.channel}`:''} · {new Date(item.at).toLocaleDateString('en-IN')}</Text></View></View></Pressable>}/>}
  </View>;
}
