// Anonymous HTTP boundary; only the existing frontend publishable key is used.
import fs from 'node:fs/promises';
const env = Object.fromEntries((await fs.readFile('.env.local','utf8')).split(/\r?\n/).filter(line=>line.includes('=')&&!line.startsWith('#')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).trim()];}));
const base=env.VITE_SUPABASE_URL;
if(base!=='https://mlsnyxzirlzpgkpdfmma.supabase.co') throw new Error('Unexpected project');
const headers={apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'};
const checks=[];
for(const [rpc,body] of [['get_onboarding_profile',{}],['complete_profile_onboarding',{p_name:'Anonymous',p_bio:''}]]){
 const response=await fetch(`${base}/rest/v1/rpc/${rpc}`,{method:'POST',headers,body:JSON.stringify(body)});
 checks.push({name:`Anonymous ${rpc} denied`,status:response.status,passed:[401,403].includes(response.status)});
}
const listing=await fetch(`${base}/storage/v1/object/list/avatars`,{method:'POST',headers,body:JSON.stringify({prefix:'',limit:100})});
const body=await listing.json();
checks.push({name:'Anonymous avatars listing reveals no objects',status:listing.status,passed:[401,403].includes(listing.status)||(listing.ok&&Array.isArray(body)&&body.length===0)});
const path=(await fs.readFile('evidence/onboarding-avatar-probe-path.txt','utf8')).trim();
if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|png|jpg)$/.test(path)) throw new Error('Invalid observed avatar path');
const publicPhoto=await fetch(`${base}/storage/v1/object/public/avatars/${path}`,{headers});
checks.push({name:'Uploaded real avatar unavailable through public URL',status:publicPhoto.status,passed:!publicPhoto.ok});
const download=await fetch(`${base}/storage/v1/object/authenticated/avatars/${path}`,{headers});
checks.push({name:'Anonymous real avatar download denied',status:download.status,passed:!download.ok});
const report={timestamp:new Date().toISOString(),scope:'Anonymous HTTP only; authenticated access tested with SQL roles and real browser sessions',checks};
await fs.writeFile('evidence/onboarding-public-boundary.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(checks.some(c=>!c.passed)) process.exitCode=1;
