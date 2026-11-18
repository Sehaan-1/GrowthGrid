// End-to-end contract check: boots the real Express app against the in-memory
// model harness and verifies every response shape the React client consumes.
// Run: npm run test:api   (from server/)

process.env.PORT ||= '4123';
process.env.SEED_DEMO_DATA ||= 'true';

const BASE = `http://127.0.0.1:${process.env.PORT}/api`;

let passed = 0;
let failed = 0;

const ok = (cond, label, extra = '') => {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasKeys = (obj, keys) => isObj(obj) && keys.every((k) => k in obj);

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, data };
}

// Wait for the server (started by importing src/index.js) to accept requests.
async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('server did not start in time');
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function main() {
  await import('../../src/index.js');
  await waitForServer();
  console.log('server up — running contract checks\n');

  // ---- auth ----
  console.log('auth');
  let r = await api('/auth/me');
  ok(r.status === 401, 'GET /auth/me without token → 401');

  r = await api('/auth/login', { method: 'POST', body: { email: 'admin@growthgrid.dev', password: 'wrong' } });
  ok(r.status === 401, 'wrong password → 401');

  r = await api('/auth/login', { method: 'POST', body: { email: 'admin@growthgrid.dev', password: 'admin123' } });
  ok(r.status === 200, 'admin login → 200');
  ok(typeof r.data?.token === 'string', 'login returns token');
  ok(hasKeys(r.data?.user, ['id', 'name', 'email', 'role']), 'login user shape {id,name,email,role}');
  ok(r.data?.user?.role === 'admin', 'seeded admin has the admin role');
  const token = r.data.token;

  r = await api('/auth/login', { method: 'POST', body: { email: 'client@growthgrid.dev', password: 'client123' } });
  ok(r.status === 200 && r.data?.user?.role === 'client', 'client login → 200 with client role');
  ok(r.data?.user?.client?.name === 'Meridian Realty', 'client account is bound to Meridian Realty');
  const clientToken = r.data.token;

  r = await api('/auth/me', { token });
  ok(r.status === 200 && r.data.user.email === 'admin@growthgrid.dev', 'GET /auth/me round-trip');

  r = await api('/auth/register', {
    method: 'POST',
    body: { name: 'Test Admin', email: 'qa@acme.in', password: 'password123', clientName: 'QA Realty' },
  });
  ok(r.status === 201 && hasKeys(r.data?.user, ['id', 'name', 'email', 'role']), 'POST /auth/register → 201 + user');
  ok(r.data?.user?.client?.name === 'QA Realty', 'register attaches new client workspace');

  r = await api('/auth/register', {
    method: 'POST',
    body: { name: 'Dup', email: 'qa@acme.in', password: 'password123', clientName: 'QA Realty' },
  });
  ok(r.status === 409, 'duplicate register → 409');

  // ---- dashboard ----
  console.log('dashboard');
  r = await api('/dashboard/overview', { token });
  const o = r.data;
  ok(r.status === 200, 'GET /dashboard/overview → 200');
  ok(
    hasKeys(o?.stats, [
      'spend14d',
      'leads14d',
      'impressions14d',
      'clicks14d',
      'avgCpl',
      'cplDelta',
      'activeCampaigns',
      'flaggedCount',
    ]),
    'overview.stats keys'
  );
  ok(Array.isArray(o?.series) && o.series.length === 14, 'overview.series has 14 days');
  ok(o.series.every((d) => hasKeys(d, ['date', 'spend', 'leads'])), 'series day shape {date,spend,leads}');
  ok(
    Array.isArray(o?.platformSplit) && o.platformSplit.every((p) => hasKeys(p, ['platform', 'spend', 'leads'])),
    'platformSplit shape {platform,spend,leads}'
  );
  ok(
    Array.isArray(o?.notifications) &&
      o.notifications.length > 0 &&
      o.notifications.every((n) => hasKeys(n, ['_id', 'type', 'title', 'message', 'createdAt'])),
    'notifications shape {_id,type,title,message,createdAt}'
  );
  ok(
    Array.isArray(o?.recentLeads) &&
      o.recentLeads.length > 0 &&
      o.recentLeads.every((l) => hasKeys(l, ['_id', 'name', 'status', 'createdAt'])),
    'recentLeads populated'
  );
  ok(o.stats.spend14d > 0 && o.stats.leads14d > 0, '14-day aggregates are non-zero after seed');

  // ---- campaigns ----
  console.log('campaigns');
  r = await api('/campaigns', { token });
  ok(r.status === 200 && Array.isArray(r.data?.campaigns), 'GET /campaigns → 200');
  const campaigns = r.data.campaigns;
  ok(campaigns.length === 5, 'seed created 5 campaigns');
  ok(
    campaigns.every(
      (c) =>
        hasKeys(c, ['_id', 'name', 'platform', 'status', 'flagged', 'client', 'stats']) &&
        ['google', 'meta'].includes(c.platform) &&
        ['active', 'paused'].includes(c.status) &&
        hasKeys(c.stats, ['cpl14', 'utilization', 'utilizationLabel']) &&
        typeof c.client.name === 'string'
    ),
    'campaign rows match the client table contract'
  );
  const withCap = campaigns.find((c) => c.stats.utilization !== null);
  ok(!!withCap, 'capped campaigns report budget utilization');

  const target = campaigns[0];
  r = await api(`/campaigns/${target._id}`, { method: 'PATCH', token, body: { status: 'paused' } });
  ok(r.status === 200 && r.data.campaign.status === 'paused', 'PATCH status paused');
  r = await api(`/campaigns/${target._id}`, { method: 'PATCH', token, body: { status: 'active' } });
  ok(r.status === 200 && r.data.campaign.status === 'active', 'PATCH status active (resume)');
  r = await api(`/campaigns/${target._id}`, { method: 'PATCH', token, body: { status: 'explode' } });
  ok(r.status === 400, 'PATCH invalid status → 400');

  r = await api('/sync', { method: 'POST', token });
  ok(r.status === 200 && r.data.synced > 0 && Array.isArray(r.data.alerts), 'POST /sync → {synced, alerts}');

  const flagged = (await api('/campaigns', { token })).data.campaigns.filter((c) => c.flagged);
  ok(flagged.length > 0 && flagged.every((c) => typeof c.flagReason === 'string' && c.flagReason.length > 0), 'automation flagged over-threshold CPL campaigns');
  if (flagged.length > 0) {
    r = await api(`/campaigns/${flagged[0]._id}`, { method: 'PATCH', token, body: { flagged: false } });
    ok(r.status === 200 && r.data.campaign.flagged === false, 'PATCH flagged:false clears the flag');
  }

  // ---- leads ----
  console.log('leads');
  r = await api('/leads', { token });
  ok(r.status === 200 && Array.isArray(r.data?.leads), 'GET /leads → 200');
  ok(r.data.leads.length === 26, 'first boot seeds exactly 26 leads', `got ${r.data.leads.length}`);
  ok(
    r.data.leads.every((l) => hasKeys(l, ['_id', 'name', 'status', 'value', 'createdAt']) && l.campaign?.name && l.campaign?.platform),
    'lead rows include campaign {name, platform}'
  );
  const seededStatuses = new Set(r.data.leads.map((l) => l.status));
  ok(seededStatuses.size === 5, 'seeded leads span all five pipeline statuses');

  r = await api('/leads', {
    method: 'POST',
    token,
    body: { name: 'Walk-in Enquiry', phone: '+91 98111 22334', campaign: target._id, value: 35000, notes: 'Met at expo' },
  });
  ok(r.status === 201 && r.data.lead.status === 'new' && r.data.lead.campaign?.name, 'POST /leads creates + attributes');
  const leadId = r.data.lead._id;

  r = await api(`/leads/${leadId}`, { method: 'PATCH', token, body: { status: 'qualified' } });
  ok(r.status === 200 && r.data.lead.status === 'qualified', 'PATCH /leads/:id updates status');
  r = await api(`/leads/${leadId}`, { method: 'PATCH', token, body: { status: 'nope' } });
  ok(r.status === 400, 'PATCH invalid lead status → 400');

  // ---- clients ----
  console.log('clients');
  r = await api('/clients', { token });
  ok(r.status === 200 && Array.isArray(r.data?.clients), 'GET /clients → 200');
  const clientNames = r.data.clients.map((c) => c.name);
  ok(
    ['Meridian Realty', 'Pixel & Pour'].every((n) => clientNames.includes(n)),
    'seed created the 2 demo clients (Meridian Realty, Pixel & Pour)'
  );
  ok(
    r.data.clients.every(
      (c) =>
        hasKeys(c, ['_id', 'name', 'industry']) &&
        hasKeys(c.stats, ['spend14d', 'leads14d', 'activeCampaigns', 'campaigns'])
    ),
    'client cards carry aggregate stats'
  );

  // ---- tenancy: the client-role account only sees Meridian Realty ----
  console.log('tenancy');
  r = await api('/campaigns', { token: clientToken });
  ok(r.status === 200 && r.data.campaigns.length === 3, 'client sees only their 3 campaigns', `got ${r.data?.campaigns?.length}`);
  ok(r.data.campaigns.every((c) => c.client.name === 'Meridian Realty'), 'client campaign rows all belong to Meridian Realty');
  r = await api('/clients', { token: clientToken });
  ok(r.status === 403, 'client role is denied /clients (admin only)');
  const otherCampaign = campaigns.find((c) => c.client.name !== 'Meridian Realty');
  r = await api(`/campaigns/${otherCampaign._id}`, { method: 'PATCH', token: clientToken, body: { status: 'paused' } });
  ok(r.status === 404, "client cannot touch another tenant's campaign");
  r = await api('/leads', { token: clientToken });
  ok(r.status === 200 && r.data.leads.length > 0 && r.data.leads.length < 26, 'client sees only their own leads', `got ${r.data?.leads?.length}`);
  r = await api('/dashboard/overview', { token: clientToken });
  ok(r.status === 200 && r.data.stats.activeCampaigns === 2, 'client dashboard scoped to their 2 active campaigns');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke run crashed:', err);
  process.exit(1);
});
