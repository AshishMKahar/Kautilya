import {useEffect,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {Redirect} from 'expo-router';
import {auth} from '@/lib/api';
import {c} from '@/lib/theme';
import {BrandHero} from '@/components/brand';
export default function Index(){
  const [t,setT]=useState<string|null|undefined>(undefined);
  useEffect(()=>{auth.token().then(setT);},[]);
  if(t===undefined) return <View style={{flex:1,justifyContent:'center',gap:24,backgroundColor:c.cotton}}><BrandHero/><ActivityIndicator size="large" color={c.madder}/></View>;
  return <Redirect href={t?'/(tabs)/sell':'/onboard'}/>;
}
