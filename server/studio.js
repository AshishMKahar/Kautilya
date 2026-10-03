// AI Image Studio. Turns a casual phone photo into a marketplace-ready product shot:
//   1. background removal   (U2-Net neural cut-out from models.js if downloaded, otherwise a built-in border-colour flood fill; no external service)
//   2. lighting correction  (grey-world white balance + contrast stretch + exposure lift, measured on the product pixels only)
//   3. e-commerce format    (square 1200x1200, pure white background, product centred at ~84%, soft ground shadow, JPEG)
// The built-in cut-out works well on plain or softly-textured backgrounds (cloth, wall, floor, table). On a busy background it detects
// that it cannot separate the product, keeps the original background and still fixes light + framing, and says so in the report.
// Requires the `sharp` package. If it is missing every function returns null and the app falls back to the original photo.
import {has,bgRunner,serial} from './models.js';
let sharpP; const getSharp=()=>sharpP??=import('sharp').then(m=>m.default).catch(()=>null);
export const hasSharp=async()=>!!(await getSharp());

const SIZE=1200, INNER=Math.round(SIZE*.84), WORK=384;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const median=a=>{const s=[...a].sort((x,y)=>x-y); return s[s.length>>1]??0;};
const pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y); return s[Math.min(s.length-1,Math.floor(s.length*p))]??0;};

// ---- 1a. built-in cut-out on a small working copy: returns {mask (WORK-sized, 0/255), w, h, fraction} or null ----
export function findForeground(rgb,w,h){
  const px=(i)=>[rgb[i*3],rgb[i*3+1],rgb[i*3+2]], ring=[];
  for(let x=0;x<w;x++) for(const y of [0,1,h-2,h-1]) ring.push(y*w+x);
  for(let y=2;y<h-2;y++) for(const x of [0,1,w-2,w-1]) ring.push(y*w+x);
  const bg=[0,1,2].map(ch=>median(ring.map(i=>rgb[i*3+ch])));
  const d=i=>{const p=px(i); return Math.hypot(p[0]-bg[0],p[1]-bg[1],p[2]-bg[2]);};
  const thr=clamp(pct(ring.map(d),.9)*1.6+16,30,75);
  const isBg=new Uint8Array(w*h), q=[]; // flood fill from the border through pixels close to the border colour
  for(const i of ring) if(!isBg[i]&&d(i)<thr){isBg[i]=1;q.push(i);}
  while(q.length){const i=q.pop(), x=i%w, y=(i/w)|0;
    for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){ if(nx<0||ny<0||nx>=w||ny>=h) continue; const j=ny*w+nx; if(!isBg[j]&&d(j)<thr){isBg[j]=1;q.push(j);} } }
  // keep only the largest connected foreground blob (drops specks and shadows that were not connected)
  const lab=new Int32Array(w*h), sizes=[0]; let n=0;
  for(let s=0;s<w*h;s++){ if(isBg[s]||lab[s]) continue; n++; sizes[n]=0; const st=[s]; lab[s]=n;
    while(st.length){const i=st.pop(); sizes[n]++; const x=i%w, y=(i/w)|0;
      for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){ if(nx<0||ny<0||nx>=w||ny>=h) continue; const j=ny*w+nx; if(!isBg[j]&&!lab[j]){lab[j]=n;st.push(j);} } } }
  if(!n) return null; let big=1; for(let k=2;k<=n;k++) if(sizes[k]>sizes[big]) big=k;
  const mask=new Uint8Array(w*h); let cnt=0; for(let i=0;i<w*h;i++) if(lab[i]===big){mask[i]=255;cnt++;}
  const fraction=cnt/(w*h); if(fraction<.06||fraction>.9) return null; // nothing found, or the "product" is basically the whole frame: not a clean cut-out
  return {mask,w,h,fraction};
}


