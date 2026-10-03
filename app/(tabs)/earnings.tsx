import {ScrollView,Text,View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import EarningsChart from '@/components/earnings-chart';
import {api} from '@/lib/api';
import {c,card} from '@/lib/theme';
import {useLang} from '@/lib/i18n';
export default function Earnings(){
  const {t}=useLang();
  const {data}=useQuery({queryKey:['earnings'],queryFn:()=>api('/earnings'),refetchInterval:30000});
  return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{backgroundColor:c.cotton}} contentContainerStyle={{padding:16,gap:14}}>
    <Text selectable style={{fontSize:56,fontWeight:'800',color:c.indigo,fontVariant:['tabular-nums']}}>₹{data?.total??0}</Text>
    <Text style={{color:c.mute,fontSize:16}}>{t('earn.total')}</Text>
    {!!data?.pending&&<View style={{...card,borderWidth:1,borderColor:c.turmeric}}><Text style={{fontSize:22,fontWeight:'800',fontVariant:['tabular-nums']}}>₹{data.pending}</Text><Text style={{color:c.mute}}>{t('earn.pending')}</Text></View>}
    <EarningsChart data={data?.month??[]} empty={t('earn.empty')} dom={{scrollEnabled:false,style:{height:230}}}/>
    {Object.entries(data?.bySource??{}).map(([k,v])=><Text key={k} style={{...card,fontSize:20,fontWeight:'600'}}>{k==='app'?t('ch.app'):k}: ₹{String(v)}</Text>)}
  </ScrollView>;
}
