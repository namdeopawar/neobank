import React from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { useQuery } from '@tanstack/react-query';
import { accountApi } from '../services/api';
import { CardIcon, TrendUpIcon, TransferIcon, DepositIcon, ListIcon, PlusIcon, ShieldIcon } from '../components/Icons';

export default function DashboardPage() {
  const { user } = useSelector((state: RootState) => state.auth);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: () => accountApi.getCustomerAccounts(user!.id),
    enabled: !!user?.id,
  });

  const accounts = accountsData?.data?.accounts || [];
  const totalBalance = accounts.reduce((sum: number, a: any) => sum + (a.availableBalance || 0), 0);
  const activeCount = accounts.filter((a: any) => a.status === 'active').length;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Good morning, {user?.firstName}</h1>
          <p className="page-subtitle">{today}</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-label">Total Balance</div>
            <div className="stat-icon-wrap blue"><CardIcon size={18} /></div>
          </div>
          <div className="stat-value">
            ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-label">Active Accounts</div>
            <div className="stat-icon-wrap green"><PlusIcon size={18} /></div>
          </div>
          <div className="stat-value">{activeCount}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-label">Pending</div>
            <div className="stat-icon-wrap amber"><ListIcon size={18} /></div>
          </div>
          <div className="stat-value">0</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-label">Savings APY</div>
            <div className="stat-icon-wrap purple"><TrendUpIcon size={18} /></div>
          </div>
          <div className="stat-value">4.25%</div>
        </div>
      </div>

      <div className="grid-2 mb-6">
        <div className="card card-pad">
          <h3 className="card-title">Your Accounts</h3>
          {accounts.length === 0 ? (
            <div className="empty" style={{ padding: '24px 0' }}>
              <p className="empty-text">No accounts yet.</p>
              <Link to="/accounts" className="btn btn-primary btn-sm mt-3">Open an account</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {accounts.map((account: any) => (
                <div key={account.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border-light)' }}>
                  <div>
                    <div className="font-600" style={{ fontSize: 14, marginBottom: 2 }}>
                      {account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1)}
                    </div>
                    <div className="text-xs text-muted font-mono">
                      •••• {account.accountNumber?.slice(-4)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="font-700" style={{ fontSize: 15 }}>
                      ${(account.availableBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <span className={`badge ${account.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {account.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card-pad">
          <h3 className="card-title">Quick Actions</h3>
          <div className="grid-2" style={{ gap: 10 }}>
            {[
              { label: 'Transfer', Icon: TransferIcon, to: '/transfer', color: 'var(--primary)' },
              { label: 'Deposit', Icon: DepositIcon, to: '/transactions', color: 'var(--success)' },
              { label: 'History', Icon: ListIcon, to: '/transactions', color: 'var(--warning)' },
              { label: 'New Account', Icon: PlusIcon, to: '/accounts', color: 'var(--purple)' },
            ].map(({ label, Icon, to, color }) => (
              <Link
                key={label}
                to={to}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '20px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', textDecoration: 'none', color: 'var(--text-primary)', transition: 'border-color 0.15s, background 0.15s' }}
              >
                <div style={{ color, background: color + '15', width: 40, height: 40, borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1, lineHeight: 1 }}><ShieldIcon size={20} /></span>
          <p style={{ fontSize: 13, color: '#854d0e', lineHeight: 1.6 }}>
            <strong>Security reminder:</strong> NeoBank will <strong>never</strong> ask for your password, PIN, or OTP via email or phone. Report suspicious activity at <strong>1-800-NEOBANK</strong> or <strong>security@neobank.com</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
