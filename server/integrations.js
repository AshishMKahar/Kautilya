// What an artisan can connect, how it is validated, and what the app is allowed to see back (never secrets).
export class BadCreds extends Error{}

export const FIELDS={
  amazon:{
    lwa_client_id:{label:'LWA client ID',max:120},
    lwa_client_secret:{label:'LWA client secret',max:300,secret:true},
    refresh_token:{label:'Refresh token',max:1200,secret:true},
    seller_id:{label:'Seller ID',max:40},
    product_type:{label:'Product type (optional, default PRODUCT)',max:60,optional:true},
    live:{label:'Publish live (off = only check the listing)',bool:true}},
  flipkart:{
    app_id:{label:'Application ID',max:120},
    app_secret:{label:'Application secret',max:300,secret:true},
    listing_url:{label:'Listing API link (flipkart.net / flipkart.com)',max:300,url:true},
    orders_url:{label:'Orders API link (optional)',max:300,url:true,optional:true}}};
export const CHANNELS=Object.keys(FIELDS);

// The server will call these links with the artisan's token, so they must stay on Flipkart. This blocks pointing the server at other sites or internal addresses.
// KAUTILYA_TEST_URLS=1 (tests only, ignored in production) allows http://localhost fakes.
export function trustedUrl(v){
  let u; try{ u=new URL(v); }catch{ throw new BadCreds('Enter the full link, starting with https://'); }
  if(process.env.KAUTILYA_TEST_URLS==='1'&&process.env.NODE_ENV!=='production') return u.toString();
  if(u.protocol!=='https:'||u.username||u.password||u.port) throw new BadCreds('Link must start with https:// and have no password or port');
  if(!/(^|\.)flipkart\.(net|com)$/i.test(u.hostname)) throw new BadCreds('Link must be on flipkart.net or flipkart.com');
  return u.toString();
}

// Merge what the artisan typed with what is already saved. A blank secret keeps the saved one, so keys never have to be shown again to be edited.
export function normalise(channel,input,old=null){
  const spec=FIELDS[channel]; if(!spec) throw new BadCreds('Unknown marketplace');
  for(const k of Object.keys(input||{})) if(!(k in spec)) throw new BadCreds('Unknown field');
  const out={};
  for(const [k,f] of Object.entries(spec)){
    const given=input?.[k];
    if(f.bool){ if(given!==undefined&&typeof given!=='boolean') throw new BadCreds(`${f.label}: yes or no`); out[k]=given===undefined?!!old?.[k]:given; continue; }
    if(given!==undefined&&typeof given!=='string') throw new BadCreds(`${f.label}: text expected`);
    let v=(given||'').trim();
    if(!v&&f.secret&&old?.[k]) v=old[k];
    if(!v){ if(f.optional) continue; throw new BadCreds(`${f.label} is required`); }
    if(v.length>f.max) throw new BadCreds(`${f.label} is too long`);
    if(/[\u0000-\u001f\u007f\s]/.test(v)) throw new BadCreds(`${f.label} must not contain spaces or line breaks`);
    out[k]=f.url?trustedUrl(v):v;
  }
  return out;
}

// Safe to send to the app: labels, non-secret values, and only "is set" for secrets.
export function view(channel,creds,updated_at=null){
  return {channel,connected:!!creds,updated_at,
    fields:Object.entries(FIELDS[channel]).map(([name,f])=>({name,label:f.label,secret:!!f.secret,optional:!!f.optional,type:f.bool?'bool':'text',
      ...(creds&&f.secret?{set:!!creds[name]}:{}),
      ...(creds&&!f.secret?{value:creds[name]??(f.bool?false:'')}:{})}))};
}
