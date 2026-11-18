import { useCallback, useEffect, useMemo, useState } from 'react';
import { Info, Plus } from 'lucide-react';
import api, { dateShort, inr } from '../api.js';

const STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'];

export default function Leads() {
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);

  const load = useCallback((status) => {
    const q = status && status !== 'all' ? `?status=${status}` : '';
    return api
      .get(`/leads${q}`)
      .then((res) => setLeads(res.data.leads))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    setLeads(null);
    load(filter);
  }, [filter, load]);

  const updateStatus = async (id, status) => {
    const prev = leads;
    setLeads((list) => list.map((l) => (l._id === id ? { ...l, status } : l)));
    try {
      await api.patch(`/leads/${id}`, { status });
    } catch (err) {
      setLeads(prev);
      setError(err.message);
    }
  };

  const counts = useMemo(() => {
    const c = { all: leads?.length ?? 0 };
    return c;
  }, [leads]);

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Leads</h1>
          <p className="page__sub">New → contacted → qualified → won or lost</p>
        </div>
        <div className="page__actions">
          <button className="btn btn--primary" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add lead
          </button>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 14 }}>
        {['all', ...STATUSES].map((s) => (
          <button key={s} className={`chip${filter === s ? ' is-active' : ''}`} onClick={() => setFilter(s)}>
            {s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {error && <div className="notice" style={{ marginBottom: 14 }}><Info size={15} /> Can't reach the API ({error}).</div>}

      <div className="card">
        {!leads ? (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div className="skeleton" key={i} style={{ height: 20, width: `${92 - i * 7}%` }} />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="empty">
            <span className="empty__title">No leads {filter !== 'all' ? `marked ${filter}` : 'yet'}</span>
            <span className="empty__text">Add one manually, or wait for the next sync to pull conversions.</span>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Campaign</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Deal value</th>
                <th style={{ textAlign: 'right' }}>Added</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead._id}>
                  <td className="strong">{lead.name}</td>
                  <td>
                    <div>{lead.email || '—'}</div>
                    {lead.phone && <div style={{ fontSize: 11.5, color: 'var(--gg-text-faint)' }}>{lead.phone}</div>}
                  </td>
                  <td>{lead.campaign?.name || '—'}</td>
                  <td>
                    <select
                      className="status-select"
                      data-status={lead.status}
                      value={lead.status}
                      onChange={(e) => updateStatus(lead._id, e.target.value)}
                      aria-label={`Status for ${lead.name}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="num">{lead.value ? inr(lead.value) : '—'}</td>
                  <td className="num" style={{ color: 'var(--gg-text-faint)', fontSize: 11.5 }}>{dateShort(lead.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding && (
        <AddLeadModal
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            load(filter);
          }}
        />
      )}
    </div>
  );
}

function AddLeadModal({ onClose, onCreated }) {
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', campaign: '', value: '', notes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/campaigns').then((res) => setCampaigns(res.data.campaigns)).catch(() => {});
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/leads', {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        campaign: form.campaign || undefined,
        value: Number(form.value) || 0,
        notes: form.notes.trim(),
      });
      onCreated();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal__backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add lead">
        <h2 className="modal__title">Add lead</h2>
        <form className="modal__form" onSubmit={submit}>
          {error && <div className="auth__error">{error}</div>}
          <div className="field">
            <label htmlFor="lead-name">Name</label>
            <input id="lead-name" required value={form.name} onChange={set('name')} placeholder="Riya Kapoor" />
          </div>
          <div className="modal__row">
            <div className="field">
              <label htmlFor="lead-email">Email</label>
              <input id="lead-email" type="email" value={form.email} onChange={set('email')} placeholder="riya@company.com" />
            </div>
            <div className="field">
              <label htmlFor="lead-phone">Phone</label>
              <input id="lead-phone" value={form.phone} onChange={set('phone')} placeholder="+91 …" />
            </div>
          </div>
          <div className="modal__row">
            <div className="field">
              <label htmlFor="lead-campaign">Campaign</label>
              <select id="lead-campaign" value={form.campaign} onChange={set('campaign')}>
                <option value="">None</option>
                {campaigns.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="lead-value">Deal value (₹)</label>
              <input id="lead-value" type="number" min="0" value={form.value} onChange={set('value')} placeholder="50000" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="lead-notes">Notes</label>
            <textarea id="lead-notes" rows={2} value={form.notes} onChange={set('notes')} placeholder="Asked for a proposal by Friday" />
          </div>
          <div className="modal__actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Adding…' : 'Add lead'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