// ---- 1b. neural cut-out (U2-Net saliency model, runs locally via onnxruntime): returns a W*H alpha buffer or null ----
const MEAN=[.485,.456,.406], STD=[.229,.224,.225], S_IN=320;
export function maskFromSaliency(sal,W,H,sharp){   // min-max normalise the saliency map -> soft 0..255 mask at W x H; null if it is empty or the whole frame
  let lo=Infinity,hi=-Infinity; for(const v of sal){ if(v<lo)lo=v; if(v>hi)hi=v; }
  const u8=Buffer.alloc(S_IN*S_IN); for(let i=0;i<u8.length;i++) u8[i]=Math.round(255*(sal[i]-lo)/Math.max(1e-6,hi-lo));
  return sharp(u8,{raw:{width:S_IN,height:S_IN,channels:1}}).resize(W,H,{fit:'fill',kernel:'cubic'}).linear(2,-128).extractChannel(0).raw().toBuffer()
    .then(m=>{ let n=0; for(let i=0;i<m.length;i++) if(m[i]>128) n++; const f=n/m.length; return (f<.03||f>.95||m.length!==W*H)?null:m; }); }
async function neuralMask(sharp,base,W,H){
  if(!has.bg()) return null; const run=await bgRunner(); if(!run) return null;
  const {data}=await base().resize(S_IN,S_IN,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let mx=1; for(let i=0;i<data.length;i++) if(data[i]>mx) mx=data[i];
  const chw=new Float32Array(3*S_IN*S_IN); for(let p=0;p<S_IN*S_IN;p++) for(let c=0;c<3;c++) chw[c*S_IN*S_IN+p]=(data[p*3+c]/mx-MEAN[c])/STD[c];
  const sal=await serial(()=>run(chw,S_IN)); return maskFromSaliency(sal,W,H,sharp); }

export async function enhancePhoto(input){
  const sharp=await getSharp(); if(!sharp) return null;
  const base=()=>sharp(input,{failOn:'none',limitInputPixels:80e6}).rotate();
  const meta=await base().metadata(); if(!meta.width||!meta.height) throw new Error('unreadable image');
  // Working copy (fit inside 1200) as raw RGB, plus the cut-out alpha at the same size
  const {data:rgb,info}=await base().resize(SIZE,SIZE,{fit:'inside',withoutEnlargement:false}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const W=info.width, H=info.height; let alpha=null, method='none';
  try{ alpha=await neuralMask(sharp,base,W,H); if(alpha) method='u2net'; }catch(e){ console.error('u2net',e.message); alpha=null; }
  if(!alpha){
    const small=await base().resize(WORK,WORK,{fit:'inside'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const fg=findForeground(small.data,small.info.width,small.info.height);
    if(fg){ // upscale + feather the mask so edges are smooth, not blocky
      const m=await sharp(Buffer.from(fg.mask),{raw:{width:fg.w,height:fg.h,channels:1}}).resize(W,H,{fit:'fill',kernel:'cubic'}).blur(2.4).linear(2.4,-208).extractChannel(0).raw().toBuffer();
      if(m.length!==W*H) throw new Error('mask size mismatch'); alpha=m; method='built-in'; } }
  // Lighting: the background is the neutral reference. A white/grey wall or cloth should be light and colourless, so any cast or darkness measured
  // there is the cast/darkness of the whole photo. (Grey-world on the product itself would wash a terracotta pot to grey.) Without a cut-out we
  // use the whole frame with much gentler limits.
  const sums=[0,0,0]; let n=0, ref=!!alpha; for(let i=0;i<W*H;i+=3){ if(ref&&alpha[i]>40) continue; sums[0]+=rgb[i*3]; sums[1]+=rgb[i*3+1]; sums[2]+=rgb[i*3+2]; n++; }
  if(ref&&n<W*H/3*.03){ ref=false; sums.fill(0); n=0; for(let i=0;i<W*H;i+=3){ sums[0]+=rgb[i*3]; sums[1]+=rgb[i*3+1]; sums[2]+=rgb[i*3+2]; n++; } }
  const mean=sums.map(s=>s/Math.max(1,n)), grey=(mean[0]+mean[1]+mean[2])/3||1, cap=ref?.12:.05;
  const wb=mean.map(m=>clamp(grey/(m||1),1-cap,1+cap));
  const exposure=ref?clamp(190/grey,.92,1.45):clamp(115/grey,.95,1.25);
  let img=sharp(rgb,{raw:{width:W,height:H,channels:3}}).linear(wb,[0,0,0]).modulate({brightness:exposure,saturation:1.06}).sharpen({sigma:.8});
  const lit=await img.raw().toBuffer();
  let out;
  if(alpha){
    // bounding box of the product, then scale it into the white square
    let x0=W,y0=H,x1=0,y1=0; for(let y=0;y<H;y++) for(let x=0;x<W;x++) if(alpha[y*W+x]>128){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
    const bw=Math.max(1,x1-x0+1), bh=Math.max(1,y1-y0+1), pad=Math.round(Math.max(bw,bh)*.02);
    const left=Math.max(0,x0-pad), top=Math.max(0,y0-pad), cw=Math.min(W-left,bw+pad*2), ch=Math.min(H-top,bh+pad*2);
    const rgba=Buffer.alloc(W*H*4); for(let i=0;i<W*H;i++){ rgba[i*4]=lit[i*3]; rgba[i*4+1]=lit[i*3+1]; rgba[i*4+2]=lit[i*3+2]; rgba[i*4+3]=alpha[i]; }
    const prod=await sharp(rgba,{raw:{width:W,height:H,channels:4}}).extract({left,top,width:cw,height:ch}).resize(INNER,INNER,{fit:'inside'}).png().toBuffer({resolveWithObject:true});
    const pw=prod.info.width, ph=prod.info.height, px=Math.round((SIZE-pw)/2), py=Math.round((SIZE-ph)/2);
    const pr=await sharp(prod.data).raw().toBuffer(); // RGBA of the resized product -> shadow layer from its alpha
    const sh=Buffer.alloc(pw*ph*4); for(let i=0;i<pw*ph;i++) sh[i*4+3]=Math.round(pr[i*4+3]*.26);
    const shadow=await sharp(sh,{raw:{width:pw,height:ph,channels:4}}).blur(16).png().toBuffer();
    out=await sharp({create:{width:SIZE,height:SIZE,channels:3,background:'#ffffff'}}).composite([{input:shadow,left:px,top:Math.min(SIZE-ph,py+18)},{input:prod.data,left:px,top:py}]).jpeg({quality:88,mozjpeg:true}).toBuffer();
  } else {
    out=await sharp(lit,{raw:{width:W,height:H,channels:3}}).resize(SIZE,SIZE,{fit:'contain',background:'#ffffff'}).jpeg({quality:88,mozjpeg:true}).toBuffer();
  }
  return {buf:out,report:{background:alpha?'removed':'kept',method,size:`${SIZE}x${SIZE}`,
    lighting:{exposure:Math.round(exposure*100)/100,whiteBalance:wb.map(x=>Math.round(x*100)/100),fixed:Math.abs(exposure-1)>.04||wb.some(x=>Math.abs(x-1)>.03)}}};
}

// ---- image analysis for pricing: how detailed / intricate is the piece? 0 (plain) .. 1 (very intricate). A proxy built from edge density. ----
export async function analyseImage(input){
  const sharp=await getSharp(); if(!sharp) return null;
  try{ const {data,info}=await sharp(input,{failOn:'none'}).rotate().resize(128,128,{fit:'inside'}).greyscale().raw().toBuffer({resolveWithObject:true});
    const w=info.width,h=info.height; let g=0,c=0; for(let y=0;y<h-1;y++) for(let x=0;x<w-1;x++){ const i=y*w+x; g+=(Math.abs(data[i]-data[i+1])+Math.abs(data[i]-data[i+w]))/2; c++; }
    const edge=g/Math.max(1,c)/255; return {intricacy:Math.round(clamp((edge-.02)/.1,0,1)*100)/100,edge:Math.round(edge*1000)/1000};
  }catch{ return null; }
}
