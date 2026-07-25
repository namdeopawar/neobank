import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../store/authSlice';
import { RootState } from '../store';
import {
  HomeIcon, CardIcon, ListIcon, TransferIcon, UserIcon,
  LogoutIcon, BankIcon, ChevronLeftIcon, ChevronRightIcon, BellIcon,
} from './Icons';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', Icon: HomeIcon },
  { to: '/accounts', label: 'Accounts', Icon: CardIcon },
  { to: '/transactions', label: 'Transactions', Icon: ListIcon },
  { to: '/transfer', label: 'Transfer', Icon: TransferIcon },
  { to: '/profile', label: 'Profile', Icon: UserIcon },
];

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/accounts': 'Accounts',
  '/transactions': 'Transactions',
  '/transfer': 'Transfer Money',
  '/profile': 'Profile & Settings',
};

export default function Layout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state: RootState) => state.auth);
  const [collapsed, setCollapsed] = useState(false);

  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'NeoBank';

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-logo">
              <BankIcon size={18} />
            </div>
            {!collapsed && <span className="sidebar-brand-name">NeoBank</span>}
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRightIcon size={16} /> : <ChevronLeftIcon size={16} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              title={collapsed ? label : undefined}
            >
              <span className="nav-link-icon"><Icon size={18} /></span>
              {!collapsed && <span className="nav-link-label">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            {!collapsed && (
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{user?.firstName} {user?.lastName}</div>
                <div className="sidebar-user-role">{user?.role}</div>
              </div>
            )}
          </div>
          <button
            className="btn-logout"
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
          >
            <LogoutIcon size={16} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="topbar-title">{pageTitle}</span>
          <div className="topbar-right">
            {user?.kycVerified ? (
              <span className="badge badge-success">KYC Verified</span>
            ) : (
              <span className="badge badge-warning">KYC Pending</span>
            )}
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
              title="Notifications"
            >
              <BellIcon size={18} />
            </button>
            <div className="topbar-avatar" title={`${user?.firstName} ${user?.lastName}`}>
              {initials}
            </div>
          </div>
        </header>

        <div className="page">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
