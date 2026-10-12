// Public configuration and anonymous access checks. No login or fake sessions.
import fs from 'node:fs/promises';
const env = Object.fromEntries((await fs.readFile('.env.local', 'utf8')).split(/\r?\n/).filter(line => line.includes('=') && !line.startsWith('#')).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).trim()]; }));
const base = env.VITE_SUPABASE_URL;
if (base !== 'https://mlsnyxzirlzpgkpdfmma.supabase.co') throw new Error('Unexpected project');
const headers = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY };
const checks = [];
const settings = await fetch(`${base}/auth/v1/settings`, { headers });
checks.push({ name: 'Google provider enabled', passed: settings.ok && (await settings.json()).external?.google === true, status: settings.status });
const authorize = new URL(`${base}/auth/v1/authorize`);
for (const [name, value] of Object.entries({ provider: 'google', redirect_to: 'http://localhost:5173/auth/callback', code_challenge: 'a'.repeat(43), code_challenge_method: 's256' })) authorize.searchParams.set(name, value);
const redirect = await fetch(authorize, { headers, redirect: 'manual' });
const google = redirect.headers.get('location') ? new URL(redirect.headers.get('location')) : null;
checks.push({ name: 'OAuth destination and client', passed: redirect.status === 302 && google?.hostname === 'accounts.google.com' && google.searchParams.get('client_id') === '405998075356-pt0h6mhum75oltk728q5gd7elu3vefmt.apps.googleusercontent.com', status: redirect.status });
checks.push({ name: 'Exact Supabase callback', passed: google?.searchParams.get('redirect_uri') === `${base}/auth/v1/callback` });
for (const table of ['profiles', 'messages', 'attachments']) {
  const response = await fetch(`${base}/rest/v1/${table}?select=id&limit=1`, { headers });
  checks.push({ name: `Anonymous ${table} read denied`, passed: [401, 403].includes(response.status), status: response.status });
}
const report = { timestamp: new Date().toISOString(), scope: 'Live public configuration and anonymous REST reads only; no Google login or authenticated-member evidence', checks };
await fs.mkdir('evidence', { recursive: true });
await fs.writeFile('evidence/public-boundary.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (checks.some(check => !check.passed)) process.exitCode = 1;
