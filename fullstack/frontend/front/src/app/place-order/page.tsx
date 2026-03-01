'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, setAuthToken } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface Branch {
  id: number;
  name: string;
  code: string;
  address: string;
  isWarehouse: boolean;
  isActive: boolean;
}

export default function PlaceOrderPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated, checkAuth } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);

  // Auth mode state
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Login/Register form
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerFullName, setRegisterFullName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');

  // Customer Info (pre-filled for logged-in users)
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Branch Selection
  const [selectedBranch, setSelectedBranch] = useState<number | ''>('');

  // Vehicle Info
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');

  // Services
  const [flooring, setFlooring] = useState({ selected: false, material: '' });
  const [reupholstery, setReupholstery] = useState({ selected: false, material: '' });
  const [ceiling, setCeiling] = useState({ selected: false, material: '' });
  const [sidings, setSidings] = useState({ selected: false, material: '' });
  const [seatCovers, setSeatCovers] = useState({
    selected: false,
    design: '',
    material: '',
    pocket: '',
    others: ''
  });
  const [otherServices, setOtherServices] = useState({ selected: false, description: '' });

  const [notes, setNotes] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Pre-fill customer info when user is logged in
  useEffect(() => {
    if (user) {
      setCustomerName(user.fullName || '');
      setCustomerEmail(user.email || '');
      setCustomerPhone(user.phone || '');
    }
  }, [user]);

  // Load branches on mount
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const response = await api.settings.getBranchesPublic();
        if (response.status === 'success' && response.data) {
          const activeBranches = response.data.filter(b => !b.isWarehouse);
          setBranches(activeBranches);
        }
      } catch (err) {
        console.error('Failed to load branches:', err);
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError('');

    try {
      const response = await api.auth.login(loginUsername, loginPassword);
      if (response.data) {
        setAuthToken(response.data.token);
        await checkAuth();
      }
    } catch (err: any) {
      setAuthError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError('');

    try {
      const response = await api.auth.register({
        username: registerUsername,
        password: registerPassword,
        email: registerEmail,
        fullName: registerFullName,
        phone: registerPhone
      });
      if (response.data) {
        setAuthToken(response.data.token);
        await checkAuth();
      }
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!agreeTerms) {
      setError('Please agree to the terms and conditions');
      return;
    }

    if (!selectedBranch) {
      setError('Please select a branch');
      return;
    }

    const selectedServices = [];
    if (flooring.selected) selectedServices.push({ type: 'flooring', material: flooring.material });
    if (reupholstery.selected) selectedServices.push({ type: 'reupholstery', material: reupholstery.material });
    if (ceiling.selected) selectedServices.push({ type: 'ceiling', material: ceiling.material });
    if (sidings.selected) selectedServices.push({ type: 'sidings', material: sidings.material });
    if (seatCovers.selected) selectedServices.push({
      type: 'seat_covers',
      design: seatCovers.design,
      material: seatCovers.material,
      pocket: seatCovers.pocket,
      others: seatCovers.others
    });
    if (otherServices.selected) selectedServices.push({
      type: 'other',
      description: otherServices.description
    });

    if (selectedServices.length === 0) {
      setError('Please select at least one service');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const orderData = {
        customerName,
        customerPhone,
        customerEmail,
        customerAddress,
        vehicleInfo: {
          make: vehicleMake,
          model: vehicleModel,
          year: vehicleYear,
          plateNumber: vehiclePlate
        },
        services: selectedServices,
        notes,
        orderDate: new Date().toISOString(),
        branchId: selectedBranch as number
      };

      await api.customerOrders.placeOrder(orderData);
      setSuccessMessage('Order placed successfully! You can track your order status in My Orders.');
      
      setTimeout(() => {
        router.push('/my-orders');
      }, 2000);
    } catch (err) {
      setError('Failed to place order. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Show login/register form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Link href="/" className="text-amber-600 dark:text-amber-400 text-sm font-medium mb-4 inline-block">
              ← Back to Home
            </Link>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Place Your Order</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-2">
              Please login or create an account to place an order and track its status.
            </p>
          </div>
        </div>

        <main className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            {/* Auth Mode Toggle */}
            <div className="flex mb-6 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  authMode === 'login'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  authMode === 'register'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Register
              </button>
            </div>

            {authError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                {authError}
              </div>
            )}

            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    required
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Enter your username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Enter your password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full px-4 py-3 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {isAuthLoading ? 'Logging in...' : 'Login to Continue'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={registerFullName}
                    onChange={(e) => setRegisterFullName(e.target.value)}
                    required
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    required
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="your@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={registerPhone}
                    onChange={(e) => setRegisterPhone(e.target.value)}
                    required
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="09XX XXX XXXX"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Username *
                  </label>
                  <input
                    type="text"
                    value={registerUsername}
                    onChange={(e) => setRegisterUsername(e.target.value)}
                    required
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Choose a username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Choose a password (min 6 characters)"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full px-4 py-3 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {isAuthLoading ? 'Creating Account...' : 'Create Account & Continue'}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-amber-600 dark:text-amber-400 text-sm font-medium mb-4 inline-block">
            ← Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Place Your Order</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Welcome back, {user?.fullName}! Select the services you need and we&apos;ll send you a quotation.
          </p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-400">
            {successMessage}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Customer Information */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Customer Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="09XX XXX XXXX"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="123 Main Street"
                />
              </div>
            </div>
          </div>

          {/* Branch Selection */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Select Branch *</h2>
            {loadingBranches ? (
              <div className="text-center py-4 text-zinc-500 dark:text-zinc-400">
                Loading branches...
              </div>
            ) : branches.length === 0 ? (
              <div className="text-center py-4 text-zinc-500 dark:text-zinc-400">
                No branches available
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {branches.map((branch) => (
                  <label
                    key={branch.id}
                    className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedBranch === branch.id
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="branch"
                      value={branch.id}
                      checked={selectedBranch === branch.id}
                      onChange={(e) => setSelectedBranch(parseInt(e.target.value))}
                      className="mt-1 rounded-full border-zinc-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div className="ml-3 flex-1">
                      <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                        {branch.name}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                        {branch.address}
                      </div>
                      <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Code: {branch.code}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Vehicle Information */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Vehicle Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Make *
                </label>
                <input
                  type="text"
                  value={vehicleMake}
                  onChange={(e) => setVehicleMake(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Toyota"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Model *
                </label>
                <input
                  type="text"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Vios"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Year *
                </label>
                <input
                  type="number"
                  value={vehicleYear}
                  onChange={(e) => setVehicleYear(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="2023"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Plate Number
                </label>
                <input
                  type="text"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="ABC 1234"
                />
              </div>
            </div>
          </div>

          {/* Services Selection */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Services *</h2>
            <div className="space-y-6">
              {/* Flooring */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="flooring"
                    checked={flooring.selected}
                    onChange={(e) => setFlooring({ ...flooring, selected: e.target.checked })}
                    className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-4 flex-1">
                    <label htmlFor="flooring" className="text-sm font-medium text-zinc-900 dark:text-white cursor-pointer">
                      Flooring
                    </label>
                    <ul className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 space-y-1">
                      <li>• Auto Standard carpet material</li>
                      <li>• All sides trim</li>
                      <li>• With rebonded foam underlay</li>
                    </ul>
                    {flooring.selected && (
                      <input
                        type="text"
                        value={flooring.material}
                        onChange={(e) => setFlooring({ ...flooring, material: e.target.value })}
                        placeholder="Specify material"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Reupholstery */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="reupholstery"
                    checked={reupholstery.selected}
                    onChange={(e) => setReupholstery({ ...reupholstery, selected: e.target.checked })}
                    className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-4 flex-1">
                    <label htmlFor="reupholstery" className="text-sm font-medium text-zinc-900 dark:text-white cursor-pointer">
                      Reupholstery
                    </label>
                    <ul className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 space-y-1">
                      <li>• Auto Standard material</li>
                      <li>• To rebuild sag foam with Class A Uratex foam</li>
                      <li>• Includes spring & frame repair</li>
                    </ul>
                    {reupholstery.selected && (
                      <input
                        type="text"
                        value={reupholstery.material}
                        onChange={(e) => setReupholstery({ ...reupholstery, material: e.target.value })}
                        placeholder="Specify material"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Ceiling */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="ceiling"
                    checked={ceiling.selected}
                    onChange={(e) => setCeiling({ ...ceiling, selected: e.target.checked })}
                    className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-4 flex-1">
                    <label htmlFor="ceiling" className="text-sm font-medium text-zinc-900 dark:text-white cursor-pointer">
                      Ceiling
                    </label>
                    <ul className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 space-y-1">
                      <li>• Auto Standard ceiling material</li>
                      <li>• With heat insulation</li>
                      <li>• Includes all post and sunvisor</li>
                    </ul>
                    {ceiling.selected && (
                      <input
                        type="text"
                        value={ceiling.material}
                        onChange={(e) => setCeiling({ ...ceiling, material: e.target.value })}
                        placeholder="Specify material"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Sidings */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="sidings"
                    checked={sidings.selected}
                    onChange={(e) => setSidings({ ...sidings, selected: e.target.checked })}
                    className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-4 flex-1">
                    <label htmlFor="sidings" className="text-sm font-medium text-zinc-900 dark:text-white cursor-pointer">
                      Sidings
                    </label>
                    <ul className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 space-y-1">
                      <li>• Electric pressed design</li>
                      <li>• With 1/8 plyboard base</li>
                      <li>• Note: SIDINGS clips are not included (₱5.00 each)</li>
                    </ul>
                    {sidings.selected && (
                      <input
                        type="text"
                        value={sidings.material}
                        onChange={(e) => setSidings({ ...sidings, material: e.target.value })}
                        placeholder="Specify material"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Seat Covers */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="seatCovers"
                    checked={seatCovers.selected}
                    onChange={(e) => setSeatCovers({ ...seatCovers, selected: e.target.checked })}
                    className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-4 flex-1">
                    <label htmlFor="seatCovers" className="text-sm font-medium text-zinc-900 dark:text-white cursor-pointer">
                      Seat Covers
                    </label>
                    {seatCovers.selected && (
                      <div className="mt-3 space-y-3">
                        <input
                          type="text"
                          value={seatCovers.design}
                          onChange={(e) => setSeatCovers({ ...seatCovers, design: e.target.value })}
                          placeholder="Design"
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={seatCovers.material}
                          onChange={(e) => setSeatCovers({ ...seatCovers, material: e.target.value })}
                          placeholder="Material"
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={seatCovers.pocket}
                          onChange={(e) => setSeatCovers({ ...seatCovers, pocket: e.target.value })}
                          placeholder="Pocket"
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={seatCovers.others}
                          onChange={(e) => setSeatCovers({ ...seatCovers, others: e.target.value })}
                          placeholder="Others"
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Other Services */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="otherServices"
                    checked={otherServices.selected}
                    onChange={(e) => setOtherServices({ ...otherServices, selected: e.target.checked })}
                    className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-4 flex-1">
                    <label htmlFor="otherServices" className="text-sm font-medium text-zinc-900 dark:text-white cursor-pointer">
                      Other Services
                    </label>
                    {otherServices.selected && (
                      <input
                        type="text"
                        value={otherServices.description}
                        onChange={(e) => setOtherServices({ ...otherServices, description: e.target.value })}
                        placeholder="Describe your service needs"
                        className="mt-3 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Notes */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Additional Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional information or special requests..."
              rows={4}
              className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">How it works:</p>
                <ol className="text-sm text-blue-600 dark:text-blue-400 space-y-1 list-decimal list-inside">
                  <li>Submit your order request with the services you need</li>
                  <li>Our team will review your request and prepare a quotation</li>
                  <li>You&apos;ll receive the quotation in your &quot;My Orders&quot; page</li>
                  <li>Accept or request changes to the quotation</li>
                  <li>Once accepted, we&apos;ll begin working on your order</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Terms and Conditions */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="agreeTerms"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
              />
              <div className="flex-1">
                <label htmlFor="agreeTerms" className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  I agree to the terms and conditions. <span className="font-medium">Deposit for unclaimed items 60 days or more are forfeited in favor of the company.</span>
                </label>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex gap-4">
            <Link
              href="/"
              className="flex-1 px-6 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-center"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Placing Order...' : 'Submit Order Request'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
