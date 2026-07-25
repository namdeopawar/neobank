import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { register, clearError } from '../store/authSlice';
import { RootState, AppDispatch } from '../store';
import toast from 'react-hot-toast';
import { BankIcon } from '../components/Icons';

const FEATURES = [
  { text: 'No monthly fees or minimum balance requirements' },
  { text: 'FDIC insured deposits up to $250,000' },
  { text: 'Instant account approval in under 2 minutes' },
];

export default function RegisterPage() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state: RootState) => state.auth);
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', phone: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(register(form));
    if (register.fulfilled.match(result)) {
      toast.success('Account created! Please sign in.');
      navigate('/login');
    } else {
      toast.error(error || 'Registration failed');
      dispatch(clearError());
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div className="auth-brand-logo">
          <div className="auth-brand-icon"><BankIcon size={22} /></div>
          <span className="auth-brand-name">NeoBank</span>
        </div>
        <h1 className="auth-brand-tagline">Your account, your money, your rules</h1>
        <p className="auth-brand-subtitle">
          Join over 2 million customers who trust NeoBank for everyday banking.
        </p>
        <div className="auth-feature-list">
          {FEATURES.map(({ text }) => (
            <div key={text} className="auth-feature">
              <div className="auth-feature-dot" />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-card">
          <h2 className="auth-card-title">Open your account</h2>
          <p className="auth-card-subtitle">Free to join — takes less than 2 minutes</p>

          <form onSubmit={handleSubmit}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">First name</label>
                <input
                  className="form-input"
                  value={form.firstName}
                  onChange={e => setForm({ ...form, firstName: e.target.value })}
                  required
                  placeholder="John"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Last name</label>
                <input
                  className="form-input"
                  value={form.lastName}
                  onChange={e => setForm({ ...form, lastName: e.target.value })}
                  required
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                type="email"
                className="form-input"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
                placeholder="you@example.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                Phone <span className="text-muted">(optional)</span>
              </label>
              <input
                type="tel"
                className="form-input"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 555 000 0000"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
                placeholder="Min 8 chars, 1 uppercase, 1 symbol"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-sm text-muted" style={{ textAlign: 'center', marginTop: 20 }}>
            Already have an account?{' '}
            <Link to="/login" className="auth-link">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
