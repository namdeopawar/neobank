import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountApi, transactionApi } from '../services/api';
import toast from 'react-hot-toast';

type Tab = 'history' | 'deposit';

const TYPE_BADGE: Record<string, string> = {
  deposit: 'badge-success', credit: 'badge-success',
  transfer: 'badge-primary',
  withdrawal: 'badge-danger', debit: 'badge-danger',
  payment: 'badge-warning', fee: 'badge-gray',
};

export default function TransactionsPage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('history');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [filter, setFilter] = useState({ type: '', status: '' });
  const [deposit, setDeposit] = useState({ accountId: '', amount: '', description: '' });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: () => accountApi.getCustomerAccounts(user!.id),
    enabled: !!user?.id,
  });

  const { data: txnData, isLoading } = useQuery({
    queryKey: ['transactions', selectedAccount, filter],
    queryFn: () => transactionApi.getAccountTransactions(selectedAccount, filter),
    enabled: !!selectedAccount,
  });

  const depositMutation = useMutation({
    mutationFn: () => transactionApi.createTransaction({
      accountId: deposit.accountId,
      transactionType: 'deposit',
      amount: parseFloat(deposit.amount),
      currency: 'USD',
      description: deposit.description || 'Manual deposit',
      initiatedBy: user!.id,
    }),
    onSuccess: () => {
      toast.success('Deposit successful!');
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setDeposit({ accountId: '', amount: '', description: '' });
    },
    onError: () => toast.error('Deposit failed. Please try again.'),
  });

  const accounts = accountsData?.data?.accounts || [];
  const transactions = txnData?.data?.transactions || [];

  const isCredit = (type: string) => ['deposit', 'credit'].includes(type);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-header">
        <h1 className="page-title">Transactions</h1>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>
          Transaction History
        </button>
        <button className={`tab-btn${tab === 'deposit' ? ' active' : ''}`} onClick={() => setTab('deposit')}>
          Deposit Funds
        </button>
      </div>

      {tab === 'deposit' && (
        <div className="card card-pad" style={{ maxWidth: 520 }}>
          <h3 className="card-title">Deposit Funds</h3>
          <div className="form-group">
            <label className="form-label">Account</label>
            <select
              className="form-select"
              value={deposit.accountId}
              onChange={e => setDeposit({ ...deposit, accountId: e.target.value })}
            >
              <option value="">Select account</option>
              {accounts.filter((a: any) => a.status === 'active').map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.accountType.charAt(0).toUpperCase() + a.accountType.slice(1)} ••••{a.accountNumber?.slice(-4)}
                  {' — '}Balance: {a.currency} {Number(a.availableBalance || 0).toFixed(2)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Amount (USD)</label>
            <div className="input-group">
              <span className="input-group-prefix">$</span>
              <input
                type="number"
                className="form-input"
                value={deposit.amount}
                onChange={e => setDeposit({ ...deposit, amount: e.target.value })}
                placeholder="0.00"
                min="1"
                step="0.01"
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description <span className="text-muted">(optional)</span></label>
            <input
              className="form-input"
              value={deposit.description}
              onChange={e => setDeposit({ ...deposit, description: e.target.value })}
              placeholder="e.g. Paycheck, savings transfer…"
              maxLength={100}
            />
          </div>
          <button
            className="btn btn-primary btn-full"
            onClick={() => depositMutation.mutate()}
            disabled={depositMutation.isPending || !deposit.accountId || !deposit.amount}
          >
            {depositMutation.isPending ? 'Processing...' : 'Deposit Funds'}
          </button>
        </div>
      )}

      {tab === 'history' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <select
              className="form-select"
              style={{ minWidth: 200, width: 'auto' }}
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
            >
              <option value="">Select account</option>
              {accounts.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.accountType.charAt(0).toUpperCase() + a.accountType.slice(1)} ••••{a.accountNumber?.slice(-4)} ({a.currency})
                </option>
              ))}
            </select>
            <select
              className="form-select"
              style={{ minWidth: 140, width: 'auto' }}
              value={filter.type}
              onChange={e => setFilter({ ...filter, type: e.target.value })}
            >
              <option value="">All types</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="transfer">Transfer</option>
              <option value="payment">Payment</option>
            </select>
            <select
              className="form-select"
              style={{ minWidth: 140, width: 'auto' }}
              value={filter.status}
              onChange={e => setFilter({ ...filter, status: e.target.value })}
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {!selectedAccount ? (
            <div className="card">
              <div className="empty">
                <div className="empty-title">Select an account</div>
                <p className="empty-text">Choose an account above to view its transaction history</p>
              </div>
            </div>
          ) : isLoading ? (
            <div className="empty"><div className="spinner spinner-dark" /></div>
          ) : transactions.length === 0 ? (
            <div className="card">
              <div className="empty">
                <div className="empty-title">No transactions found</div>
                <p className="empty-text">Try adjusting the filters or deposit to get started</p>
              </div>
            </div>
          ) : (
            <div className="card table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn: any) => (
                    <tr key={txn.id}>
                      <td className="text-sm text-secondary">
                        {new Date(txn.createdAt).toLocaleDateString()}
                      </td>
                      <td className="font-mono text-xs text-secondary">{txn.referenceId}</td>
                      <td>{txn.description || <span className="text-muted">—</span>}</td>
                      <td>
                        <span className={`badge ${TYPE_BADGE[txn.transactionType] ?? 'badge-gray'}`}>
                          {txn.transactionType}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: isCredit(txn.transactionType) ? 'var(--success)' : 'var(--danger)' }}>
                        {isCredit(txn.transactionType) ? '+' : '-'}${Number(txn.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        <span className={`badge ${txn.status === 'completed' ? 'badge-success' : txn.status === 'failed' ? 'badge-danger' : 'badge-warning'}`}>
                          {txn.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
