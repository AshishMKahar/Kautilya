import {fetch} from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
const rawBase=(process.env.EXPO_PUBLIC_API_URL as string)||'';
// Tolerate a mangled value (markdown link pasted into .env, quotes, spaces, trailing slash) by picking the real http(s)://host[:port] out of it.
export const BASE=(rawBase.match(/https?:\/\/[A-Za-z0-9.\-]+(?::\d+)?/)||[''])[0]; if(!BASE) throw new Error('EXPO_PUBLIC_API_URL missing or malformed. Value seen by the app: '+JSON.stringify(rawBase));
// Release builds talk HTTPS only: a plain-http URL would expose tokens and orders on the network.
if(!__DEV__&&!BASE.startsWith('https://')) throw new Error('EXPO_PUBLIC_API_URL must be https:// in release builds');
export const imgUrl=(p:string)=>BASE+p; // product photos are public by design (marketplaces fetch them)
// Tokens live in the OS keychain/keystore, are not synced to the cloud or restored onto another device, and need an unlocked phone.
const S={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
export const auth={
  token:()=>SecureStore.getItemAsync('token',S), refresh:()=>SecureStore.getItemAsync('refresh',S),
  set:async(t:string,r:string)=>{await SecureStore.setItemAsync('token',t,S);await SecureStore.setItemAsync('refresh',r,S);},
  clear:async()=>{await SecureStore.deleteItemAsync('token',S);await SecureStore.deleteItemAsync('refresh',S);}};
export class ApiError extends Error{constructor(m:string,public status:number){super(m);}}
let onAuthLost:()=>void=()=>{}; export const setAuthLost=(f:()=>void)=>{onAuthLost=f;};
const raw=async(path:string,body:unknown|undefined,token:string|null)=>{
  const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),10000);   // never hang forever on a wrong IP / blocked port
  try{return await fetch(BASE+path,{method:body!==undefined?'POST':'GET',signal:ctl.signal,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body!==undefined?JSON.stringify(body):undefined});}
  catch{throw new ApiError(`Server nahi mila / Cannot reach server at ${BASE}`,0);} finally{clearTimeout(t);} };
let refreshing:Promise<boolean>|null=null;   // single flight: parallel 401s trigger one refresh, so a rotated token is never replayed
const refresh=()=>refreshing??(refreshing=(async()=>{try{const rt=await auth.refresh(); if(!rt) return false; const r=await raw('/auth/refresh',{refreshToken:rt},null); if(!r.ok) return false;
  const d=await r.json(); await auth.set(d.token,d.refreshToken); return true;}catch{return false;}finally{setTimeout(()=>{refreshing=null;},0);}})());
export async function api<T=any>(path:string,body?:unknown):Promise<T>{
  let r=await raw(path,body,await auth.token());
  if(r.status===401&&!path.startsWith('/auth/')){ if(await refresh()) r=await raw(path,body,await auth.token()); else {await auth.clear(); onAuthLost();} }
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new ApiError(e.error||'Request failed',r.status);}
  return r.json();
}
export async function logout(){ try{await api('/auth/logout',{});}catch{} await auth.clear(); }
