// Encrypts each artisan's marketplace credentials at rest (AES-256-GCM).
// - Key: CRED_KEY (recommended, 32+ chars) or, if unset, derived from JWT_SECRET. Rotating that value makes saved keys unreadable (users re-enter them).
// - The ciphertext is bound to "<uid>|<channel>" (AAD), so a row copied to another user or marketplace will not decrypt.
// - Only the sealed text is stored. Decrypted values never leave the server: the API returns status and non-secret fields only.
import crypto from 'node:crypto';

const key=()=>{
  const raw=process.env.CRED_KEY||process.env.JWT_SECRET||'';
  if(raw.length<32) throw new Error('CRED_KEY or JWT_SECRET (32+ characters) is required to store marketplace keys');
  return Buffer.from(crypto.hkdfSync('sha256',Buffer.from(raw),Buffer.from('kautilya-vault-v1'),Buffer.from('marketplace-credentials'),32));
};
const b64=b=>Buffer.from(b).toString('base64url'), un=s=>Buffer.from(s,'base64url');

export function seal(text,aad){
  const iv=crypto.randomBytes(12), c=crypto.createCipheriv('aes-256-gcm',key(),iv); c.setAAD(Buffer.from(aad));
  const enc=Buffer.concat([c.update(text,'utf8'),c.final()]);
  return ['v1',b64(iv),b64(c.getAuthTag()),b64(enc)].join('.');
}
export function open(sealed,aad){            // returns the text, or null if tampered / wrong key / wrong owner
  try{
    const [v,iv,tag,enc]=String(sealed).split('.'); if(v!=='v1'||!iv||!tag||!enc) return null;
    const d=crypto.createDecipheriv('aes-256-gcm',key(),un(iv)); d.setAAD(Buffer.from(aad)); d.setAuthTag(un(tag));
    return Buffer.concat([d.update(un(enc)),d.final()]).toString('utf8');
  }catch{ return null; }
}
export const sealCreds=(obj,uid,channel)=>seal(JSON.stringify(obj),`${uid}|${channel}`);
export const openCreds=(sealed,uid,channel)=>{ const t=open(sealed,`${uid}|${channel}`); if(!t) return null; try{ return JSON.parse(t); }catch{ return null; } };
