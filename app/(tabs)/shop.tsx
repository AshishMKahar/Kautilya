import {ActivityIndicator,FlatList,Pressable,Text,View} from 'react-native';
import {Image} from 'expo-image';
import {useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {api,imgUrl} from '@/lib/api';
import {c,card} from '@/lib/theme';
import {useLang} from '@/lib/i18n';
export default function Shop(){
  const router=useRouter(); const {t}=useLang();
  const {data,isPending,isError,error,refetch,isRefetching}=useQuery({queryKey:['shop'],queryFn:()=>api<any[]>('/items')});
  if(isPending) return <View style={{flex:1,justifyContent:'center',backgroundColor:c.cotton}}><ActivityIndicator size="large" color={c.madder}/></View>;
  if(isError) return <View style={{flex:1,justifyContent:'center',padding:24,gap:16,backgroundColor:c.cotton}}><Text style={{fontSize:20,textAlign:'center'}}>{(error as Error).message}</Text>
    <Pressable onPress={()=>refetch()} style={{backgroundColor:c.indigo,padding:16,borderRadius:16,alignItems:'center'}}><Text style={{color:'#fff',fontSize:20,fontWeight:'700'}}>{t('common.retry')}</Text></Pressable></View>;
  return <FlatList contentInsetAdjustmentBehavior="automatic" style={{backgroundColor:c.cotton}} contentContainerStyle={{padding:12,gap:12}} columnWrapperStyle={{gap:12}} numColumns={2}
    data={data} keyExtractor={i=>String(i.id)} refreshing={isRefetching} onRefresh={refetch}
    ListEmptyComponent={<Text style={{fontSize:20,textAlign:'center',color:c.mute,marginTop:48}}>{t('shop.empty')}</Text>}
    renderItem={({item})=><Pressable style={{flex:1}} onPress={()=>router.push({pathname:'/item/[id]',params:{id:String(item.id)}})}>
      <View style={{...card,padding:10,gap:6}}>
        <Image source={{uri:imgUrl(item.imageUrl)}} style={{width:'100%',aspectRatio:1,borderRadius:12}} contentFit="cover"/>
        <Text numberOfLines={2} style={{fontSize:16,fontWeight:'700'}}>{item.title_en}</Text>
        <Text style={{fontSize:20,fontWeight:'800',color:c.madder,fontVariant:['tabular-nums']}}>₹{item.price}</Text></View></Pressable>}/>;
}
