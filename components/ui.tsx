import {Pressable,Text,View} from 'react-native';
import {c,STATUS} from '@/lib/theme';
import {useLang} from '@/lib/i18n';
export const Btn=({t,onPress,bg=c.indigo,disabled}:{t:string;onPress:()=>void;bg?:string;disabled?:boolean})=>
  <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{backgroundColor:bg,opacity:disabled?.5:1,padding:18,borderRadius:16,borderCurve:'continuous',alignItems:'center'}}><Text style={{color:'#fff',fontSize:20,fontWeight:'700',textAlign:'center'}}>{t}</Text></Pressable>;
export const Chip=({status}:{status:string})=>{const {t}=useLang(); const s=STATUS[status]; const [e,l,col]=s?[s[0],t(s[1]),s[2]]:['•',status,c.mute]; return <Text style={{alignSelf:'flex-start',color:col,fontWeight:'700',fontSize:14}}>{e} {l}</Text>;};
export const Center=({children}:{children:React.ReactNode})=><View style={{flex:1,justifyContent:'center',padding:24,gap:16,backgroundColor:c.cotton}}>{children}</View>;
