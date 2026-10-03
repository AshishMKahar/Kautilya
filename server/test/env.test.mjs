import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {loadEnv} from '../env.js';
test('.env loader: Windows line endings, BOM, quotes, comments, empty values, existing env wins',()=>{
  const f=path.join(os.tmpdir(),'kt-env-'+Date.now()); fs.writeFileSync(f,'\uFEFF# comment\r\nKT_A=one\r\nKT_B="two words"  \r\nexport KT_C=three # trailing\r\nKT_EMPTY=\r\nKT_KEEP=fromfile\r\n\r\nnot a line\r\n');
  process.env.KT_KEEP='fromshell'; for(const k of ['KT_A','KT_B','KT_C','KT_EMPTY']) delete process.env[k];
  assert.equal(loadEnv(f),3); assert.equal(process.env.KT_A,'one'); assert.equal(process.env.KT_B,'two words'); assert.equal(process.env.KT_C,'three');
  assert.equal(process.env.KT_EMPTY,undefined); assert.equal(process.env.KT_KEEP,'fromshell'); assert.equal(loadEnv(path.join(os.tmpdir(),'nope-'+Date.now())),0); fs.rmSync(f); });
