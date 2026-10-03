'use dom';
import {BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer} from 'recharts';
// Expo DOM component: runs in a webview on native, as-is on web. Parent passes `dom={{...}}`.
export default function EarningsChart({data,empty}:{data:{m:string;v:number}[];empty?:string;dom?:import('expo/dom').DOMProps}){
  if(!data.length) return <div style={{padding:24,textAlign:'center',color:'#6B6B6B',fontFamily:'sans-serif',fontSize:18}}>{empty||'No sales yet'}</div>;
  return <div style={{width:'100%',height:220}}><ResponsiveContainer><BarChart data={data}><XAxis dataKey="m"/><YAxis width={40}/><Tooltip/><Bar dataKey="v" fill="#27337A" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div>;
}
