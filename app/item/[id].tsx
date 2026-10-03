import {useState} from 'react';
import {ActivityIndicator,Alert,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {Image} from 'expo-image';
import * as Haptics from 'expo-haptics';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {api,imgUrl} from '@/lib/api';
import {c,card} from '@/lib/theme';
import {Btn} from '@/components/ui';
import {useLang} from '@/lib/i18n';
export default function ItemDetail(){
  const {id}=useLocalSearchParams<{id:string}>(); const qc=useQueryClient(); const router=useRouter(); const {t,lang}=useLang();
  const [qty,setQty]=useState(1); const [addr,setAddr]=useState('');
  const {data:it,isPending,isError,error,refetch}=useQuery({queryKey:['item',id],queryFn:()=>api<any>(`/items/${id}`)});
  const order=useMutation({mutationFn:()=>api('/orders',{itemId:Number(id),qty,shipTo:addr.trim()}),
    onSuccess:(o:any)=>{Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);qc.invalidateQueries({queryKey:['orders']});qc.invalidateQueries({queryKey:['shop']});router.replace(`/order/${o.id}` as any);},   // straight to checkout
    onError:(e:any)=>Alert.alert(t('err'),e.message)});
  if(isPending) return <View style={{flex:1,justifyContent:'center',backgroundColor:c.cotton}}><ActivityIndicator size="large" color={c.madder}/></View>;
  if(isError) return <View style={{flex:1,justifyContent:'center',padding:24,gap:16,backgroundColor:c.cotton}}><Text style={{fontSize:20,textAlign:'center'}}>{(error as Error).message}</Text><Btn t={t('common.retry')} onPress={()=>refetch()}/></View>;
  const total=Math.round(it.price*qty*100)/100, max=Math.min(10,it.stock||0);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{backgroundColor:c.cotton}} contentContainerStyle={{padding:16,gap:12}}>
    <Image source={{uri:imgUrl(it.imageUrl)}} style={{width:'100%',height:320,borderRadius:20}} contentFit="cover"/>
    <Text selectable style={{fontSize:24,fontWeight:'800'}}>{it.title_en}</Text>
    <Text style={{color:c.mute,fontSize:16}}>{it.sellerName?t('item.seller',{n:it.sellerName})+(it.sellerVerified?' ✔ '+t('verified'):''):''}</Text>
    <Text selectable style={{fontSize:32,fontWeight:'800',color:c.madder,fontVariant:['tabular-nums']}}>₹{it.price}</Text>
    <Text selectable style={{...card,fontSize:17,lineHeight:24}}>{lang==='en'?(it.desc_en||it.desc_hi):(it.desc_hi||it.desc_en)}</Text>
    {max<1?<Text style={{fontSize:20,fontWeight:'800',textAlign:'center',color:c.madder}}>{t('item.soldOut')}</Text>:<>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:24}}>
        <Pressable onPress={()=>setQty(q=>Math.max(1,q-1))} style={{...card,width:56,alignItems:'center'}}><Text style={{fontSize:28,fontWeight:'800'}}>−</Text></Pressable>
        <Text style={{fontSize:28,fontWeight:'800',fontVariant:['tabular-nums']}}>{qty}</Text>
        <Pressable onPress={()=>setQty(q=>Math.min(max,q+1))} style={{...card,width:56,alignItems:'center'}}><Text style={{fontSize:28,fontWeight:'800'}}>+</Text></Pressable></View>
      <TextInput multiline maxLength={300} value={addr} onChangeText={setAddr} placeholder={t('item.addr')} style={{...card,fontSize:17,minHeight:80}} accessibilityLabel="Delivery address"/>
      <Text style={{color:c.mute,fontSize:14}}>{t('item.escrow')}</Text>
      <Btn bg={c.madder} disabled={order.isPending||addr.trim().length<10} t={order.isPending?'…':t('item.order',{n:total})} onPress={()=>order.mutate()}/></>}
  </ScrollView>;
}
