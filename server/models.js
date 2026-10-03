// Prebaked local models. No API keys, no calls to any AI service at runtime.
// Weights are downloaded ONCE at build time (`npm run models`) into server/models/ and loaded from disk afterwards.
// Every feature has a built-in fallback, so the app still works (less smartly) if a model has not been downloaded:
//   background removal  U2-Net (u2netp.onnx, Apache-2.0)        -> fallback: border-colour flood fill
//   speech-to-text      Whisper (Xenova/whisper-small, MIT)      -> fallback: labelled DEMO transcript
//   listing writer      Qwen2.5 Instruct (Apache-2.0)            -> fallback: keyword/template writer in listing.js
// LOCAL_MODELS=off disables all of them. MODELS_DIR, WHISPER_MODEL, LLM_MODEL, BG_MODEL override the defaults.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';

export const DIR=process.env.MODELS_DIR||path.join(path.dirname(fileURLToPath(import.meta.url)),'models');
export const CFG={
  bg:process.env.BG_MODEL||'u2netp.onnx',
  whisper:process.env.WHISPER_MODEL||'Xenova/whisper-small',
  llm:process.env.LLM_MODEL||'onnx-community/Qwen2.5-1.5B-Instruct'};

const cache=new Map();                                   // key -> Promise<loaded model | null>
const off=()=>process.env.LOCAL_MODELS==='off';
const ready=(key,file)=>!off()&&(cache.has(key)||fs.existsSync(path.join(DIR,file)));
export const has={ bg:()=>ready('bg',CFG.bg), whisper:()=>ready('whisper',path.join(CFG.whisper,'config.json')), llm:()=>ready('llm',path.join(CFG.llm,'config.json')) };
export const seed=(key,value)=>cache.set(key,Promise.resolve(value));   // tests inject fakes here
export const unseed=key=>cache.delete(key);

const load=(key,make)=>{ if(!cache.has(key)) cache.set(key,make().catch(e=>{ cache.delete(key); console.error('model',key,e.message); return null; })); return cache.get(key); };

let tfP; const tf=()=>tfP??=import('@huggingface/transformers').then(m=>{ m.env.allowRemoteModels=false; m.env.allowLocalModels=true; m.env.localModelPath=DIR; return m; });
export const whisperPipe=()=>load('whisper',async()=>(await tf()).pipeline('automatic-speech-recognition',CFG.whisper,{dtype:'q8'}));
export const llmPipe=()=>load('llm',async()=>(await tf()).pipeline('text-generation',CFG.llm,{dtype:'q4'}));
// Returns async (Float32Array CHW [1,3,S,S]) => Float32Array saliency map, so callers never touch onnxruntime directly.
export const bgRunner=()=>load('bg',async()=>{ const ort=await import('onnxruntime-node'); const s=await ort.InferenceSession.create(path.join(DIR,CFG.bg));
  return async(chw,S)=>{ const out=await s.run({[s.inputNames[0]]:new ort.Tensor('float32',chw,[1,3,S,S])}); return out[s.outputNames[0]].data; }; });

// One heavy inference at a time: CPU-bound models would otherwise starve each other and the API.
let tail=Promise.resolve();
export const serial=fn=>{ const run=tail.then(fn,fn); tail=run.catch(()=>{}); return run; };
