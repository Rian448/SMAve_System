'use client';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');

  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(username, password);
      router.push('/');
    } catch (err) {
      setError('Invalid username or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryMessage('If the email exists, a recovery link has been sent.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 dark:from-zinc-900 dark:to-zinc-800 px-4">
      <div className="max-w-md w-full">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-600 rounded-2xl mb-4">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Seatmakers Avenue</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">Sales & Inventory Management System</p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-xl p-8">
          {!showRecovery ? (
            <>
              <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white mb-6">Sign In</h2>
              
              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-700 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                    placeholder="Enter your username"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-700 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                    placeholder="Enter your password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

              <div className="mt-6 text-center">
                <button
                  onClick={() => setShowRecovery(true)}
                  className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 text-sm font-medium"
                >
                  Forgot your password?
                </button>
              </div>

              {/* Demo Credentials */}
              <div className="mt-6 p-4 bg-zinc-50 dark:bg-zinc-700/50 rounded-xl">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Demo Credentials:</p>
                <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                  <p><span className="font-medium">Admin:</span> admin / admin123</p>
                  <p><span className="font-medium">Supervisor:</span> supervisor / super123</p>
                  <p><span className="font-medium">Sales Manager:</span> salesmanager / sales123</p>
                  <p><span className="font-medium">Staff:</span> staff1 / staff123</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white mb-6">Account Recovery</h2>
              
              {recoveryMessage && (
                <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-green-600 dark:text-green-400 text-sm">
                  {recoveryMessage}
                </div>
              )}

              <form onSubmit={handleRecovery} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-700 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                    placeholder="Enter your email"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl transition-colors"
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
                  className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 text-sm font-medium"
                >
                  Back to Sign In
                </button>
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          © 2026 Seatmakers Avenue. All rights reserved.
        </p>
      </div>
    </div>
  );
}

