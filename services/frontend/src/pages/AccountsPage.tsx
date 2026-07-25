import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountApi } from '../services/api';
import toast from 'react-hot-toast';
import { PlusIcon, CardIcon } from '../components/Icons';

export default function AccountsPage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const queryClient = useQueryClient();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newAccount, setNewAccount] = useState({ accountType: 'checking', currency: 'USD' });

  const { data, isLoading } = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: () => accountApi.getCustomerAccounts(user!.id),
    enabled: !!user?.id,
  });

  const createMutation = useMutation({
    mutationFn: () => accountApi.createAccount({ customerId: user!.id, ...newAccount }),
    onSuccess: () => {
      toast.success('Account opened successfully!');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setShowNewForm(false);
    },
    onError: () => toast.error('Failed to open account'),
  });

  const accounts = data?.data?.accounts || [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Accounts</h1>
          <p className="page-subtitle">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNewForm(!showNewForm)}>
          <PlusIcon size={16} />
          Open New Account
        </button>
      </div>

      {showNewForm && (
        <div className="card card-pad mb-6">
          <h3 className="card-title">Open a New Account</h3>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Account type</label>
              <select
                className="form-select"
                value={newAccount.accountType}
                onChange={e => setNewAccount({ ...newAccount, accountType: e.target.value })}
              >
                <option value="checking">Checking Account</option>
                <option value="savings">Savings Account (4.25% APY)</option>
                <option value="loan">Loan Account</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Currency</label>
              <select
                className="form-select"
                value={newAccount.currency}
                onChange={e => setNewAccount({ ...newAccount, currency: e.target.value })}
              >
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="INR">INR — Indian Rupee</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setShowNewForm(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Opening...' : 'Open Account'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="empty">
          <div className="spinner spinner-dark" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon"><CardIcon size={48} /></div>
            <div className="empty-title">No accounts yet</div>
            <p className="empty-text">Open your first account to get started</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {accounts.map((account: any) => (
            <div key={account.id} className="acct-card">
              <div className="acct-card-top">
                <span className="acct-card-type">{account.accountType} account</span>
                <div className="acct-chip" />
              </div>
              <div className="acct-card-number">
                •••• •••• •••• {account.accountNumber?.slice(-4)}
              </div>
              <div className="acct-card-bottom">
                <div>
                  <div className="acct-card-balance-label">Available Balance</div>
                  <div className="acct-card-balance">
                    {account.currency} {(account.availableBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="acct-card-meta">
                  {account.interestRate > 0 && (
                    <div className="acct-card-apy">{(account.interestRate * 100).toFixed(2)}% APY</div>
                  )}
                  <div style={{ marginTop: 6 }}>
                    <span className={`badge ${account.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {account.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {accounts.length > 0 && (
        <div className="card card-pad mt-4">
          <h3 className="card-title">Account Details</h3>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Number</th>
                <th>Routing</th>
                <th>Opened</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account: any) => (
                <tr key={account.id}>
                  <td className="font-600">{account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1)}</td>
                  <td className="font-mono text-sm">{account.accountNumber}</td>
                  <td className="font-mono text-sm">{account.routingNumber || '021000021'}</td>
                  <td className="text-sm text-secondary">{new Date(account.openedAt).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge ${account.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {account.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
