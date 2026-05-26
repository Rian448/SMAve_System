'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, isAuthenticated, checkAuth } = useAuth();

  const [activeTab, setActiveTab] = useState<OrderTab>('products');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);

  // Products
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Branch filter and search for product browsing
  const [branchFilter, setBranchFilter] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Checkout modal
  const [showCheckout, setShowCheckout] = useState(false);
  const [pickupBranchId, setPickupBranchId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Auth
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerFullName, setRegisterFullName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');

  // Customer info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Appointment
  const [appointmentContactMethod, setAppointmentContactMethod] = useState<'branch_visit' | 'phone_call'>('branch_visit');
  const [appointmentBranch, setAppointmentBranch] = useState<number | ''>('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [appointmentDescription, setAppointmentDescription] = useState('');
  const [appointmentVehicleInfo, setAppointmentVehicleInfo] = useState({ make: '', model: '', year: '', plateNumber: '' });

  const availableServices = ['Flooring', 'Reupholstery', 'Ceiling', 'Sidings', 'Seat Covers', 'Other Services'];

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'appointment' || tabParam === 'products') setActiveTab(tabParam);
  }, [searchParams]);

  useEffect(() => {
    if (user) {
      setCustomerName(user.fullName || '');
      setCustomerEmail(user.email || '');
      setCustomerPhone((user as any).phone || '');
    }
  }, [user]);

  useEffect(() => {
    api.settings.getBranchesPublic().then(r => {
      if (r.status === 'success' && r.data)
        setBranches(r.data.filter(b => !b.isWarehouse && b.isActive));
    }).catch(() => {}).finally(() => setLoadingBranches(false));
  }, []);

  useEffect(() => {
    api.inventory.getPublicProducts().then(r => {
      if (r.status === 'success' && r.data) setProducts(r.data);
    }).catch(() => {}).finally(() => setLoadingProducts(false));
  }, []);

  // ── Auth handlers ─────────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true); setAuthError('');
    try {
      const r = await api.auth.login(loginUsername, loginPassword);
      if (r.data) { setAuthToken(r.data.token); await checkAuth(); }
    } catch (err: any) { setAuthError(err.message || 'Login failed.'); }
    finally { setIsAuthLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true); setAuthError('');
    try {
      const r = await api.auth.register({ username: registerUsername, password: registerPassword, email: registerEmail, fullName: registerFullName, phone: registerPhone });
      if (r.data) { setAuthToken(r.data.token); await checkAuth(); }
    } catch (err: any) { setAuthError(err.message || 'Registration failed.'); }
    finally { setIsAuthLoading(false); }
  };

  // ── Cart helpers ──────────────────────────────────────────────────────────

  const addToCart = (product: PublicProduct) => {
    setCart(prev => {
      const ex = prev.find(i => i.product.id === product.id);
      if (ex) return prev.map(i => i.product.id === product.id ? { ...i, quantity: Math.min(i.quantity + 1, product.quantity) } : i);
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateCartQuantity = (productId: number, qty: number) => {
    if (qty <= 0) setCart(prev => prev.filter(i => i.product.id !== productId));
    else setCart(prev => prev.map(i => i.product.id === productId ? { ...i, quantity: Math.min(qty, i.product.quantity) } : i));
  };

  const removeFromCart = (productId: number) => setCart(prev => prev.filter(i => i.product.id !== productId));

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.product.price * i.quantity, 0), [cart]);

  // Group cart items by source branch for the checkout modal summary
  const cartByBranch = useMemo(() => {
    const map = new Map<number, { branchName: string; items: CartItem[]; subtotal: number }>();
    for (const item of cart) {
      const bid = item.product.branchId;
      const bname = branches.find(b => b.id === bid)?.name ?? `Branch ${bid}`;
      if (!map.has(bid)) map.set(bid, { branchName: bname, items: [], subtotal: 0 });
      const entry = map.get(bid)!;
      entry.items.push(item);
      entry.subtotal += item.product.price * item.quantity;
    }
    return Array.from(map.values());
  }, [cart, branches]);

  // ── Order submit ──────────────────────────────────────────────────────────

  const handleProductOrderSubmit = async () => {
    if (!agreeTerms) { setError('Please agree to the terms and conditions'); return; }
    if (!customerName || !customerPhone) { setError('Please fill in your name and phone number'); return; }
    if (!pickupBranchId) { setError('Please select a pickup branch'); return; }
    if (cart.length === 0) { setError('Your cart is empty'); return; }

    setLoading(true); setError('');
    try {
      await api.productOrders.multiCreate({
        customerName,
        customerPhone,
        customerEmail,
        customerAddress,
        items: cart.map(i => ({ productId: i.product.id, quantity: i.quantity })),
        pickupBranchId: pickupBranchId as number,
        notes,
      });
      setSuccessMessage('Order placed successfully! You can track your order in My Orders.');
      setCart([]);
      setShowCheckout(false);
      setTimeout(() => router.push('/my-orders'), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to place order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Appointment submit ────────────────────────────────────────────────────

  const handleAppointmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreeTerms) { setError('Please agree to the terms and conditions'); return; }
    if (!appointmentBranch) { setError('Please select a branch'); return; }
    if (!appointmentDate) { setError('Please select a preferred date'); return; }
    setLoading(true); setError('');
    try {
      const vehicleInfo: VehicleInfo | undefined = appointmentVehicleInfo.make ? {
        make: appointmentVehicleInfo.make, model: appointmentVehicleInfo.model,
        year: parseInt(appointmentVehicleInfo.year) || 0, plateNumber: appointmentVehicleInfo.plateNumber
      } : undefined;
      await api.appointments.create({
        customerName, customerPhone, customerEmail,
        contactMethod: appointmentContactMethod,
        branchId: appointmentBranch as number,
        preferredDate: appointmentDate, preferredTime: appointmentTime,
        description: appointmentDescription, vehicleInfo
      });
      setSuccessMessage(appointmentContactMethod === 'branch_visit'
        ? 'Appointment request submitted! Track confirmation in My Orders.'
        : 'Call request submitted! Track confirmation in My Orders.');
      setTimeout(() => router.push('/my-orders?tab=appointments'), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit appointment.');
    } finally { setLoading(false); }
  };

  // ── Loading / auth walls ──────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Link href="/" className="text-amber-600 dark:text-amber-400 text-sm font-medium mb-4 inline-block">← Back to Home</Link>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Place Your Order</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-2">Please login or create an account to place an order and track its status.</p>
          </div>
        </div>
        <main className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex mb-6 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
              {(['login', 'register'] as const).map(mode => (
                <button key={mode} type="button" onClick={() => setAuthMode(mode)}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${authMode === mode ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400'}`}>
                  {mode === 'login' ? 'Login' : 'Register'}
                </button>
              ))}
            </div>
            {authError && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">{authError}</div>}
            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                {[['Username', 'text', loginUsername, setLoginUsername], ['Password', 'password', loginPassword, setLoginPassword]].map(([label, type, val, setter]) => (
                  <div key={label as string}>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">{label as string}</label>
                    <input type={type as string} value={val as string} onChange={e => (setter as any)(e.target.value)} required
                      className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                  </div>
                ))}
                <button type="submit" disabled={isAuthLoading} className="w-full px-4 py-3 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors">
                  {isAuthLoading ? 'Logging in...' : 'Login to Continue'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                {[['Full Name', 'text', registerFullName, setRegisterFullName], ['Email', 'email', registerEmail, setRegisterEmail], ['Phone Number', 'tel', registerPhone, setRegisterPhone], ['Username', 'text', registerUsername, setRegisterUsername], ['Password', 'password', registerPassword, setRegisterPassword]].map(([label, type, val, setter]) => (
                  <div key={label as string}>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">{label as string} *</label>
                    <input type={type as string} value={val as string} onChange={e => (setter as any)(e.target.value)} required minLength={type === 'password' ? 6 : undefined}
                      className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                  </div>
                ))}
                <button type="submit" disabled={isAuthLoading} className="w-full px-4 py-3 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors">
                  {isAuthLoading ? 'Creating Account...' : 'Create Account & Continue'}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
    );
  }

  const currentStep = successMessage ? 3 : showCheckout ? 2 : 1;

  // ── Main page ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-amber-600 dark:text-amber-400 text-sm font-medium mb-4 inline-block">← Back to Home</Link>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Place Your Order</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">Welcome back, {user?.fullName}! Shop ready-made products from any branch or request a custom order.</p>

          {/* Progress Steps (only shown on products tab) */}
          {activeTab === 'products' && (
            <div className="mt-6 flex items-center gap-0">
              {[
                { step: 1, label: 'Browse & Add to Cart' },
                { step: 2, label: 'Checkout' },
                { step: 3, label: 'Order Confirmed' },
              ].map((s, i) => (
                <div key={s.step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${currentStep >= s.step ? 'bg-amber-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                      {currentStep > s.step ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      ) : s.step}
                    </div>
                    <span className={`text-xs mt-1 font-medium hidden sm:block ${currentStep >= s.step ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`}>{s.label}</span>
                  </div>
                  {i < 2 && (
                    <div className={`h-0.5 flex-1 mx-1 transition-colors ${currentStep > s.step ? 'bg-amber-600' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-400">{successMessage}</div>
        )}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">{error}</div>
        )}

        {/* Tab bar */}
        <div className="flex mb-8 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-2">
          <button type="button" onClick={() => setActiveTab('products')}
            className={`flex-1 py-3 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'products' ? 'bg-amber-600 text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
            Shop Ready-Made Products
          </button>
          <button type="button" onClick={() => setActiveTab('appointment')}
            className={`flex-1 py-3 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'appointment' ? 'bg-amber-600 text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Custom Order Appointment
          </button>
        </div>

        {/* ── PRODUCTS TAB ── */}
        {activeTab === 'products' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: customer info + products */}
            <div className="lg:col-span-2 space-y-6">
              {/* Customer Info */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Customer Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {([['Full Name *', 'text', customerName, setCustomerName], ['Phone Number *', 'tel', customerPhone, setCustomerPhone], ['Email', 'email', customerEmail, setCustomerEmail], ['Address', 'text', customerAddress, setCustomerAddress]] as const).map(([label, type, val, setter]) => (
                    <div key={label}>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">{label}</label>
                      <input type={type} value={val} onChange={e => (setter as any)(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Products grid */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Available Products</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Browse by branch or view all — you can add items from multiple branches to your cart.</p>

                {/* Search bar */}
                <div className="relative mb-4">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input
                    type="text"
                    placeholder="Search products by name or category..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>

                {/* Branch filter */}
                {!loadingBranches && branches.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-5">
                    <button
                      type="button"
                      onClick={() => setBranchFilter(null)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${branchFilter === null ? 'bg-amber-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                    >
                      All Branches
                    </button>
                    {branches.map(branch => (
                      <button
                        key={branch.id}
                        type="button"
                        onClick={() => setBranchFilter(branch.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${branchFilter === branch.id ? 'bg-amber-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                      >
                        {branch.name}
                      </button>
                    ))}
                  </div>
                )}

                {loadingProducts ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 space-y-3">
                        <div className="flex justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse w-3/4" />
                            <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse w-1/2" />
                          </div>
                          <div className="h-6 w-16 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse ml-4" />
                        </div>
                        <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse w-2/3" />
                        <div className="h-9 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : (() => {
                  const filtered = (branchFilter === null ? products : products.filter(p => p.branchId === branchFilter))
                    .filter(p => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
                    });
                  const visible = filtered;
                  if (visible.length === 0) return (
                    <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                      {searchQuery ? `No products found for "${searchQuery}".` : branchFilter ? 'No products available at this branch.' : 'No premade products available at the moment.'}
                    </div>
                  );
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {visible.map((product) => {
                        const cartItem = cart.find(i => i.product.id === product.id);
                        const branchName = product.branchName || branches.find(b => b.id === product.branchId)?.name || `Branch ${product.branchId}`;
                        return (
                          <div key={product.id} className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
                            <div className="flex justify-between items-start mb-1">
                              <div>
                                <h3 className="font-semibold text-zinc-900 dark:text-white">{product.name}</h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">{product.category}</p>
                              </div>
                              <span className="text-lg font-bold text-amber-600 dark:text-amber-400">₱{product.price.toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">SKU: {product.sku} · Stock: {product.quantity} {product.unit}</p>
                            <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 mb-3">{branchName}</span>
                            {cartItem ? (
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => updateCartQuantity(product.id, cartItem.quantity - 1)}
                                  className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center">−</button>
                                <span className="w-8 text-center font-medium text-zinc-900 dark:text-white">{cartItem.quantity}</span>
                                <button type="button" onClick={() => updateCartQuantity(product.id, cartItem.quantity + 1)}
                                  disabled={cartItem.quantity >= product.quantity}
                                  className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors flex items-center justify-center">+</button>
                                <button type="button" onClick={() => removeFromCart(product.id)}
                                  className="ml-auto text-red-600 dark:text-red-400 text-sm hover:underline">Remove</button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => addToCart(product)} disabled={product.quantity <= 0}
                                className="w-full py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                {product.quantity <= 0 ? 'Out of Stock' : 'Add to Cart'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Right: cart sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 sticky top-6">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-4">
                  Your Cart {cart.length > 0 && <span className="text-sm font-normal text-zinc-500">({cart.length} item{cart.length !== 1 ? 's' : ''})</span>}
                </h2>
                {cart.length === 0 ? (
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm py-4">Your cart is empty. Add products from any branch above.</p>
                ) : (
                  <div className="space-y-3">
                    {cartByBranch.map(group => (
                      <div key={group.branchName}>
                        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">{group.branchName}</p>
                        {group.items.map(item => (
                          <div key={item.product.id} className="flex justify-between items-start border-b border-zinc-100 dark:border-zinc-800 pb-2 mb-1">
                            <div className="flex-1">
                              <p className="font-medium text-zinc-900 dark:text-white text-sm">{item.product.name}</p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">₱{item.product.price.toLocaleString()} × {item.quantity}</p>
                            </div>
                            <span className="font-semibold text-zinc-900 dark:text-white text-sm ml-2">₱{(item.product.price * item.quantity).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 border-t border-zinc-200 dark:border-zinc-700">
                      <span className="font-semibold text-zinc-900 dark:text-white">Total</span>
                      <span className="text-xl font-bold text-amber-600 dark:text-amber-400">₱{cartTotal.toLocaleString()}</span>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setError(''); setShowCheckout(true); }}
                  disabled={cart.length === 0}
                  className="w-full mt-5 py-3 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Checkout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── APPOINTMENT TAB ── */}
        {activeTab === 'appointment' && (
          <form onSubmit={handleAppointmentSubmit} className="max-w-2xl mx-auto space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div>
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">Custom Order Appointment</p>
                  <p className="text-sm text-blue-600 dark:text-blue-400">For custom seat covers, upholstery, or any specialized work, please book an appointment.</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Your Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Full Name *</label>
                  <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} required className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Phone Number *</label>
                  <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} required className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Email</label>
                  <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">How would you like to be contacted? *</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([['branch_visit', 'Visit a Branch', 'Come for in-person consultation'], ['phone_call', 'Phone Call', "We'll call you at your preferred time"]] as const).map(([val, title, desc]) => (
                  <label key={val} className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition-colors ${appointmentContactMethod === val ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700'}`}>
                    <input type="radio" name="contactMethod" value={val} checked={appointmentContactMethod === val} onChange={() => setAppointmentContactMethod(val)} className="mt-1 rounded-full border-zinc-300 text-amber-600 focus:ring-amber-500" />
                    <div className="ml-3">
                      <div className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-4">Select Branch *</h2>
              {loadingBranches ? <div className="py-4 text-zinc-500 dark:text-zinc-400">Loading...</div> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {branches.map(branch => (
                    <label key={branch.id} className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition-colors ${appointmentBranch === branch.id ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700'}`}>
                      <input type="radio" name="appointmentBranch" value={branch.id} checked={appointmentBranch === branch.id} onChange={() => setAppointmentBranch(branch.id)} className="mt-1 rounded-full border-zinc-300 text-amber-600 focus:ring-amber-500" />
                      <div className="ml-3">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-white">{branch.name}</div>
                        <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">{branch.address}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Preferred Schedule *</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Preferred Date *</label>
                  <input type="date" value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} min={new Date().toISOString().split('T')[0]} required className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Preferred Time</label>
                  <select value={appointmentTime} onChange={e => setAppointmentTime(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent">
                    <option value="">Any time</option>
                    <option value="morning">Morning (8AM – 12PM)</option>
                    <option value="afternoon">Afternoon (12PM – 5PM)</option>
                    <option value="evening">Evening (5PM – 8PM)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Available Services</h2>
              <ul className="space-y-2 mt-3">
                {availableServices.map(s => <li key={s} className="flex items-start gap-3"><span className="text-amber-600 dark:text-amber-400 font-bold mt-0.5">•</span><span className="text-sm text-zinc-700 dark:text-zinc-300">{s}</span></li>)}
              </ul>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Vehicle Information</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Optional — helps us prepare for your visit</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([['Make', 'make', 'Toyota'], ['Model', 'model', 'Vios'], ['Year', 'year', '2023'], ['Plate Number', 'plateNumber', 'ABC 1234']] as const).map(([label, field, placeholder]) => (
                  <div key={field}>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">{label}</label>
                    <input type={field === 'year' ? 'number' : 'text'} value={appointmentVehicleInfo[field]} onChange={e => setAppointmentVehicleInfo(p => ({ ...p, [field]: e.target.value }))} placeholder={placeholder}
                      className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-4">What do you need?</h2>
              <textarea value={appointmentDescription} onChange={e => setAppointmentDescription(e.target.value)} placeholder="Describe what kind of custom work you need..." rows={4}
                className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <input type="checkbox" id="agreeTermsAppointment" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500" />
                <label htmlFor="agreeTermsAppointment" className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">I agree to the terms and conditions. I understand this is an appointment request and will be confirmed by the staff.</label>
              </div>
            </div>

            <div className="flex gap-4">
              <Link href="/" className="flex-1 px-6 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-center">Cancel</Link>
              <button type="submit" disabled={loading} className="flex-1 px-6 py-3 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {loading ? 'Submitting...' : 'Submit Appointment Request'}
              </button>
            </div>
          </form>
        )}
      </main>

      {/* ── CHECKOUT MODAL ── */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Confirm Your Order</h2>
                <button onClick={() => setShowCheckout(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Order summary grouped by branch */}
              <div className="mb-5 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">Order Summary</h3>
                {cartByBranch.map(group => (
                  <div key={group.branchName} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800 flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase">{group.branchName}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">₱{group.subtotal.toLocaleString()}</span>
                    </div>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {group.items.map(item => (
                        <div key={item.product.id} className="px-4 py-2 flex justify-between text-sm">
                          <span className="text-zinc-800 dark:text-zinc-200">{item.product.name} × {item.quantity}</span>
                          <span className="text-zinc-600 dark:text-zinc-400">₱{(item.product.price * item.quantity).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 border-t border-zinc-200 dark:border-zinc-700 font-bold text-zinc-900 dark:text-white">
                  <span>Grand Total</span>
                  <span className="text-amber-600 text-lg">₱{cartTotal.toLocaleString()}</span>
                </div>
              </div>

              {/* Pickup branch selection */}
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide mb-3">
                  Select Pickup Branch <span className="text-red-500">*</span>
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                  All items will be consolidated at your chosen branch. Items from other branches will be shipped there.
                </p>
                {loadingBranches ? <div className="text-zinc-500 dark:text-zinc-400 text-sm">Loading branches...</div> : (
                  <div className="space-y-2">
                    {branches.map(branch => (
                      <label key={branch.id} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${pickupBranchId === branch.id ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700'}`}>
                        <input type="radio" name="pickupBranch" value={branch.id} checked={pickupBranchId === branch.id} onChange={() => setPickupBranchId(branch.id)} className="rounded-full border-zinc-300 text-amber-600 focus:ring-amber-500" />
                        <div>
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white">{branch.name}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">{branch.address}</p>
                        </div>
                        {cartByBranch.some(g => g.branchName === branch.name) && (
                          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Has items</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Additional Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special requests..." rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
              </div>

              {/* Terms */}
              <div className="mb-5 flex items-start gap-2">
                <input type="checkbox" id="agreeTermsProduct" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} className="mt-1 rounded border-zinc-300 text-amber-600 focus:ring-amber-500" />
                <label htmlFor="agreeTermsProduct" className="text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                  I agree to the terms and conditions. Deposits for unclaimed items 60 days or more are forfeited.
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button onClick={() => setShowCheckout(false)} className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                  Back
                </button>
                <button onClick={handleProductOrderSubmit} disabled={loading || !pickupBranchId}
                  className="flex-1 px-4 py-3 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {loading ? 'Placing Order...' : 'Confirm Order'}
                </button>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm flex items-start gap-2">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
