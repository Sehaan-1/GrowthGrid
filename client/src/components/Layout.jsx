import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Megaphone, Users, Building2, LogOut } from 'lucide-react';
import { useAuth } from '../auth.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/clients', label: 'Clients', icon: Building2, admin: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="shell">
      <aside className="shell__side">
        <div className="shell__brand">
          <span className="shell__brand-name">GrowthGrid</span>
        </div>

        <nav className="shell__nav" aria-label="Primary">
          {NAV.filter((item) => !item.admin || user?.role === 'admin').map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `shell__nav-item${isActive ? ' is-active' : ''}`}
            >
              <item.icon size={16} strokeWidth={2} aria-hidden />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="shell__user">
          <span className="shell__avatar" aria-hidden>{(user?.name || '?').slice(0, 1).toUpperCase()}</span>
          <span className="shell__user-meta">
            <span className="shell__user-name">{user?.name}</span>
            <span className="shell__user-role">{user?.role === 'admin' ? 'Agency admin' : user?.client?.name || 'Client'}</span>
          </span>
          <button type="button" className="shell__logout" onClick={onLogout} title="Sign out" aria-label="Sign out">
            <LogOut size={15} strokeWidth={2} />
          </button>
        </div>
      </aside>

      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
