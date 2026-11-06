'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { setAuthToken } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFieldErrors, FieldError } from '@/lib/useFieldErrors';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const fe = useFieldErrors();
  const [recoveryStep, setRecoveryStep] = useState<'email' | 'code'>('email');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [notice, setNotice] = useState('');
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  const { checkAuth } = useAuth();
  const router = useRouter();

  // Countdown timer when account is locked
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const id = setInterval(() => {
      setLockoutSeconds(s => {
        if (s <= 1) { clearInterval(id); setError(''); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [lockoutSeconds]);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    setError('');
    setNotice('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.lockedOut) {
          setLockoutSeconds(data.retryAfterSeconds || 900);
        }
        setError(data.message || 'Incorrect username or password.');
        return;
      }

      // Success — store token and load user
      setAuthToken(data.data.token);
      await checkAuth();
      // The owner starts on the business summary; everyone else on the dashboard
      // (Worker Management is admin-only, so worker accounts land there too)
      router.push(data.data.user?.role === 'owner' ? '/owner' : '/dashboard');
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Resend cooldown, matching the server's one-code-per-minute limit
  useEffect(() => {
    if (resendSeconds <= 0) return;
    const id = setTimeout(() => setResendSeconds(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendSeconds]);

  const closeRecovery = () => {
    setShowRecovery(false);
    setRecoveryStep('email');
    setRecoveryMessage('');
    setRecoveryError('');
    setRecoveryCode('');
    setNewPassword('');
    setConfirmPassword('');
  };

  /** Step 1: ask the server to email a 6-digit code. */
  const requestCode = async () => {
    setRecoveryError('');
    setRecoveryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRecoveryError(data.message || 'Could not send the code. Please try again.');
        return;
      }
      setRecoveryMessage(data.message);
      setRecoveryStep('code');
      setResendSeconds(60);
    } catch {
      setRecoveryError('Connection error. Please try again.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestCode();
  };

  /** Step 2: send the code with the new password. */
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    if (fe.show({
      'reset-code': recoveryCode.length !== 6 && 'Enter the 6-digit code from the email.',
      'reset-password': newPassword.length < 8 && 'Password must be at least 8 characters.',
      'reset-confirm': newPassword.length >= 8 && newPassword !== confirmPassword && 'Passwords do not match.',
    })) return;
    setRecoveryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim(), code: recoveryCode.trim(), newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRecoveryError(data.message || 'Could not reset the password. Please try again.');
        return;
      }
      closeRecovery();
      setRecoveryEmail('');
      setError('');
      setNotice(data.message);
    } catch {
      setRecoveryError('Connection error. Please try again.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#eef1fb] to-[#dde6ff] px-4">
      <div className="max-w-md w-full">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <Link href="/" title="Go to main website" className="inline-block">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-[#011c72] rounded-2xl mb-4">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Seatmakers Avenue</h1>
          </Link>
          <p className="text-gray-600 mt-2">Sales & Inventory Management System</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {!showRecovery ? (
            <>
              <div className="mb-5">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#011c72] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to website
                </Link>
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">Sign In</h2>

              {notice && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm">
                  {notice}
                </div>
              )}

              {lockoutSeconds > 0 && (
                <div className="mb-4 p-4 bg-red-50 border border-red-300 rounded-lg">
                  <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-1">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m10-6a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Account Locked
                  </div>
                  <p className="text-sm text-red-600">Too many failed attempts. Try again in:</p>
                  <p className="text-2xl font-mono font-bold text-red-700 mt-1">{formatCountdown(lockoutSeconds)}</p>
                </div>
              )}

              {error && lockoutSeconds === 0 && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={lockoutSeconds > 0}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Enter your username"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={lockoutSeconds > 0}
                      className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || lockoutSeconds > 0}
                  className="w-full py-3 px-4 bg-[#011c72] hover:bg-[#01268c] text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>

              <div className="mt-6 text-center space-y-3">
                <button
                  onClick={() => setShowRecovery(true)}
                  className="text-[#011c72] hover:text-[#011c72] text-sm font-medium"
                >
                  Forgot your password?
                </button>
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-sm text-gray-600">
                    For Seatmakers Avenue staff only.{' '}
                    <Link href="/" className="text-[#011c72] font-medium hover:underline">
                      Back to the website
                    </Link>
                  </p>
                </div>
              </div>


            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">Account Recovery</h2>
              
              {recoveryMessage && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm">
                  {recoveryMessage}
                </div>
              )}

              {recoveryError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {recoveryError}
                </div>
              )}

              {recoveryStep === 'email' ? (
                <form onSubmit={handleRecovery} className="space-y-5">
                  <p className="text-sm text-gray-600">
                    Enter the email address on your account and we&apos;ll send you a 6-digit code to reset your password.
                  </p>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-all"
                      placeholder="Enter your email"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={recoveryLoading}
                    className="w-full py-3 px-4 bg-[#011c72] hover:bg-[#01268c] text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {recoveryLoading ? 'Sending code...' : 'Send Code'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} noValidate className="space-y-5">
                  <div {...fe.field('reset-code')}>
                    <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                      6-digit code
                    </label>
                    <input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 text-center text-2xl font-mono tracking-[0.5em] focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-all"
                      placeholder="••••••"
                      required
                    />
                    <FieldError message={fe.errors['reset-code']} />
                    <p className="mt-1 text-xs text-gray-500">
                      Sent to {recoveryEmail}. It expires in 10 minutes, so check your spam folder if you don&apos;t see it.
                    </p>
                  </div>

                  <div {...fe.field('reset-password')}>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                      New Password
                    </label>
                    <input
                      id="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-all"
                      placeholder="At least 8 characters"
                      required
                    />
                    <FieldError message={fe.errors['reset-password']} />
                  </div>

                  <div {...fe.field('reset-confirm')}>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-all"
                      placeholder="Type it again"
                      required
                    />
                    <FieldError message={fe.errors['reset-confirm']} />
                    <label className="mt-2 inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={showPassword} onChange={() => setShowPassword(v => !v)} />
                      Show passwords
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={recoveryLoading || recoveryCode.length !== 6}
                    className="w-full py-3 px-4 bg-[#011c72] hover:bg-[#01268c] text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {recoveryLoading ? 'Saving...' : 'Reset Password'}
                  </button>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => { setRecoveryStep('email'); setRecoveryMessage(''); setRecoveryError(''); setRecoveryCode(''); }}
                      className="text-gray-600 hover:text-[#011c72]"
                    >
                      Use a different email
                    </button>
                    <button
                      type="button"
                      onClick={requestCode}
                      disabled={recoveryLoading || resendSeconds > 0}
                      className="text-[#011c72] font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                    >
                      {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-6 text-center">
                <button
                  onClick={closeRecovery}
                  className="text-[#011c72] hover:text-[#011c72] text-sm font-medium"
                >
                  Back to Sign In
                </button>
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-600">
          © 2026 Seatmakers Avenue. All rights reserved.
        </p>
      </div>
    </div>
  );
}


