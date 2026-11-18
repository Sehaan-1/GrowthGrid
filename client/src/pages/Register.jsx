import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import SyncDemo from '../demos/SyncDemo.tsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', clientName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        clientName: form.clientName.trim(),
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not create the account');
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__panel">
        <span className="auth__wordmark">GrowthGrid</span>
        <div className="auth__form-wrap">
          <h1 className="auth__title">Create your account</h1>
          <p className="auth__sub">Your campaigns, leads and alerts on one grid.</p>
          <form className="auth__form" onSubmit={submit}>
            {error && <div className="auth__error" role="alert">{error}</div>}
            <div className="field">
              <label htmlFor="clientName">Company</label>
              <input
                id="clientName"
                required
                value={form.clientName}
                onChange={set('clientName')}
                placeholder="Acme Media"
              />
            </div>
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" required value={form.name} onChange={set('name')} placeholder="Ava Shah" />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={set('email')}
                placeholder="you@agency.com"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={form.password}
                onChange={set('password')}
                placeholder="8+ characters"
              />
            </div>
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>
          <p className="auth__switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
      <div className="auth__stage gg-grid-ground">
        <div className="auth__stage-inner">
          <SyncDemo />
        </div>
      </div>
    </div>
  );
}
