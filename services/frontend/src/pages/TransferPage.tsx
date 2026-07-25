import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { useQuery, useMutation } from '@tanstack/react-query';
import { accountApi, transactionApi } from '../services/api';
import toast from 'react-hot-toast';
import { CheckIcon } from '../components/Icons';

type Step = 'form' | 'confirm' | 'success';

export default function TransferPage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [form, setForm] = useState({ fromAccountId: '', toAccountId: '', amount: '', description: '' });
  const [step, setStep] = useState<Step>('form');
  const [result, setResult] = useState<any>(null);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: () => accountApi.getCustomerAccounts(user!.id),
    enabled: !!user?.id,
  });

  const accounts = accountsData?.data?.accounts || [];

  const fromAccount = accounts.find((a: any) => a.id === form.fromAccountId);
  const insufficient = form.amount && fromAccount && parseFloat(form.amount) > (fromAccount.availableBalance || 0);

  const transferMutation = useMutation({
    mutationFn: () => transactionApi.transfer({
      fromAccountId: form.fromAccountId,
      toAccountId: form.toAccountId,
      amount: parseFloat(form.amount),
      description: form.description,
    }),
    onSuccess: (data) => {
      setResult(data.data);
      setStep('success');
      toast.success('Transfer successful!');
    },
    onError: () => toast.error('Transfer failed. Please try again.'),
  });

  if (step === 'success') {
    return (
      <div style={{ maxWidth: 520, margin: '48px auto' }}>
        <div className="card card-pad" style={{ textAlign: 'center', padding: '48px 40px' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckIcon size={28} strokeWidth={2.5} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>Transfer Complete</h2>
          <p className="text-sm text-muted font-mono" style={{ marginBottom: 16 }}>Ref: {result?.reference}</p>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, marginBottom: 28 }}>
            ${parseFloat(form.amount).toFixed(2)}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={() => { setStep('form'); setForm({ fromAccountId: '', toAccountId: '', amount: '', description: '' }); }}
            >
              New Transfer
            </button>
            <Link to="/transactions" className="btn btn-secondary">View History</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="steps mb-6">
        <div className={`step${step === 'form' ? ' active' : step === 'confirm' || step === 'success' ? ' done' : ''}`}>
          <div className="step-num">1</div>
          <span>Details</span>
        </div>
        <div className="step-connector" />
        <div className={`step${step === 'confirm' ? ' active' : ''}`}>
          <div className="step-num">2</div>
          <span>Confirm</span>
        </div>
      </div>

      <div className="card card-pad">
        {step === 'form' && (
          <>
            <div className="form-group">
              <label className="form-label">From account</label>
              <select
                className="form-select"
                value={form.fromAccountId}
                onChange={e => setForm({ ...form, fromAccountId: e.target.value })}
              >
                <option value="">Select source account</option>
                {accounts.filter((a: any) => a.status === 'active').map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.accountType.charAt(0).toUpperCase() + a.accountType.slice(1)} ••••{a.accountNumber?.slice(-4)}
                    {' — '}Balance: {a.currency} {Number(a.availableBalance || 0).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">To account</label>
              <select
                className="form-select"
                value={form.toAccountId}
                onChange={e => setForm({ ...form, toAccountId: e.target.value })}
              >
                <option value="">Select destination account</option>
                {accounts.filter((a: any) => a.id !== form.fromAccountId && a.status === 'active').map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.accountType.charAt(0).toUpperCase() + a.accountType.slice(1)} ••••{a.accountNumber?.slice(-4)}
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
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  min="0.01"
                  step="0.01"
                  style={{ fontSize: 18, fontWeight: 700 }}
                />
              </div>
              {insufficient && (
                <p className="text-sm" style={{ color: 'var(--danger)', marginTop: 6 }}>
                  Insufficient balance. Available: ${(fromAccount?.availableBalance || 0).toFixed(2)}
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Note <span className="text-muted">(optional)</span></label>
              <input
                className="form-input"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="What is this transfer for?"
                maxLength={100}
              />
            </div>

            <div className="notice-box info" style={{ marginBottom: 16 }}>
              <p className="notice-box-text">Transfer fee: 0.1% of amount (minimum $0.01)</p>
            </div>

            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={() => setStep('confirm')}
              disabled={!form.fromAccountId || !form.toAccountId || !form.amount || !!insufficient}
            >
              Review Transfer
            </button>
          </>
        )}

        {step === 'confirm' && (
          <>
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 20 }}>Confirm your transfer</h3>
            <div className="info-row">
              <span className="info-row-label">Amount</span>
              <span className="info-row-value font-700">${parseFloat(form.amount).toFixed(2)}</span>
            </div>
            <div className="info-row">
              <span className="info-row-label">Fee (0.1%)</span>
              <span className="info-row-value">${(parseFloat(form.amount) * 0.001).toFixed(2)}</span>
            </div>
            <div className="info-row">
              <span className="info-row-label">Total deducted</span>
              <span className="info-row-value font-700" style={{ color: 'var(--danger)' }}>
                ${(parseFloat(form.amount) * 1.001).toFixed(2)}
              </span>
            </div>
            {form.description && (
              <div className="info-row">
                <span className="info-row-label">Note</span>
                <span className="info-row-value">{form.description}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button className="btn btn-secondary" onClick={() => setStep('form')}>Edit</button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => transferMutation.mutate()}
                disabled={transferMutation.isPending}
              >
                {transferMutation.isPending ? 'Processing...' : 'Confirm Transfer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
