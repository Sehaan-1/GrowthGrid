import axios from 'axios';

// One axios client for the whole app. The dev server proxies /api to the API.
const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gg_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error || err.message || 'Request failed';
    return Promise.reject(Object.assign(new Error(message), { status: err.response?.status }));
  }
);

export default api;

// ---- Formatting (INR everywhere; the agency operates in India) ----

const inrFull = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('en-IN');

export const inr = (n) => inrFull.format(Math.round(Number(n) || 0));
// en-IN's Intl compact writes thousands as "T" (₹15.5T), which nobody reads.
// Write what a dashboard reader expects: K, L, Cr.
export const inrCompactFmt = (n) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return inr(v);
};
export const num = (n) => numFmt.format(Number(n) || 0);

export const dateShort = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const timeAgo = (iso) => {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const PLATFORM_LABEL = { google: 'Google Ads', meta: 'Meta Ads' };
