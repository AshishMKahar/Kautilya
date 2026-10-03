import http from 'node:http';
export const fake=(handler)=>new Promise(res=>{const calls=[];const s=http.createServer((q,r)=>{let b='';q.on('data',d=>b+=d);q.on('end',()=>{const c={method:q.method,url:q.url,headers:q.headers,body:b};calls.push(c);const [code,out]=handler(c,calls.length);r.writeHead(code,{'content-type':'application/json'});r.end(JSON.stringify(out));});});
  s.listen(0,()=>res({url:`http://localhost:${s.address().port}`,calls,close:()=>s.close()}));});
