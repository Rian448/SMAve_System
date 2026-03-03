'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, setAuthToken, PublicProduct, VehicleInfo } from '@/lib/api';
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

interface CartItem {
  product: PublicProduct;
  quantity: number;
}

type OrderTab = 'products' | 'appointment';

export default function PlaceOrderPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated, checkAuth } = useAuth();
  
  const [activeTab, setActiveTab] = useState<OrderTab>('products');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);

  // Products state
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);

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

  // Branch Selection for product orders
  const [selectedBranch, setSelectedBranch] = useState<number | ''>('');

  // Appointment form state
  const [appointmentContactMethod, setAppointmentContactMethod] = useState<'branch_visit' | 'phone_call'>('branch_visit');
  const [appointmentBranch, setAppointmentBranch] = useState<number | ''>('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [appointmentDescription, setAppointmentDescription] = useState('');
  const [appointmentVehicleInfo, setAppointmentVehicleInfo] = useState({
    make: '',
    model: '',
    year: '',
    plateNumber: ''
  });

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
          const activeBranches = response.data.filter(b => !b.isWarehouse && b.isActive);
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

  // Load products on mount
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await api.inventory.getPublicProducts();
        if (response.status === 'success' && response.data) {
          setProducts(response.data);
        }
      } catch (err) {
        console.error('Failed to load products:', err);
      } finally {
        setLoadingProducts(false);
      }
    };
    loadProducts();
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

  // Cart functions
  const addToCart = (product: PublicProduct) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, product.quantity) }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateCartQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.product.id !== productId));
    } else {
      setCart(prev =>
        prev.map(item =>
          item.product.id === productId
            ? { ...item, quantity: Math.min(quantity, item.product.quantity) }
            : item
        )
      );
    }
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  // Submit product order
  const handleProductOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!agreeTerms) {
      setError('Please agree to the terms and conditions');
      return;
    }

    if (!selectedBranch) {
      setError('Please select a branch for pickup');
      return;
    }

    if (cart.length === 0) {
      setError('Please add at least one product to your cart');
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
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity
        })),
        branchId: selectedBranch as number,
        notes
      };

      await api.productOrders.create(orderData);
      setSuccessMessage('Order placed successfully! You can track your order status in My Orders.');
      setCart([]);
      
      setTimeout(() => {
        router.push('/my-orders');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to place order. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Submit appointment
  const handleAppointmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!agreeTerms) {
      setError('Please agree to the terms and conditions');
      return;
    }

    if (appointmentContactMethod === 'branch_visit' && !appointmentBranch) {
      setError('Please select a branch for your visit');
      return;
    }

    if (!appointmentDate) {
      setError('Please select a preferred date');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const vehicleInfo: VehicleInfo | undefined = appointmentVehicleInfo.make ? {
        make: appointmentVehicleInfo.make,
        model: appointmentVehicleInfo.model,
        year: parseInt(appointmentVehicleInfo.year) || 0,
        plateNumber: appointmentVehicleInfo.plateNumber
      } : undefined;

      const appointmentData = {
        customerName,
        customerPhone,
        customerEmail,
        contactMethod: appointmentContactMethod,
        branchId: appointmentContactMethod === 'branch_visit' ? appointmentBranch as number : undefined,
        preferredDate: appointmentDate,
        preferredTime: appointmentTime,
        description: appointmentDescription,
        vehicleInfo
      };

      await api.appointments.create(appointmentData);
      setSuccessMessage(
        appointmentContactMethod === 'branch_visit'
          ? 'Appointment request submitted! We will confirm your appointment shortly.'
          : 'Call request submitted! We will call you at your preferred date and time.'
      );
      
      setTimeout(() => {
        router.push('/my-orders');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit appointment. Please try again.');
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-amber-600 dark:text-amber-400 text-sm font-medium mb-4 inline-block">
            ← Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Place Your Order</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Welcome back, {user?.fullName}! Choose from our ready-made products or request a custom order.
          </p>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        {/* Tab Selection */}
        <div className="flex mb-8 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-2">
          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`flex-1 py-3 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'products'
                ? 'bg-amber-600 text-white'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            Shop Ready-Made Products
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('appointment')}
            className={`flex-1 py-3 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'appointment'
                ? 'bg-amber-600 text-white'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Custom Order Appointment
          </button>
        </div>

        {/* Products Tab Content */}
        {activeTab === 'products' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Products List */}
            <div className="lg:col-span-2 space-y-6">
              {/* Customer Info */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Customer Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                    />
                  </div>
                </div>
              </div>

              {/* Branch Selection */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Select Pickup Branch *</h2>
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
                          onChange={() => setSelectedBranch(branch.id)}
                          className="mt-1 rounded-full border-zinc-300 text-amber-600 focus:ring-amber-500"
                        />
                        <div className="ml-3 flex-1">
                          <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                            {branch.name}
                          </div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                            {branch.address}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Products Grid */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Available Products</h2>
                {loadingProducts ? (
                  <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                    Loading products...
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                    No products available at the moment
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {products.map((product) => {
                      const cartItem = cart.find(item => item.product.id === product.id);
                      return (
                        <div
                          key={product.id}
                          className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 hover:border-amber-300 dark:hover:border-amber-700 transition-colors"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="font-semibold text-zinc-900 dark:text-white">{product.name}</h3>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">{product.category}</p>
                            </div>
                            <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                              ₱{product.price.toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                            SKU: {product.sku} | Stock: {product.quantity} {product.unit}
                          </p>
                          {cartItem ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => updateCartQuantity(product.id, cartItem.quantity - 1)}
                                className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center"
                              >
                                -
                              </button>
                              <span className="w-8 text-center font-medium text-zinc-900 dark:text-white">
                                {cartItem.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateCartQuantity(product.id, cartItem.quantity + 1)}
                                disabled={cartItem.quantity >= product.quantity}
                                className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors flex items-center justify-center"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFromCart(product.id)}
                                className="ml-auto text-red-600 dark:text-red-400 text-sm hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => addToCart(product)}
                              disabled={product.quantity <= 0}
                              className="w-full py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Add to Cart
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Cart Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 sticky top-6">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-4">Your Cart</h2>
                
                {cart.length === 0 ? (
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm py-4">Your cart is empty</p>
                ) : (
                  <div className="space-y-4">
                    {cart.map((item) => (
                      <div key={item.product.id} className="flex justify-between items-start border-b border-zinc-100 dark:border-zinc-800 pb-3">
                        <div className="flex-1">
                          <p className="font-medium text-zinc-900 dark:text-white text-sm">{item.product.name}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            ₱{item.product.price.toLocaleString()} × {item.quantity}
                          </p>
                        </div>
                        <span className="font-semibold text-zinc-900 dark:text-white">
                          ₱{(item.product.price * item.quantity).toLocaleString()}
                        </span>
                      </div>
                    ))}
                    
                    <div className="flex justify-between items-center pt-2 border-t border-zinc-200 dark:border-zinc-700">
                      <span className="font-semibold text-zinc-900 dark:text-white">Total:</span>
                      <span className="text-xl font-bold text-amber-600 dark:text-amber-400">
                        ₱{cartTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="mt-6">
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Additional Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any special requests..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>

                {/* Terms */}
                <div className="mt-4 flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="agreeTermsProduct"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <label htmlFor="agreeTermsProduct" className="text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                    I agree to the terms and conditions. Deposit for unclaimed items 60 days or more are forfeited.
                  </label>
                </div>

                {/* Submit */}
                <button
                  type="button"
                  onClick={handleProductOrderSubmit}
                  disabled={loading || cart.length === 0}
                  className="w-full mt-4 py-3 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Placing Order...' : 'Place Order'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Appointment Tab Content */}
        {activeTab === 'appointment' && (
          <form onSubmit={handleAppointmentSubmit} className="max-w-2xl mx-auto space-y-6">
            {/* Info Box */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">Custom Order Appointment</p>
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    For custom seat covers, upholstery, or any specialized work, please book an appointment. 
                    You can visit a branch for consultation or request a phone call.
                  </p>
                </div>
              </div>
            </div>

            {/* Customer Info */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Your Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Contact Method */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">How would you like to be contacted? *</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label
                  className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    appointmentContactMethod === 'branch_visit'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="contactMethod"
                    value="branch_visit"
                    checked={appointmentContactMethod === 'branch_visit'}
                    onChange={() => setAppointmentContactMethod('branch_visit')}
                    className="mt-1 rounded-full border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-3">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      Visit a Branch
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                      Come to one of our branches for in-person consultation
                    </p>
                  </div>
                </label>
                <label
                  className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    appointmentContactMethod === 'phone_call'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="contactMethod"
                    value="phone_call"
                    checked={appointmentContactMethod === 'phone_call'}
                    onChange={() => setAppointmentContactMethod('phone_call')}
                    className="mt-1 rounded-full border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="ml-3">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Phone Call
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                      We&apos;ll call you at your preferred time
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Branch Selection (only for branch_visit) */}
            {appointmentContactMethod === 'branch_visit' && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Select Branch to Visit *</h2>
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
                          appointmentBranch === branch.id
                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                            : 'border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="appointmentBranch"
                          value={branch.id}
                          checked={appointmentBranch === branch.id}
                          onChange={() => setAppointmentBranch(branch.id)}
                          className="mt-1 rounded-full border-zinc-300 text-amber-600 focus:ring-amber-500"
                        />
                        <div className="ml-3 flex-1">
                          <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                            {branch.name}
                          </div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                            {branch.address}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Schedule */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Preferred Schedule *</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Preferred Date *
                  </label>
                  <input
                    type="date"
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    required
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Preferred Time
                  </label>
                  <select
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  >
                    <option value="">Any time</option>
                    <option value="morning">Morning (8AM - 12PM)</option>
                    <option value="afternoon">Afternoon (12PM - 5PM)</option>
                    <option value="evening">Evening (5PM - 8PM)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Vehicle Info (Optional) */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Vehicle Information</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Optional - helps us prepare for your visit</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Make
                  </label>
                  <input
                    type="text"
                    value={appointmentVehicleInfo.make}
                    onChange={(e) => setAppointmentVehicleInfo({ ...appointmentVehicleInfo, make: e.target.value })}
                    placeholder="Toyota"
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Model
                  </label>
                  <input
                    type="text"
                    value={appointmentVehicleInfo.model}
                    onChange={(e) => setAppointmentVehicleInfo({ ...appointmentVehicleInfo, model: e.target.value })}
                    placeholder="Vios"
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Year
                  </label>
                  <input
                    type="number"
                    value={appointmentVehicleInfo.year}
                    onChange={(e) => setAppointmentVehicleInfo({ ...appointmentVehicleInfo, year: e.target.value })}
                    placeholder="2023"
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Plate Number
                  </label>
                  <input
                    type="text"
                    value={appointmentVehicleInfo.plateNumber}
                    onChange={(e) => setAppointmentVehicleInfo({ ...appointmentVehicleInfo, plateNumber: e.target.value })}
                    placeholder="ABC 1234"
                    className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">What do you need?</h2>
              <textarea
                value={appointmentDescription}
                onChange={(e) => setAppointmentDescription(e.target.value)}
                placeholder="Describe what kind of custom work you need (e.g., custom seat covers, reupholstery, specific design, etc.)..."
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            {/* Terms */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="agreeTermsAppointment"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="agreeTermsAppointment" className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  I agree to the terms and conditions. I understand this is an appointment request and will be confirmed by the staff.
                </label>
              </div>
            </div>

            {/* Submit */}
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
                {loading ? 'Submitting...' : 'Submit Appointment Request'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
