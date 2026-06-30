'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function RegisterPage() {
  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await api.auth.register({
        username: form.username,
        password: form.password,
        email: form.email,
        fullName: form.fullName,
        phone: form.phone,
      });
      router.push('/login');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#eef1fb] to-[#dde6ff] px-4 py-10">
      <div className="max-w-md w-full">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#011c72] rounded-2xl mb-4">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Seatmakers Avenue</h1>
          <p className="text-gray-600 mt-2">Create your customer account</p>
        </div>

        {/* Register Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="mb-5">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#011c72] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Sign In
            </Link>
          </div>

          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Create Account</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                value={form.fullName}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-all"
                placeholder="Enter your full name"
                required
              />
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                value={form.username}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-all"
                placeholder="Choose a username"
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-all"
                placeholder="Enter your email"
                required
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-all"
                placeholder="Enter your phone number"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-all"
                placeholder="Create a password"
                required
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent transition-all"
                placeholder="Confirm your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-[#011c72] hover:bg-[#01268c] text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating account...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link href="/login" className="text-[#011c72] font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-gray-600">
          © 2026 Seatmakers Avenue. All rights reserved.
        </p>
      </div>
    </div>
  );
}
