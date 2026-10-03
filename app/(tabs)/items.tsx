import {ActivityIndicator,Alert,FlatList,Pressable,Text,View} from 'react-native';
import {Image} from 'expo-image';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api,imgUrl} from '@/lib/api';
import {c,card} from '@/lib/theme';
import {useLang} from '@/lib/i18n';
const CHN:Record<string,string>={amazon:'Amazon',flipkart:'Flipkart',ondc:'ONDC'};
const SYNC:Record<string,[string,string]>={pending:['⏳','sy.pending'],needs_setup:['⚠️','sy.needs_setup'],validated:['🧪','sy.validated'],done:['✅','sy.done'],failed:['❌','sy.failed']};
export default function Items(){
  const qc=useQueryClient(); const {t}=useLang();
  const chn=(k:string)=>k==='gem'?t('ch.gem'):(CHN[k]||k);
  const {data,isPending,isError,error,refetch,isRefetching}=useQuery({queryKey:['items'],queryFn:()=>api<any[]>('/items?mine=1')});
  // Demo only (dev builds + mock marketplace): drop a fake marketplace sale in, so you can watch it flow into Orders and Earnings.
  const fakeSale=async(itemId:number,channel:string)=>{try{await api('/dev/market-sale',{itemId,channel}); qc.invalidateQueries({queryKey:['orders']}); qc.invalidateQueries({queryKey:['earnings']}); Alert.alert('🧪 Demo','Fake '+channel+' sale added. See Orders → Received.');}catch(e:any){Alert.alert('Demo unavailable',e.message);}};
  if(isPending) return <View style={{flex:1,justifyContent:'center',backgroundColor:c.cotton}}><ActivityIndicator size="large" color={c.madder}/></View>;
  if(isError) return <View style={{flex:1,justifyContent:'center',padding:24,gap:16,backgroundColor:c.cotton}}><Text style={{fontSize:20,textAlign:'center'}}>{(error as Error).message}</Text>
    <Pressable onPress={()=>refetch()} style={{backgroundColor:c.indigo,padding:16,borderRadius:16,alignItems:'center'}}><Text style={{color:'#fff',fontSize:20,fontWeight:'700'}}>{t('common.retry')}</Text></Pressable></View>;
  return <FlatList contentInsetAdjustmentBehavior="automatic" style={{backgroundColor:c.cotton}} contentContainerStyle={{padding:16,gap:12}} data={data} keyExtractor={i=>String(i.id)}
    refreshing={isRefetching} onRefresh={refetch}
    ListEmptyComponent={<Text style={{fontSize:20,textAlign:'center',color:c.mute,marginTop:48}}>{t('items.empty')}</Text>}
    renderItem={({item})=><View style={{...card,flexDirection:'row',gap:12}}>
      <Image source={{uri:imgUrl(item.imageUrl)}} style={{width:84,height:84,borderRadius:12}} contentFit="cover"/>
      <View style={{flex:1,gap:4}}><Text numberOfLines={2} selectable style={{fontSize:18,fontWeight:'700'}}>{item.title_en}</Text>
        <Text style={{fontSize:20,fontWeight:'800',color:c.madder,fontVariant:['tabular-nums']}}>₹{item.price} <Text style={{fontSize:14,color:c.mute,fontWeight:'400'}}>· {item.stock>0?t('items.left',{n:item.stock}):t('items.sold')}</Text></Text>
        {(item.sync||[]).map((s:any)=>{const [e,lk]=SYNC[s.status]||['•','']; const l=lk?t(lk):s.status; return <Text key={s.channel} style={{color:c.mute}} onLongPress={__DEV__&&s.status==='done'?()=>fakeSale(item.id,s.channel):undefined}>{e} {chn(s.channel)} · {l}</Text>;})}
        {__DEV__&&(item.sync||[]).some((s:any)=>s.status==='done')&&<Text style={{color:c.mute,fontSize:12}}>🧪 demo: long-press a live channel to simulate a sale</Text>}</View></View>}/>;
}
