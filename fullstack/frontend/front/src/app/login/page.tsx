'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { setAuthToken } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

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
    setAttemptsLeft(null);
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
          setAttemptsLeft(null);
        } else if (data.attemptsLeft !== undefined) {
          setAttemptsLeft(data.attemptsLeft);
        }
        setError(data.message || 'Invalid credentials');
        return;
      }

      // Success — store token and load user
      setAuthToken(data.data.token);
      await checkAuth();
      const role = data.data.user?.role;
      if (role === 'seat_maker' || role === 'sewer') {
        router.push('/worker-dashboard');
      } else {
        router.push('/dashboard');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryMessage('If the email exists, a recovery link has been sent.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#eef1fb] to-[#dde6ff] px-4">
      <div className="max-w-md w-full">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#011c72] rounded-2xl mb-4">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Seatmakers Avenue</h1>
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
                  {attemptsLeft !== null && attemptsLeft > 0 && (
                    <div className="mt-1.5 font-semibold">
                      {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before lockout.
                    </div>
                  )}
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
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={lockoutSeconds > 0}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Enter your password"
                    required
                  />
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
                    Don&apos;t have an account yet?{' '}
                    <Link href="/register" className="text-[#011c72] font-medium hover:underline">
                      Register here
                    </Link>
                  </p>
                </div>
              </div>

              <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                <div className="text-xs text-gray-600 space-y-1">
                  <p><span className="font-medium">Admin:</span> admin / admin123</p>
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

              <form onSubmit={handleRecovery} className="space-y-5">
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
                  className="w-full py-3 px-4 bg-[#011c72] hover:bg-[#01268c] text-white font-medium rounded-xl transition-colors"
                >
                  Send Recovery Link
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => {
                    setShowRecovery(false);
                    setRecoveryMessage('');
                  }}
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


