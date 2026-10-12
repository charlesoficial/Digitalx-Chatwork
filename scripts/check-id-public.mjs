// Real anonymous HTTP probes. Uses the existing frontend publishable key only.
import fs from 'node:fs/promises';
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/).filter(line => line.includes('=') && !line.startsWith('#')).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).trim()]; }));
const base = env.VITE_SUPABASE_URL;
if (base !== 'https://mlsnyxzirlzpgkpdfmma.supabase.co') throw new Error('Unexpected project');
const headers = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
const checks = [];
for (const [rpc, body] of [['find_user_by_digitalx_id', { p_id: '100000000' }], ['get_my_digitalx_id', {}]]) {
  const response = await fetch(`${base}/rest/v1/rpc/${rpc}`, { method: 'POST', headers, body: JSON.stringify(body) });
  checks.push({ name: `Anonymous ${rpc} denied`, status: response.status, passed: [401, 403].includes(response.status) });
}
for (const table of ['digitalx_id_registry', 'digitalx_id_search_limits']) {
  const response = await fetch(`${base}/rest/v1/${table}?select=*&limit=1`, { headers });
  checks.push({ name: `Anonymous ${table} denied`, status: response.status, passed: [401, 403].includes(response.status) });
}
const report = { timestamp: new Date().toISOString(), scope: 'Anonymous HTTP only; authenticated grants/immutability/quotas tested separately in PostgreSQL', checks };
await fs.writeFile('evidence/id-public-boundary.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (checks.some(check => !check.passed)) process.exitCode = 1;
