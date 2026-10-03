import {Text,View} from 'react-native';
import {Image} from 'expo-image';
import {c} from '@/lib/theme';
import {useLang} from '@/lib/i18n';
const LOGO=require('../assets/logo.png');
// The Kautilya monogram. Aspect ratio matches the source artwork (375x331).
export const Logo=({size=40}:{size?:number})=><Image source={LOGO} style={{width:size,height:Math.round(size*331/375)}} contentFit="contain" accessibilityLabel="Kautilya logo"/>;
export const HeaderLogo=()=><View style={{paddingLeft:14}}><Logo size={34}/></View>;
// Big branded block for sign-in and loading screens.
export const BrandHero=({compact}:{compact?:boolean})=>{ const {t}=useLang(); return <View style={{alignItems:'center',gap:compact?4:8,paddingVertical:compact?4:12}}>
  <Logo size={compact?64:110}/>
  <Text style={{fontSize:compact?26:34,fontWeight:'800',color:c.navy,letterSpacing:1}}>Kautilya</Text>
  {!compact&&<Text style={{fontSize:15,color:c.mute,textAlign:'center'}}>{t('brand.tag')}</Text>}
</View>; };
