import {Text} from 'react-native';
import {Tabs} from 'expo-router';
import {c} from '@/lib/theme';
import HeaderButtons from '@/components/header-buttons';
import {HeaderLogo} from '@/components/brand';
import {useLang} from '@/lib/i18n';
const ic=(e:string)=>()=><Text style={{fontSize:24}}>{e}</Text>;
export default function TabsLayout(){
  const {t}=useLang();
  return <Tabs screenOptions={{tabBarActiveTintColor:c.madder,tabBarLabelStyle:{fontSize:13,fontWeight:'700'},headerStyle:{backgroundColor:c.cotton},headerLeft:()=><HeaderLogo/>,headerRight:()=><HeaderButtons/>}}>
    <Tabs.Screen name="sell" options={{title:t('tab.sell'),tabBarLabel:t('tab.sell'),tabBarIcon:ic('📷')}}/>
    <Tabs.Screen name="items" options={{title:t('tab.items'),tabBarLabel:t('tab.items.l'),tabBarIcon:ic('🧺')}}/>
    <Tabs.Screen name="shop" options={{title:t('tab.shop'),tabBarLabel:t('tab.shop.l'),tabBarIcon:ic('🛍️')}}/>
    <Tabs.Screen name="orders" options={{title:t('tab.orders'),tabBarLabel:t('tab.orders'),tabBarIcon:ic('📦')}}/>
    <Tabs.Screen name="earnings" options={{title:t('tab.earnings'),tabBarLabel:t('tab.earnings'),tabBarIcon:ic('💰')}}/>
  </Tabs>;
}
