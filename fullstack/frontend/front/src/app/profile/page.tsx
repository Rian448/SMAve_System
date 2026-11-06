'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setAuthToken, type User } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent text-sm disabled:bg-gray-50 disabled:text-gray-500';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';
const buttonCls = 'px-5 py-2.5 rounded-lg bg-[#011c72] hover:bg-[#022494] text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

function Message({ kind, text }: { kind: 'success' | 'error'; text: string }) {
  if (!text) return null;
  return (
    <div className={`p-3 rounded-lg text-sm border ${kind === 'success'
      ? 'bg-green-50 border-green-200 text-green-700'
      : 'bg-red-50 border-red-200 text-red-700'}`}>
      {text}
    </div>
  );
}

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading, checkAuth } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<User | null>(null);
  const [loadError, setLoadError] = useState('');

  // Profile details
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [detailsPassword, setDetailsPassword] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsMsg, setDetailsMsg] = useState<{ kind: 'success' | 'error'; text: string }>({ kind: 'success', text: '' });

  // Email change
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailStep, setEmailStep] = useState<'form' | 'code'>('form');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ kind: 'success' | 'error'; text: string }>({ kind: 'success', text: '' });

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ kind: 'success' | 'error'; text: string }>({ kind: 'success', text: '' });

  const applyProfile = (p: User) => {
    setProfile(p);
    setFullName(p.fullName || '');
    setUsername(p.username || '');
    setPhone(p.phone || '');
  };

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    api.profile.get()
      .then(res => res.data && applyProfile(res.data))
      .catch(err => setLoadError(errorText(err, 'Could not load your profile.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated]);

  const usernameChanged = !!profile && username.trim() !== profile.username;
  const detailsChanged = !!profile && (
    usernameChanged || fullName.trim() !== profile.fullName || phone.trim() !== (profile.phone || ''));

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setDetailsMsg({ kind: 'success', text: '' });
    setSavingDetails(true);
    try {
      const res = await api.profile.update({
        fullName: fullName.trim(),
        phone: phone.trim(),
        username: username.trim(),
        ...(usernameChanged ? { currentPassword: detailsPassword } : {}),
      });
      if (res.data) applyProfile(res.data);
      setDetailsPassword('');
      setDetailsMsg({ kind: 'success', text: res.message || 'Profile saved.' });
      await checkAuth(); // refresh the name shown in the sidebar
    } catch (err) {
      setDetailsMsg({ kind: 'error', text: errorText(err, 'Could not save your profile.') });
    } finally {
      setSavingDetails(false);
    }
  };

  const requestEmailCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setEmailMsg({ kind: 'success', text: '' });
    setSavingEmail(true);
    try {
      const res = await api.profile.requestEmailChange(newEmail.trim(), emailPassword);
      setEmailStep('code');
      setEmailMsg({ kind: 'success', text: res.message || 'A code has been sent.' });
    } catch (err) {
      setEmailMsg({ kind: 'error', text: errorText(err, 'Could not send the code.') });
    } finally {
      setSavingEmail(false);
    }
  };

  const confirmEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMsg({ kind: 'success', text: '' });
    setSavingEmail(true);
    try {
      const res = await api.profile.confirmEmailChange(emailCode.trim());
      if (res.data) applyProfile(res.data);
      setEmailStep('form');
      setNewEmail('');
      setEmailPassword('');
      setEmailCode('');
      setEmailMsg({ kind: 'success', text: res.message || 'Your email has been changed.' });
      await checkAuth();
    } catch (err) {
      setEmailMsg({ kind: 'error', text: errorText(err, 'Could not confirm the code.') });
    } finally {
      setSavingEmail(false);
    }
  };

  const cancelEmailChange = () => {
    setEmailStep('form');
    setEmailCode('');
    setEmailMsg({ kind: 'success', text: '' });
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg({ kind: 'success', text: '' });
    if (newPassword.length < 8) {
      setPasswordMsg({ kind: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ kind: 'error', text: 'New passwords do not match.' });
      return;
    }
    setSavingPassword(true);
    try {
      const res = await api.profile.changePassword(currentPassword, newPassword);
      // Every other session was ended, so keep this one with the fresh token
      if (res.data?.token) setAuthToken(res.data.token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({ kind: 'success', text: res.message || 'Password changed.' });
    } catch (err) {
      setPasswordMsg({ kind: 'error', text: errorText(err, 'Could not change your password.') });
    } finally {
      setSavingPassword(false);
    }
  };

  if (isLoading || (!profile && !loadError)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#011c72]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your account details and sign-in credentials
            {user?.roleName ? ` · ${user.roleName}` : ''}
          </p>
        </div>

        {loadError && <Message kind="error" text={loadError} />}

        {profile && (
          <>
            {/* Profile details */}
            <form onSubmit={saveDetails} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Profile Details</h2>
              <Message kind={detailsMsg.kind} text={detailsMsg.text} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="fullName" className={labelCls}>Full Name</label>
                  <input id="fullName" type="text" value={fullName} maxLength={255} required
                    onChange={(e) => setFullName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="phone" className={labelCls}>Phone Number</label>
                  <input id="phone" type="tel" value={phone} maxLength={20} placeholder="09171234567"
                    onChange={(e) => setPhone(e.target.value)} className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="username" className={labelCls}>Username</label>
                  <input id="username" type="text" value={username} maxLength={50} required autoComplete="username"
                    onChange={(e) => setUsername(e.target.value)} className={inputCls} />
                  <p className="text-xs text-gray-400 mt-1">You sign in with this. 3 to 50 letters, numbers, dots, dashes or underscores.</p>
                </div>
                {usernameChanged && (
                  <div className="sm:col-span-2">
                    <label htmlFor="detailsPassword" className={labelCls}>Current Password</label>
                    <input id="detailsPassword" type="password" value={detailsPassword} required autoComplete="current-password"
                      onChange={(e) => setDetailsPassword(e.target.value)} className={inputCls}
                      placeholder="Needed to change your username" />
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={savingDetails || !detailsChanged} className={buttonCls}>
                  {savingDetails ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>

            {/* Email */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Email Address</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Current: <span className="font-medium text-gray-900">{profile.email}</span>.
                  Password reset codes are sent here, so we confirm a new address with a code first.
                </p>
              </div>
              <Message kind={emailMsg.kind} text={emailMsg.text} />
              {emailStep === 'form' ? (
                <form onSubmit={requestEmailCode} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="newEmail" className={labelCls}>New Email</label>
                      <input id="newEmail" type="email" value={newEmail} required autoComplete="email"
                        onChange={(e) => setNewEmail(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="emailPassword" className={labelCls}>Current Password</label>
                      <input id="emailPassword" type="password" value={emailPassword} required autoComplete="current-password"
                        onChange={(e) => setEmailPassword(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" disabled={savingEmail || !newEmail.trim() || !emailPassword} className={buttonCls}>
                      {savingEmail ? 'Sending code…' : 'Send Verification Code'}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={confirmEmail} className="space-y-4">
                  <div className="max-w-xs">
                    <label htmlFor="emailCode" className={labelCls}>6-digit code sent to {newEmail}</label>
                    <input id="emailCode" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                      value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                      className={`${inputCls} text-center text-xl font-mono tracking-[0.4em]`} placeholder="••••••" required />
                    <p className="text-xs text-gray-400 mt-1">It expires in 10 minutes. Check your spam folder if you don&apos;t see it.</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex gap-4 text-sm">
                      <button type="button" onClick={cancelEmailChange} className="text-gray-600 hover:text-[#011c72]">
                        Cancel
                      </button>
                      <button type="button" onClick={() => requestEmailCode()} disabled={savingEmail}
                        className="text-[#011c72] font-medium disabled:text-gray-400">
                        Resend code
                      </button>
                    </div>
                    <button type="submit" disabled={savingEmail || emailCode.length !== 6} className={buttonCls}>
                      {savingEmail ? 'Confirming…' : 'Confirm New Email'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Password */}
            <form onSubmit={changePassword} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
                <p className="text-sm text-gray-500 mt-1">You will stay signed in here; other devices will be signed out.</p>
              </div>
              <Message kind={passwordMsg.kind} text={passwordMsg.text} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="currentPassword" className={labelCls}>Current Password</label>
                  <input id="currentPassword" type={showPasswords ? 'text' : 'password'} value={currentPassword} required
                    autoComplete="current-password" onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="newPassword" className={labelCls}>New Password</label>
                  <input id="newPassword" type={showPasswords ? 'text' : 'password'} value={newPassword} required
                    autoComplete="new-password" placeholder="At least 8 characters"
                    onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="confirmPassword" className={labelCls}>Confirm New Password</label>
                  <input id="confirmPassword" type={showPasswords ? 'text' : 'password'} value={confirmPassword} required
                    autoComplete="new-password" onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                  <input type="checkbox" checked={showPasswords} onChange={() => setShowPasswords(v => !v)} />
                  Show passwords
                </label>
                <button type="submit" disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className={buttonCls}>
                  {savingPassword ? 'Saving…' : 'Change Password'}
                </button>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
