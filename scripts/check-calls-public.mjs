// Anonymous HTTP only: no real session token, certificate or media key is accessed.
import fs from 'node:fs/promises';
const env=Object.fromEntries((await fs.readFile('.env.local','utf8')).split(/\r?\n/).filter(line=>line.includes('=')&&!line.startsWith('#')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).trim()];}));
const base=env.VITE_SUPABASE_URL;
if(base!=='https://mlsnyxzirlzpgkpdfmma.supabase.co')throw new Error('Unexpected project');
const headers={apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},checks=[];
for(const [name,body] of [
  ['get_secure_audio_call',{p_id:null}],
  ['start_secure_audio_call',{p_conversation:'25ef928b-45ed-4960-8b85-4759108f91b1',p_offer:{}}],
  ['update_secure_audio_call',{p_id:'93000000-0000-4000-8000-000000000001',p_action:'end'}],
]){
  const r=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body)});
  checks.push({name:`Anonymous ${name} denied`,status:r.status,passed:[401,403].includes(r.status)});
}
const r=await fetch(`${base}/rest/v1/secure_audio_calls?select=id&limit=1`,{headers});
checks.push({name:'Anonymous signaling table denied',status:r.status,passed:[401,403].includes(r.status)});
const report={timestamp:new Date().toISOString(),scope:'Anonymous HTTP only; authenticated role/claim negatives are SQL rollback tests.',checks};
await fs.writeFile('evidence/calls-public-boundary.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(checks.some(c=>!c.passed))process.exitCode=1;
