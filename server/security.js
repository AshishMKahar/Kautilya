// Security helpers: no third-party deps, all built on node:crypto.
import crypto from 'node:crypto';
export const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
export const randToken=(n=32)=>crypto.randomBytes(n).toString('base64url');
export const safeEq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b)); return x.length===y.length&&crypto.timingSafeEqual(x,y);};
export const otp=()=>String(crypto.randomInt(0,1e6)).padStart(6,'0');
// Strip control/bidi characters and collapse whitespace (names, addresses, notes).
export const clean=s=>String(s).replace(/[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim();
// Secret must be long and not a placeholder, otherwise the server refuses to start.
export function checkSecret(s){ if(!s||s.length<32) throw new Error("JWT_SECRET must be at least 32 characters. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"  or just run `npm run demo`");
  if(/change-me|anything-long|secret|password/i.test(s)) throw new Error('JWT_SECRET looks like a placeholder'); return s; }
// Image sniffing: trust bytes, never the client-declared type. SVG/HTML are rejected (script injection when served).
export function sniffImage(b64OrDataUrl,maxBytes=4*1024*1024){
  const m=/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(b64OrDataUrl); const raw=m?m[1]:b64OrDataUrl;
  if(!/^[A-Za-z0-9+/=\s]+$/.test(raw)) return null; const buf=Buffer.from(raw,'base64'); if(buf.length<32||buf.length>maxBytes) return null;
  if(buf[0]===0xFF&&buf[1]===0xD8&&buf[2]===0xFF) return {type:'image/jpeg',buf};
  if(buf.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]))) return {type:'image/png',buf};
  if(buf.subarray(0,4).toString('latin1')==='RIFF'&&buf.subarray(8,12).toString('latin1')==='WEBP') return {type:'image/webp',buf};
  return null; }
export const toDataUrl=({type,buf})=>`data:${type};base64,${buf.toString('base64')}`;
