// One-time model download (build step). Usage: npm run models            -> all three
//                                             npm run models -- bg        -> just the 5 MB background-removal model
//                                             npm run models -- bg whisper llm
// After this the server never needs the network for AI. Needs ~1.4 GB disk for all three (llm is the big one).
import fs from 'node:fs'; import path from 'node:path'; import {Readable} from 'node:stream'; import {pipeline} from 'node:stream/promises';
import {DIR,CFG} from '../models.js';
const want=new Set(process.argv.slice(2).length?process.argv.slice(2):['bg','whisper','llm']);
const get=async(url,dest)=>{ if(fs.existsSync(dest)) return console.log('  have',path.relative(DIR,dest)); fs.mkdirSync(path.dirname(dest),{recursive:true});
  const r=await fetch(url,{redirect:'follow'}); if(!r.ok||!r.body) throw new Error(`${r.status} ${url}`);
  await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(dest+'.part')); fs.renameSync(dest+'.part',dest); console.log('  got ',path.relative(DIR,dest),(fs.statSync(dest).size/1e6).toFixed(1)+' MB'); };
// Hugging Face repo: all small config/tokenizer files + only the ONNX weights for the precision we load (q8 -> *_quantized, q4 -> *_q4).
const hf=async(id,onnx)=>{ console.log(id); const r=await fetch(`https://huggingface.co/api/models/${id}/tree/main?recursive=1`); if(!r.ok) throw new Error(`${r.status} listing ${id}`);
  const files=(await r.json()).filter(f=>f.type==='file').map(f=>f.path).filter(p=>/\.onnx(_data)?$/.test(p)?onnx.test(p):/\.(json|txt)$/.test(p)&&!p.startsWith('.'));
  for(const p of files) await get(`https://huggingface.co/${id}/resolve/main/${p}`,path.join(DIR,id,p)); };
try{
  if(want.has('bg')){ console.log('U2-Net background removal'); await get(`https://github.com/danielgatis/rembg/releases/download/v0.0.0/${CFG.bg}`,path.join(DIR,CFG.bg)); }
  if(want.has('whisper')) await hf(CFG.whisper,/_quantized\.onnx(_data)?$/);
  if(want.has('llm')) await hf(CFG.llm,/_q4\.onnx(_data)?$/);
  console.log('Done. Models are in',DIR);
}catch(e){ console.error('Download failed:',e.message); process.exit(1); }
