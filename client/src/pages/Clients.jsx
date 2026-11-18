import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import api, { inr, num } from '../api.js';

const AVATAR_COLORS = ['#0e7490', '#b45309', '#6d28d9', '#0f766e', '#be185d', '#4d7c0f'];

export default function Clients() {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api
      .get('/clients')
      .then((res) => live && setClients(res.data.clients))
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Clients</h1>
          <p className="page__sub">Every account, with spend and pipeline at a glance</p>
        </div>
      </div>

      {error && <div className="notice" style={{ marginBottom: 14 }}><Info size={15} /> Can't reach the API ({error}).</div>}

      {!clients ? (
        <div className="clients__grid">
          {[0, 1].map((i) => (
            <div className="card client-card" key={i}>
              <div className="skeleton" style={{ width: 140, height: 14 }} />
              <div className="skeleton" style={{ width: 90, height: 11, marginTop: 8 }} />
            </div>
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="card empty">
          <span className="empty__title">No clients yet</span>
          <span className="empty__text">Client accounts appear when their users register.</span>
        </div>
      ) : (
        <div className="clients__grid">
          {clients.map((c, i) => (
            <div className="card client-card" key={c._id}>
              <div className="client-card__head">
                <span className="client-card__avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <div className="client-card__name">{c.name}</div>
                  <div className="client-card__meta">
                    {[c.industry, c.contactEmail].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
              </div>
              <div className="client-card__stats">
                <div>
                  <div className="client-card__stat-label">Spend · 14d</div>
                  <div className="client-card__stat-value">{inr(c.stats?.spend14d)}</div>
                </div>
                <div>
                  <div className="client-card__stat-label">Leads · 14d</div>
                  <div className="client-card__stat-value">{num(c.stats?.leads14d)}</div>
                </div>
                <div>
                  <div className="client-card__stat-label">Campaigns</div>
                  <div className="client-card__stat-value">
                    {num(c.stats?.activeCampaigns)}
                    <span style={{ fontSize: 11, color: 'var(--gg-text-faint)', fontWeight: 500 }}> / {num(c.stats?.campaigns)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
