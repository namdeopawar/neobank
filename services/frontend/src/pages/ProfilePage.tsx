import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { KeyIcon, PhoneIcon, LockIcon, LogoutIcon } from '../components/Icons';

const SECURITY_ITEMS = [
  { Icon: KeyIcon, label: 'Change Password', desc: 'Update your account password' },
  { Icon: PhoneIcon, label: 'Two-Factor Authentication', desc: 'Add an extra layer of security' },
  { Icon: LockIcon, label: 'Manage Sessions', desc: 'View and revoke active sessions' },
  { Icon: LogoutIcon, label: 'Logout All Devices', desc: 'Sign out everywhere', danger: true },
];

export default function ProfilePage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <h1 className="page-title">Profile & Settings</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary), var(--purple))',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 700, margin: '0 auto 16px',
          }}>
            {initials}
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
            {user?.firstName} {user?.lastName}
          </h2>
          <p className="text-sm text-muted" style={{ marginBottom: 16 }}>{user?.email}</p>
          <div>
            {user?.kycVerified ? (
              <span className="badge badge-success">KYC Verified</span>
            ) : (
              <span className="badge badge-warning">KYC Pending</span>
            )}
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="card-title">Account Information</h3>
          <div className="info-row">
            <span className="info-row-label">User ID</span>
            <span className="info-row-value font-mono text-xs">{user?.id}</span>
          </div>
          <div className="info-row">
            <span className="info-row-label">Email</span>
            <span className="info-row-value">{user?.email}</span>
          </div>
          <div className="info-row">
            <span className="info-row-label">Role</span>
            <span className="info-row-value" style={{ textTransform: 'capitalize' }}>{user?.role}</span>
          </div>
          <div className="info-row">
            <span className="info-row-label">KYC Status</span>
            <span className="info-row-value">
              {user?.kycVerified
                ? <span className="badge badge-success">Verified</span>
                : <span className="badge badge-warning">Pending verification</span>
              }
            </span>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="card-title">Security</h3>
        <div className="grid-2" style={{ gap: 12 }}>
          {SECURITY_ITEMS.map(({ Icon, label, desc, danger }) => (
            <button
              key={label}
              className={`btn ${danger ? 'btn-danger' : 'btn-secondary'}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '16px 18px', height: 'auto', textAlign: 'left', width: '100%' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
                <Icon size={16} />
                {label}
              </div>
              <span className="text-xs" style={{ color: danger ? 'inherit' : 'var(--text-muted)', opacity: 0.8 }}>{desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
