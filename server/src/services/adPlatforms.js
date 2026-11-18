// Simulated ad-platform adapters. Each campaign carries a daily "plan"
// (spend fraction, leads baseline, a seed) that acts as the ground truth of the
// Google/Meta account. fetchDailyMetrics() adds day-of-week seasonality,
// per-campaign fatigue and seeded noise so the sync engine ingests realistic,
// reproducible numbers. Swap these adapters for real Google Ads / Meta Marketing
// API clients later — the sync engine only depends on this function's shape.

export function makePlan(seed, rand = Math.random) {
  return {
    seed,
    spendFraction: 0.72 + rand() * 0.3, // share of dailyBudget the platform spends
    leadsPerDay: Math.max(1, Math.round(1 + rand() * 5)),
    fatigueRate: rand() < 0.25 ? 0.018 + rand() * 0.02 : 0, // slow daily decay for some campaigns
  };
}

const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

// Deterministic PRNG so a given (campaign, date) always reports the same day.
function seededRandom(key) {
  let s = hash(key) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export function fetchDailyMetrics({ campaign, plan, date, ageDays }) {
  const rand = seededRandom(`${plan.seed}:${date}`);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekday = [0.84, 1.02, 1.06, 1.04, 1.0, 0.93, 0.86][dow]; // Sun..Sat seasonality
  const fatigue = 1 - Math.min(0.5, ageDays * plan.fatigueRate);
  const volumeNoise = 0.78 + rand() * 0.44;

  const spend =
    campaign.status === 'active'
      ? round2(campaign.dailyBudget * plan.spendFraction * weekday * (0.88 + rand() * 0.24))
      : 0;

  let leads = 0;
  if (campaign.status === 'active') {
    leads = Math.round(plan.leadsPerDay * weekday * fatigue * volumeNoise);
    // Occasional bad day makes CPL spike — this is what the CPL automation catches.
    if (rand() < 0.05) leads = Math.max(0, leads - 2);
  }

  const impressions =
    campaign.status === 'active' ? Math.round((campaign.dailyBudget / 100) * 900 * weekday * (0.8 + rand() * 0.5)) : 0;
  const clicks =
    campaign.status === 'active' ? Math.round(impressions * (0.015 + rand() * 0.025)) : 0;

  return { date, impressions, clicks, spend, leads };
}

const round2 = (n) => Math.round(n * 100) / 100;
