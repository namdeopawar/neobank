import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { login, clearError } from '../store/authSlice';
import { RootState, AppDispatch } from '../store';
import toast from 'react-hot-toast';
import { BankIcon, ShieldIcon, CardIcon, TrendUpIcon } from '../components/Icons';

const FEATURES = [
  { Icon: ShieldIcon, text: 'Bank-grade 256-bit encryption on every transaction' },
  { Icon: CardIcon, text: 'Instant transfers between accounts with no hidden fees' },
  { Icon: TrendUpIcon, text: 'Earn up to 4.25% APY on savings accounts' },
];

export default function LoginPage() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { loading, error, token } = useSelector((state: RootState) => state.auth);
  const [form, setForm] = useState({ email: '', password: '' });

  useEffect(() => {
    if (token) navigate('/dashboard');
  }, [token, navigate]);

  useEffect(() => {
    if (error) { toast.error(error); dispatch(clearError()); }
  }, [error, dispatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(login(form));
    if (login.fulfilled.match(result)) {
      toast.success('Welcome back!');
      navigate('/dashboard');
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div className="auth-brand-logo">
          <div className="auth-brand-icon"><BankIcon size={22} /></div>
          <span className="auth-brand-name">NeoBank</span>
        </div>
        <h1 className="auth-brand-tagline">Banking built for the digital age</h1>
        <p className="auth-brand-subtitle">
          Open an account in minutes. Manage money intelligently. No branches required.
        </p>
        <div className="auth-feature-list">
          {FEATURES.map(({ Icon, text }) => (
            <div key={text} className="auth-feature">
              <div className="auth-feature-dot" />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-card">
          <h2 className="auth-card-title">Welcome back</h2>
          <p className="auth-card-subtitle">Sign in to your NeoBank account</p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                type="email"
                className="form-input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
              <Link to="/forgot-password" className="auth-link" style={{ fontSize: 13 }}>
                Forgot password?
              </Link>
            </div>

            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
              {loading ? <><span className="spinner" style={{ display: 'inline-block' }} /> Signing in...</> : 'Sign In'}
            </button>
          </form>

          <p className="text-sm text-muted" style={{ textAlign: 'center', marginTop: 20 }}>
            Don't have an account?{' '}
            <Link to="/register" className="auth-link">Create one free</Link>
          </p>

          <div className="auth-demo-box">
            <div className="auth-demo-title">Demo credentials</div>
            <div className="auth-demo-text">demo@neobank.com · Demo@1234!</div>
          </div>
        </div>
      </div>
    </div>
  );
}
