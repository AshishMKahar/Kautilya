import {useState} from 'react';
import {ActivityIndicator,Alert,ScrollView,Text,TextInput,View} from 'react-native';
import {Image} from 'expo-image';
import * as Haptics from 'expo-haptics';
import {useLocalSearchParams} from 'expo-router';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {api,imgUrl} from '@/lib/api';
import {c,card} from '@/lib/theme';
import {Btn,Chip} from '@/components/ui';
import {useLang} from '@/lib/i18n';
const STEPS=['awaiting_payment','paid','shipped','completed'];
export default function OrderDetail(){
  const {id}=useLocalSearchParams<{id:string}>(); const qc=useQueryClient(); const [track,setTrack]=useState(''); const {t}=useLang();
  const ask=(ti:string,m:string,go:()=>void)=>Alert.alert(ti,m,[{text:t('no'),style:'cancel'},{text:t('yes'),style:'destructive',onPress:go}]);
  const {data:o,isPending,isError,error,refetch}=useQuery({queryKey:['order',id],queryFn:()=>api<any>(`/orders/${id}`),refetchInterval:15000});
  const act=useMutation({mutationFn:(a:{p:string;b?:any})=>api(`/orders/${id}/${a.p}`,a.b??{}),
    onSuccess:()=>{Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);for(const k of ['order','orders','earnings','notifications'])qc.invalidateQueries({queryKey:[k]});},
    onError:(e:any)=>Alert.alert(t('err'),e.message)});
  const go=(p:string,b?:any)=>act.mutate({p,b});
  if(isPending) return <View style={{flex:1,justifyContent:'center',backgroundColor:c.cotton}}><ActivityIndicator size="large" color={c.madder}/></View>;
  if(isError) return <View style={{flex:1,justifyContent:'center',padding:24,gap:16,backgroundColor:c.cotton}}><Text style={{fontSize:20,textAlign:'center'}}>{(error as Error).message}</Text><Btn t={t('common.retry')} onPress={()=>refetch()}/></View>;
  const buyer=o.role==='buyer', seller=o.role==='seller', mkt=!o.escrow, step=STEPS.indexOf(o.status);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{backgroundColor:c.cotton}} contentContainerStyle={{padding:16,gap:12}}>
    <View style={{...card,flexDirection:'row',gap:12}}>
      <Image source={{uri:imgUrl(o.imageUrl)}} style={{width:84,height:84,borderRadius:12}} contentFit="cover"/>
      <View style={{flex:1,gap:4}}><Text numberOfLines={2} style={{fontSize:18,fontWeight:'700'}}>{o.title}</Text>
        <Text style={{fontSize:20,fontWeight:'800',color:c.madder,fontVariant:['tabular-nums']}}>{o.qty} × · ₹{o.amount}</Text>
        <Text style={{color:c.mute}}>#{o.id} · {buyer?t('role.seller'):t('role.buyer')}: {o.counterparty}</Text><Chip status={o.status}/></View></View>
    {!mkt&&step>=0&&<View style={{flexDirection:'row',gap:6}}>{STEPS.map((s,i)=><View key={s} style={{flex:1,height:6,borderRadius:3,backgroundColor:i<=step?c.indigo:'#ddd'}}/>)}</View>}
    {mkt&&<Text style={{...card,color:c.mute}}>{t('od.market',{ch:o.channel})}</Text>}
    {o.shipTo&&<View style={card}><Text style={{color:c.mute}}>{t('od.shipTo')}</Text><Text selectable style={{fontSize:17}}>{o.shipTo}</Text></View>}
    {o.tracking&&<Text selectable style={{...card,fontSize:16}}>📦 {o.tracking}</Text>}

    {buyer&&o.status==='awaiting_payment'&&<>
      <Text style={{...card,fontSize:15}}>{t('od.mockPay')}</Text>
      <Btn bg={c.madder} disabled={act.isPending} t={t('od.pay',{n:o.amount})} onPress={()=>go('pay')}/>
      {__DEV__&&<Text onPress={()=>go('pay',{simulate:'fail'})} style={{textAlign:'center',color:c.mute,padding:6}}>🧪 test: simulate declined payment</Text>}</>}
    {seller&&!mkt&&o.status==='paid'&&<>
      <TextInput value={track} onChangeText={setTrack} maxLength={120} placeholder={t('od.tracking')} style={{...card,fontSize:16}}/>
      <Btn disabled={act.isPending} t={t('od.ship')} onPress={()=>go('ship',track.trim()?{tracking:track.trim()}:{})}/></>}
    {buyer&&o.status==='shipped'&&<>
      <Btn bg={c.green} disabled={act.isPending} t={t('od.confirm')} onPress={()=>ask(t('od.confirmQ'),t('od.confirmMsg'),()=>go('confirm'))}/>
      <Btn bg={c.mute} disabled={act.isPending} t={t('od.dispute')} onPress={()=>ask(t('od.disputeQ'),t('od.disputeMsg'),()=>go('dispute'))}/></>}
    {!mkt&&((buyer&&['awaiting_payment','paid'].includes(o.status))||(seller&&o.status==='paid'))&&
      <Text onPress={()=>ask(t('od.cancelQ'),o.status==='paid'?t('od.cancelMsgPaid'):t('od.cancelMsg'),()=>go('cancel'))} style={{textAlign:'center',color:c.madder,fontSize:16,padding:10}}>{t('od.cancel')}</Text>}
    {o.status==='shipped'&&buyer&&<Text style={{color:c.mute,fontSize:13,textAlign:'center'}}>{t('od.autoRelease')}</Text>}
    {o.status==='disputed'&&<Text style={{...card,color:c.madder}}>{t('od.disputed')}</Text>}

    <Text style={{fontSize:16,fontWeight:'700',marginTop:8}}>{t('od.history')}</Text>
    {o.events.map((e:any,i:number)=><Text key={i} style={{color:c.mute}}>{new Date(e.at).toLocaleString('en-IN')} · {e.to.replace('_',' ')} ({e.actor})</Text>)}
  </ScrollView>;
}
