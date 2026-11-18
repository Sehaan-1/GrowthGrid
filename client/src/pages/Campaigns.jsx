import { useCallback, useEffect, useState } from 'react';
import { Pause, Play, RefreshCw, FlagOff } from 'lucide-react';
import api, { inr, num, PLATFORM_LABEL } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Campaigns() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState(null);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState('');

  const load = useCallback(() => {
    api
      .get('/campaigns')
      .then((res) => setCampaigns(res.data.campaigns))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const patch = async (id, body) => {
    try {
      const res = await api.patch(`/campaigns/${id}`, body);
      setCampaigns((list) => list.map((c) => (c._id === id ? { ...c, ...res.data.campaign } : c)));
    } catch (err) {
      setError(err.message);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setSyncNote('');
    try {
      const res = await api.post('/sync');
      setSyncNote(`Synced ${num(res.data.synced)} campaigns — ${num(res.data.alerts)} new alerts`);
      load();
    } catch (err) {
      setSyncNote(err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Campaigns</h1>
          <p className="page__sub">Synced from Google Ads and Meta Ads every 15 minutes</p>
        </div>
        {user?.role === 'admin' && (
          <div className="page__actions">
            <button className="btn" onClick={syncNow} disabled={syncing}>
              <RefreshCw size={14} className={syncing ? 'gg-spinning' : undefined} />
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        )}
      </div>

      {syncNote && <div className="notice" style={{ marginBottom: 14 }}>{syncNote}</div>}
      {error && <div className="notice" style={{ marginBottom: 14 }}>Can't reach the API ({error}). Start the server on :4000 and reload.</div>}

      <div className="card">
        {!campaigns ? (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <div className="skeleton" key={i} style={{ height: 20, width: `${88 - i * 9}%` }} />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="empty">
            <span className="empty__title">No campaigns</span>
            <span className="empty__text">Campaigns appear after the first ad-platform sync.</span>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Platform</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>CPL · 14d</th>
                <th>Budget use</th>
                {user?.role === 'admin' && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <CampaignRow
                  key={c._id}
                  campaign={c}
                  isAdmin={user?.role === 'admin'}
                  onToggle={() => patch(c._id, { status: c.status === 'active' ? 'paused' : 'active' })}
                  onClearFlag={() => patch(c._id, { flagged: false })}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CampaignRow({ campaign: c, isAdmin, onToggle, onClearFlag }) {
  const util = c.stats?.utilization ?? null;
  const utilPct = util != null ? Math.min(100, Math.round(util * 100)) : null;
  const utilTone = utilPct == null ? '' : utilPct >= 95 ? 'meter--danger' : utilPct >= 80 ? 'meter--warn' : '';

  return (
    <tr style={c.flagged ? { background: 'var(--gg-danger-soft)' } : undefined}>
      <td>
        <div className="strong">{c.name}</div>
        {c.client?.name && <div style={{ fontSize: 11.5, color: 'var(--gg-text-faint)', marginTop: 1 }}>{c.client.name}</div>}
      </td>
      <td>{PLATFORM_LABEL[c.platform] || c.platform}</td>
      <td>
        <span className={`badge badge--${c.flagged ? 'danger' : c.status === 'active' ? 'success' : 'neutral'}`}>
          {c.flagged ? <><span className="badge__dot" />{c.flagReason || 'Flagged'}</> : c.status === 'active' ? <><span className="badge__dot" />Active</> : 'Paused'}
        </span>
      </td>
      <td className="num" style={c.flagged ? { color: 'var(--gg-danger-text)', fontWeight: 600 } : undefined}>
        {c.stats?.cpl14 != null ? inr(c.stats.cpl14) : '—'}
      </td>
      <td className="camps__util">
        {utilPct == null ? (
          <span style={{ color: 'var(--gg-text-faint)' }}>—</span>
        ) : (
          <>
            <div className="camps__util-meta">
              <span>{utilPct}%</span>
              <span>{c.stats.utilizationLabel}</span>
            </div>
            <div className={`meter ${utilTone}`}>
              <div className="meter__fill" style={{ width: `${utilPct}%` }} />
            </div>
          </>
        )}
      </td>
      {isAdmin && (
        <td className="num">
          <button className="btn--ghost btn" onClick={onToggle} title={c.status === 'active' ? 'Pause' : 'Resume'}>
            {c.status === 'active' ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Resume</>}
          </button>
          {c.flagged && (
            <button className="btn--ghost btn" onClick={onClearFlag} title="Clear flag">
              <FlagOff size={12} /> Clear
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
