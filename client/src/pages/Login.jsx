import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import SyncDemo from '../demos/SyncDemo.tsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not sign in');
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__panel">
        <span className="auth__wordmark">GrowthGrid</span>
        <div className="auth__form-wrap">
          <h1 className="auth__title">Sign in</h1>
          <p className="auth__sub">Agency growth, on one grid.</p>
          <form className="auth__form" onSubmit={submit}>
            {error && <div className="auth__error" role="alert">{error}</div>}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@agency.com"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="auth__switch">
            New agency? <Link to="/register">Create an account</Link>
          </p>
          <div className="auth__demo-note">
            <strong>Demo accounts</strong> — admin <code>admin@growthgrid.dev</code> / <code>admin123</code>,
            client <code>client@growthgrid.dev</code> / <code>client123</code>
          </div>
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
