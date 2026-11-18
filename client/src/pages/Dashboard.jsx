import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Gauge, Info, RefreshCw, TriangleAlert } from 'lucide-react';
import api, { dateShort, inr, inrCompactFmt, num, timeAgo } from '../api.js';
import { useAuth } from '../auth.jsx';

// Google's brand blue beside a lighter Meta blue: two blues, but values far
// enough apart that the donut's slices never read as one.
const PLATFORM_COLORS = { google: '#4285f4', meta: '#8ab6f9' };
const FEED_ICONS = { cpl_alert: TriangleAlert, budget_alert: Gauge, sync: RefreshCw, info: Info };
const FEED_TONES = { cpl_alert: 'danger', budget_alert: 'warning', sync: 'info', info: 'info' };

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api
      .get('/dashboard/overview')
      .then((res) => live && setData(res.data))
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return (
      <div className="page">
        <PageHead title="Dashboard" sub="The last 14 days across every synced platform" />
        <div className="notice">
          <Info size={15} /> Can't reach the API ({error}). Start the server on :4000 and reload.
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page">
        <PageHead title="Dashboard" sub="The last 14 days across every synced platform" />
        <div className="dash__stats">
          {[0, 1, 2, 3].map((i) => (
            <div className="stat" key={i}>
              <div className="skeleton" style={{ width: 88, height: 12 }} />
              <div className="skeleton" style={{ width: 120, height: 24, marginTop: 8 }} />
            </div>
          ))}
        </div>
        <div className="skeleton" style={{ width: '100%', height: 260, borderRadius: 12 }} />
      </div>
    );
  }

  const { stats, series, platformSplit, flagged, recentLeads, notifications } = data;
  const splitTotal = platformSplit.reduce((sum, p) => sum + p.spend, 0) || 1;

  return (
    <div className="page">
      <PageHead
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        sub="The last 14 days across every synced platform"
      />

      <div className="dash__stats">
        <Stat label="Spend · 14 days" value={inr(stats.spend14d)} foot={`${num(stats.impressions14d)} impressions`} />
        <Stat label="Leads · 14 days" value={num(stats.leads14d)} foot={`${num(stats.clicks14d)} clicks`} />
        <Stat label="Avg cost per lead" value={inr(stats.avgCpl)} foot={stats.cplDelta != null ? <Delta value={stats.cplDelta} suffix="vs prior 14 days" invert /> : 'across active campaigns'} />
        <Stat label="Active campaigns" value={num(stats.activeCampaigns)} foot={`${num(stats.flaggedCount)} flagged`} warn={stats.flaggedCount > 0} />
      </div>

      <div className="dash__grid">
        <div className="card dash__chart">
          <div className="card__head">
            <span className="card__title">Spend vs leads</span>
            <span className="card__faint">Last 14 days</span>
          </div>
          <div style={{ padding: '8px 8px 0' }}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={series} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="ggSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(26,26,24,0.06)" />
                <XAxis dataKey="date" tickFormatter={dateShort} tick={{ fontSize: 10.5, fill: '#8b8b83' }} axisLine={false} tickLine={false} dy={6} />
                <YAxis
                  yAxisId="spend"
                  tickFormatter={(v) => inrCompactFmt(v)}
                  tick={{ fontSize: 10.5, fill: '#8b8b83' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <YAxis yAxisId="leads" orientation="right" hide />
                <Tooltip content={<ChartTip />} />
                <Area yAxisId="spend" type="monotone" dataKey="spend" name="Spend" stroke="#16a34a" strokeWidth={2} fill="url(#ggSpend)" />
                <Area yAxisId="leads" type="monotone" dataKey="leads" name="Leads" stroke="#a3a39b" strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card dash__split">
          <div className="card__head">
            <span className="card__title">Spend by platform</span>
            <span className="card__faint">14 days</span>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={platformSplit} dataKey="spend" nameKey="platform" innerRadius={44} outerRadius={62} paddingAngle={3} strokeWidth={0}>
                {platformSplit.map((p) => (
                  <Cell key={p.platform} fill={PLATFORM_COLORS[p.platform] || '#a3a39b'} />
                ))}
              </Pie>
              <Tooltip content={<PieTip total={splitTotal} />} />
            </PieChart>
          </ResponsiveContainer>
          <div>
            {platformSplit.map((p) => (
              <div className="donut-row" key={p.platform}>
                <span className="donut-row__swatch" style={{ background: PLATFORM_COLORS[p.platform] || '#a3a39b' }} />
                <span className="donut-row__label">{p.platform === 'google' ? 'Google Ads' : 'Meta Ads'}</span>
                <span className="donut-row__value">{inr(p.spend)}</span>
                <span className="donut-row__pct">{Math.round((p.spend / splitTotal) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dash__row2">
        <div className="card">
          <div className="card__head">
            <span className="card__title">Recent leads</span>
            <Link to="/leads" className="card__faint">View all</Link>
          </div>
          {recentLeads.length === 0 ? (
            <div className="empty">
              <span className="empty__title">No leads yet</span>
              <span className="empty__text">Leads land here as campaigns convert.</span>
            </div>
          ) : (
            <table className="table" style={{ marginTop: 6 }}>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr key={lead._id}>
                    <td className="strong">{lead.name}</td>
                    <td>{lead.campaign?.name || '—'}</td>
                    <td><span className={`badge badge--${leadBadgeTone(lead.status)}`}>{lead.status}</span></td>
                    <td className="num">{lead.value ? inr(lead.value) : '—'}</td>
                    <td className="num" style={{ color: 'var(--gg-text-faint)', fontSize: 11.5 }}>{timeAgo(lead.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card__head">
            <span className="card__title">Alerts</span>
            <span className="card__faint">{notifications.filter((n) => !n.read).length} unread</span>
          </div>
          <div className="feed" style={{ marginTop: 6 }}>
            {flagged.map((c) => (
              <div className="feed__item" key={`flag-${c._id}`}>
                <span className="feed__icon feed__icon--danger"><TriangleAlert size={13} /></span>
                <span className="feed__body">
                  <div className="feed__title">{c.name}</div>
                  <div className="feed__text">{c.flagReason}</div>
                </span>
                <Link to="/campaigns" className="feed__time">Review</Link>
              </div>
            ))}
            {notifications.slice(0, flagged.length ? 4 : 6).map((n) => {
              const FeedIcon = FEED_ICONS[n.type] || Info;
              return (
                <div className="feed__item" key={n._id}>
                  <span className={`feed__icon feed__icon--${FEED_TONES[n.type] || 'info'}`}><FeedIcon size={13} /></span>
                  <span className="feed__body">
                    <div className="feed__title">{n.title}</div>
                    <div className="feed__text">{n.message}</div>
                  </span>
                  <span className="feed__time">{timeAgo(n.createdAt)}</span>
                </div>
              );
            })}
            {flagged.length === 0 && notifications.length === 0 && (
              <div className="empty">
                <span className="empty__title">All quiet</span>
                <span className="empty__text">Automation alerts surface here when a campaign needs attention.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PageHead({ title, sub }) {
  return (
    <div className="page__head">
      <div>
        <h1 className="page__title">{title}</h1>
        <p className="page__sub">{sub}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, foot, warn }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value" style={warn ? { color: 'var(--gg-warning-text)' } : undefined}>{value}</div>
      <div className="stat__foot">{foot}</div>
    </div>
  );
}

function Delta({ value, suffix, invert }) {
  const pct = Math.abs(value) > 1 ? value.toFixed(0) : value.toFixed(1);
  const good = invert ? value < 0 : value > 0;
  return (
    <span className={good ? 'up' : undefined}>
      {value > 0 ? '+' : ''}{pct}% {suffix}
    </span>
  );
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: 'var(--gg-text-strong)', marginBottom: 2 }}>{dateShort(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: 'var(--gg-text)' }}>
          {p.name}: <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{p.dataKey === 'spend' ? inr(p.value) : num(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function PieTip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="card" style={{ padding: '8px 12px', fontSize: 12 }}>
      <strong>{p.name === 'google' ? 'Google Ads' : 'Meta Ads'}</strong> — {inr(p.value)} ({Math.round((p.value / total) * 100)}%)
    </div>
  );
}

function leadBadgeTone(status) {
  return { new: 'info', contacted: 'warning', qualified: 'neutral', won: 'success', lost: 'neutral' }[status] || 'neutral';
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
