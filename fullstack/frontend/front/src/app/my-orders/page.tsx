'use client';
import { formatDate, formatDateTime } from '@/lib/dateUtils';
import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, Appointment, CustomerOrder, ProductOrder, CartDraft, ApiError } from '@/lib/api';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

type OrderTab = 'custom' | 'premade' | 'appointments';

export default function MyOrdersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 pt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 rounded"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    }>
      <MyOrdersContent />
    </Suspense>
  );
}

function MyOrdersContent() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customOrders, setCustomOrders] = useState<CustomerOrder[]>([]);
  const [productOrders, setProductOrders] = useState<ProductOrder[]>([]);
  // The customer's saved cart — a draft, not yet an order.
  const [savedCart, setSavedCart] = useState<CartDraft | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartError, setCartError] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeTab, setActiveTab] = useState<OrderTab>('custom');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'appointments' || tabParam === 'custom' || tabParam === 'premade') {
      setActiveTab(tabParam as OrderTab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading) {
      if (!user || user.role !== 'customer') {
        router.push('/login');
        return;
      }
      fetchOrders();
    }
  }, [authLoading, user, router]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const [customResponse, productResponse, appointmentResponse, draftResponse] = await Promise.all([
        api.customerOrders.getMyOrders(),
        api.productOrders.getMyOrders(),
        api.appointments.getMyAppointments(),
        // A saved cart is optional — never let its absence fail the whole page.
        api.productOrders.getCartDraft().catch(() => ({ data: null })),
      ]);

      setCustomOrders(customResponse.data || []);
      setProductOrders(productResponse.data || []);
      setAppointments(appointmentResponse.data || []);
      setSavedCart(draftResponse.data || null);
    } catch (err) {
      setError('Failed to load your orders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Places the saved cart as a real order. The server re-checks stock, so a 409
   * here means something sold out — refresh the draft to show what changed
   * rather than reporting a generic failure.
   */
  const handleConfirmSavedCart = async () => {
    if (!savedCart) return;
    setCartBusy(true); setCartError('');
    try {
      await api.productOrders.confirmCartDraft();
      setSavedCart(null);
      await fetchOrders();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setCartError(err.message);
        if (err.body?.availability) {
          setSavedCart(prev => prev ? { ...prev, availability: err.body.availability, isAvailable: false } : prev);
        }
      } else {
        setCartError(err instanceof Error ? err.message : 'Could not place your order.');
      }
    } finally {
      setCartBusy(false);
    }
  };

  const handleDiscardSavedCart = async () => {
    if (!savedCart) return;
    setCartBusy(true); setCartError('');
    try {
      await api.productOrders.deleteCartDraft();
      setSavedCart(null);
    } catch (err) {
      setCartError(err instanceof Error ? err.message : 'Could not discard your saved cart.');
    } finally {
      setCartBusy(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'confirmed':
      case 'processing':
      case 'in_progress':
        return 'bg-blue-100 text-blue-700';
      case 'ready_for_installation':
      case 'ready':
        return 'bg-orange-100 text-orange-700';
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'delivered':
        return 'bg-purple-100 text-purple-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-700';
      case 'partial':
        return 'bg-[#dde6ff] text-[#011c72]';
      case 'unpaid':
      default:
        return 'bg-red-100 text-red-700';
    }
  };

  const getQuotationStatusColor = (status?: string) => {
    switch (status) {
      case 'pending_quotation':
        return 'bg-gray-100 text-gray-700';
      case 'quoted':
        return 'bg-[#dde6ff] text-[#011c72]';
      case 'accepted':
        return 'bg-green-100 text-green-700';
      case 'rejected':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getQuotationStatusLabel = (status?: string) => {
    switch (status) {
      case 'pending_quotation':
        return 'Awaiting Quotation';
      case 'quoted':
        return 'Quotation Ready';
      case 'accepted':
        return 'Quotation Accepted';
      case 'rejected':
        return 'Quotation Rejected';
      default:
        return status || 'Unknown';
    }
  };

  const getServiceLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      flooring: 'Flooring',
      reupholstery: 'Reupholstery',
      ceiling: 'Ceiling',
      sidings: 'Sidings',
      seat_covers: 'Seat Covers',
      other: 'Other Services'
    };
    return labels[type] || type;
  };

  const getAppointmentTrackerMeta = (status: Appointment['status']) => {
    switch (status) {
      case 'pending':
        return {
          label: 'Waiting for confirmation from admin/supervisor',
          progress: 33,
          progressClass: 'bg-[#011c72]'
        };
      case 'confirmed':
        return {
          label: 'Confirmed by admin/supervisor',
          progress: 66,
          progressClass: 'bg-blue-500'
        };
      case 'completed':
        return {
          label: 'Appointment completed',
          progress: 100,
          progressClass: 'bg-green-500'
        };
      case 'cancelled':
      default:
        return {
          label: 'Appointment cancelled',
          progress: 100,
          progressClass: 'bg-red-500'
        };
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 rounded"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#011c72] transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to website
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">My Orders</h1>
          <p className="text-gray-600 mt-2">
            Track custom service orders and premade product purchases
          </p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        <div className="mb-6 flex gap-3 flex-wrap">
          <Link
            href="/place-order"
            className="inline-flex items-center px-4 py-2 bg-[#011c72] text-white rounded-lg hover:bg-[#01268c] transition-colors font-medium"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Place New Order
          </Link>

          <button
            onClick={() => setActiveTab('custom')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'custom'
                ? 'bg-[#011c72] text-white shadow-sm'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Custom Orders ({customOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('premade')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'premade'
                ? 'bg-[#011c72] text-white shadow-sm'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Premade Purchases ({productOrders.length})
            {savedCart && (
              <span title="You have a saved cart waiting to be placed"
                className="ml-1.5 inline-block w-2 h-2 rounded-full bg-yellow-500 align-middle" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('appointments')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'appointments'
                ? 'bg-[#011c72] text-white shadow-sm'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Appointments ({appointments.length})
          </button>
        </div>

        {activeTab === 'custom' && (
          <>
            {customOrders.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <p className="text-gray-600 mb-4">You have no custom service orders yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {customOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-lg font-semibold text-gray-900">{order.orderNumber}</h3>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(order.status)}`}>
                            {order.status.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          {order.quotationStatus && (
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getQuotationStatusColor(order.quotationStatus)}`}>
                              {getQuotationStatusLabel(order.quotationStatus)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {formatDate(order.createdAt)}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          Branch: {order.branchName || 'N/A'}
                        </p>
                      </div>

                      <Link
                        href={`/my-orders/${order.id}`}
                        className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
                      >
                        View Details
                      </Link>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {order.services?.map((service, index) => (
                        <span
                          key={index}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-md"
                        >
                          {getServiceLabel(service.type)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'premade' && (
          <>
            {/* Saved cart — not an order yet. Shown above real purchases so the
                customer sees there is something waiting to be placed. */}
            {savedCart && (
              <div className="mb-6 bg-white rounded-xl border-2 border-dashed border-[#011c72] p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">Your Saved Cart</h3>
                      <span className="px-2 py-0.5 rounded-full bg-[#eef1fb] text-[#011c72] text-xs font-semibold">
                        NOT YET ORDERED
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {savedCart.itemCount} item{savedCart.itemCount !== 1 ? 's' : ''}
                      {savedCart.pickupBranchName
                        ? ` · pickup at ${savedCart.pickupBranchName}`
                        : ' · no pickup branch chosen yet'}
                      {' · saved '}{formatDate(savedCart.updatedAt)}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-[#011c72]">
                    ₱{savedCart.totalAmount.toLocaleString()}
                  </p>
                </div>

                <ul className="divide-y divide-gray-100 border-y border-gray-100">
                  {savedCart.availability.map(row => (
                    <li key={row.productId} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900">
                          {row.requested}× {row.name}
                        </p>
                        {row.issue && (
                          <p className="text-xs text-yellow-700 mt-0.5">{row.message}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {row.issue ? (
                          <span className="text-xs font-semibold text-yellow-700">Unavailable</span>
                        ) : (
                          <span className="text-sm text-gray-700">
                            ₱{((row.currentPrice || 0) * row.requested).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {cartError && (
                  <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    {cartError}
                  </p>
                )}

                {!savedCart.isAvailable && (
                  <p className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
                    Some items are no longer available in the quantity you saved. Update your cart
                    before placing the order.
                  </p>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleConfirmSavedCart}
                    disabled={cartBusy || !savedCart.isAvailable || !savedCart.pickupBranchId}
                    title={!savedCart.pickupBranchId ? 'Choose a pickup branch in your cart first' : undefined}
                    className="px-5 py-2.5 rounded-xl bg-[#011c72] text-white font-semibold hover:bg-[#01268c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {cartBusy ? 'Placing…' : 'Place This Order'}
                  </button>
                  <Link
                    href="/place-order"
                    className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                  >
                    Edit Cart
                  </Link>
                  <button
                    type="button"
                    onClick={handleDiscardSavedCart}
                    disabled={cartBusy}
                    className="px-5 py-2.5 rounded-xl text-red-600 font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {productOrders.length === 0 ? (
              !savedCart && (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                  <p className="text-gray-600 mb-4">You have no premade product purchases yet</p>
                </div>
              )
            ) : (
              <div className="space-y-4">
                {productOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-xl border border-gray-200 p-6"
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-lg font-semibold text-gray-900">{order.orderNumber}</h3>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(order.status)}`}>
                            {order.status.toUpperCase()}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPaymentStatusColor(order.paymentStatus)}`}>
                            PAYMENT: {order.paymentStatus.toUpperCase()}
                          </span>
                          {order.groupId && (
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-purple-100 text-purple-700">
                              Multi-branch
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {formatDate(order.createdAt)}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          Source Branch: {order.branchName || 'N/A'}
                        </p>
                        {order.pickupBranchName && (
                          <p className={`text-sm font-medium mt-1 ${
                            order.pickupBranchId !== order.branchId
                              ? 'text-orange-600'
                              : 'text-gray-500'
                          }`}>
                            {order.pickupBranchId !== order.branchId ? 'Pickup at: ' : 'Pickup Branch: '}
                            {order.pickupBranchName}
                          </p>
                        )}
                      </div>

                      <p className="text-lg font-semibold text-[#011c72]">₱{order.totalAmount.toLocaleString()}</p>
                    </div>

                    <div className="space-y-2">
                      {order.items.map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="text-gray-800">
                            {item.quantity}x {item.name}
                          </span>
                          <span className="text-gray-600">₱{item.total.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'appointments' && (
          <>
            {appointments.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <p className="text-gray-600 mb-4">You have no appointment requests yet</p>
                <Link
                  href="/place-order"
                  className="inline-flex items-center px-4 py-2 bg-[#011c72] text-white rounded-lg hover:bg-[#01268c] transition-colors font-medium"
                >
                  Book Appointment
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {appointments.map((appointment) => {
                  const tracker = getAppointmentTrackerMeta(appointment.status);

                  return (
                    <div
                      key={appointment.id}
                      className="bg-white rounded-xl border border-gray-200 p-6"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-lg font-semibold text-gray-900">{appointment.appointmentNumber}</h3>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(appointment.status)}`}>
                              {appointment.status.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            Preferred: {formatDate(appointment.preferredDate)}
                            {appointment.preferredTime ? ` • ${appointment.preferredTime}` : ''}
                          </p>
                          {appointment.confirmedTime && (
                            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
                              <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-sm font-semibold text-blue-700">
                                Your appointment is set at {appointment.confirmedTime}
                              </span>
                            </div>
                          )}
                          {appointment.branchName && (
                            <p className="text-sm text-gray-500 mt-1">
                              Branch: {appointment.branchName}
                            </p>
                          )}
                        </div>

                        <p className="text-sm text-gray-500">
                          Requested on {formatDate(appointment.createdAt)}
                        </p>
                      </div>

                      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                        <span>Request Sent</span>
                        <span>Confirmed</span>
                        <span>Completed</span>
                      </div>
                      <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${tracker.progressClass} transition-all duration-500`}
                          style={{ width: `${tracker.progress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-sm font-medium text-gray-700">{tracker.label}</p>

                      {appointment.adminNotes && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <p className="text-xs font-medium text-blue-600 uppercase">Admin Notes</p>
                          <p className="text-sm text-blue-700 mt-1">{appointment.adminNotes}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
