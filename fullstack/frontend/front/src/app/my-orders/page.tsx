'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, Appointment, CustomerOrder, ProductOrder } from '@/lib/api';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

type OrderTab = 'custom' | 'premade' | 'appointments';

export default function MyOrdersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customOrders, setCustomOrders] = useState<CustomerOrder[]>([]);
  const [productOrders, setProductOrders] = useState<ProductOrder[]>([]);
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
      const [customResponse, productResponse, appointmentResponse] = await Promise.all([
        api.customerOrders.getMyOrders(),
        api.productOrders.getMyOrders(),
        api.appointments.getMyAppointments()
      ]);

      setCustomOrders(customResponse.data || []);
      setProductOrders(productResponse.data || []);
      setAppointments(appointmentResponse.data || []);
    } catch (err) {
      setError('Failed to load your orders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'confirmed':
      case 'processing':
      case 'in_progress':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'ready_for_installation':
      case 'ready':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'completed':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'delivered':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'cancelled':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'partial':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'unpaid':
      default:
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    }
  };

  const getQuotationStatusColor = (status?: string) => {
    switch (status) {
      case 'pending_quotation':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
      case 'quoted':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'accepted':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'rejected':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
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
          progressClass: 'bg-amber-500'
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
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-amber-600 dark:text-amber-400 text-sm font-medium mb-4 inline-block">
            ← Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">My Orders</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Track custom service orders and premade product purchases
          </p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="mb-6 flex gap-3 flex-wrap">
          <Link
            href="/place-order"
            className="inline-flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
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
                ? 'bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800'
            }`}
          >
            Custom Orders ({customOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('premade')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'premade'
                ? 'bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800'
            }`}
          >
            Premade Purchases ({productOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('appointments')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'appointments'
                ? 'bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800'
            }`}
          >
            Appointments ({appointments.length})
          </button>
        </div>

        {activeTab === 'custom' && (
          <>
            {customOrders.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-12 text-center">
                <p className="text-zinc-600 dark:text-zinc-400 mb-4">You have no custom service orders yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {customOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">{order.orderNumber}</h3>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(order.status)}`}>
                            {order.status.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          {order.quotationStatus && (
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getQuotationStatusColor(order.quotationStatus)}`}>
                              {getQuotationStatusLabel(order.quotationStatus)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                          {new Date(order.createdAt).toLocaleDateString('en-PH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                          Branch: {order.branchName || 'N/A'}
                        </p>
                      </div>

                      <Link
                        href={`/my-orders/${order.id}`}
                        className="inline-flex items-center px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors font-medium text-sm"
                      >
                        View Details
                      </Link>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {order.services?.map((service, index) => (
                        <span
                          key={index}
                          className="text-xs px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md"
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
            {productOrders.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-12 text-center">
                <p className="text-zinc-600 dark:text-zinc-400 mb-4">You have no premade product purchases yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {productOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6"
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">{order.orderNumber}</h3>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(order.status)}`}>
                            {order.status.toUpperCase()}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPaymentStatusColor(order.paymentStatus)}`}>
                            PAYMENT: {order.paymentStatus.toUpperCase()}
                          </span>
                          {order.groupId && (
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              Multi-branch
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                          {new Date(order.createdAt).toLocaleDateString('en-PH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                          Source Branch: {order.branchName || 'N/A'}
                        </p>
                        {order.pickupBranchName && (
                          <p className={`text-sm font-medium mt-1 ${
                            order.pickupBranchId !== order.branchId
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-zinc-500 dark:text-zinc-400'
                          }`}>
                            {order.pickupBranchId !== order.branchId ? 'Pickup at: ' : 'Pickup Branch: '}
                            {order.pickupBranchName}
                          </p>
                        )}
                      </div>

                      <p className="text-lg font-semibold text-amber-600">₱{order.totalAmount.toLocaleString()}</p>
                    </div>

                    <div className="space-y-2">
                      {order.items.map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="text-zinc-800 dark:text-zinc-200">
                            {item.quantity}x {item.name}
                          </span>
                          <span className="text-zinc-600 dark:text-zinc-400">₱{item.total.toLocaleString()}</span>
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
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-12 text-center">
                <p className="text-zinc-600 dark:text-zinc-400 mb-4">You have no appointment requests yet</p>
                <Link
                  href="/place-order"
                  className="inline-flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
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
                      className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">{appointment.appointmentNumber}</h3>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(appointment.status)}`}>
                              {appointment.status.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                            Preferred: {new Date(appointment.preferredDate).toLocaleDateString('en-PH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                            {appointment.preferredTime ? ` • ${appointment.preferredTime}` : ''}
                          </p>
                          {appointment.confirmedTime && (
                            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                                Your appointment is set at {appointment.confirmedTime}
                              </span>
                            </div>
                          )}
                          {appointment.branchName && (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                              Branch: {appointment.branchName}
                            </p>
                          )}
                        </div>

                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                          Requested on {new Date(appointment.createdAt).toLocaleDateString('en-PH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>

                      <div className="mb-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                        <span>Request Sent</span>
                        <span>Confirmed</span>
                        <span>Completed</span>
                      </div>
                      <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${tracker.progressClass} transition-all duration-500`}
                          style={{ width: `${tracker.progress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">{tracker.label}</p>

                      {appointment.adminNotes && (
                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase">Admin Notes</p>
                          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">{appointment.adminNotes}</p>
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
