// Tiny .env loader (no dependency, Windows-safe). Real environment variables always win; empty values are treated as "not set".
// Imported first by index.js so every other module sees the values.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
export function loadEnv(file=path.join(path.dirname(fileURLToPath(import.meta.url)),'.env')){
  let txt; try{ txt=fs.readFileSync(file,'utf8'); }catch{ return 0; } let n=0;
  for(const raw of txt.replace(/^\uFEFF/,'').split(/\r?\n/)){
    const m=/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw); if(!m) continue;
    let v=m[2]; if(/^(['"]).*\1$/.test(v)) v=v.slice(1,-1); else v=v.replace(/\s+#.*$/,'');
    if(v==='') continue; if(process.env[m[1]]===undefined){ process.env[m[1]]=v; n++; } }
  return n; }
loadEnv();
