'use client';
import { formatDate } from '@/lib/dateUtils';
import { useState, useEffect, useRef, Suspense, Fragment } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, Appointment, CustomerOrder, ProductOrder, CartDraft, ApiError, CustomerJobOrder, jobOrderPriceBreakdown } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';
import RejectQuotationDialog from '@/components/RejectQuotationDialog';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

type OrderTab = 'custom' | 'premade' | 'appointments';

const peso = (n: number) =>
  `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A quotation the customer still has to accept or reject */
const isAwaitingReply = (jo: CustomerJobOrder) => jo.status === 'draft' && jo.quoteStatus === 'sent';

function jobOrderBadge(jo: CustomerJobOrder): { label: string; cls: string } {
  if (jo.status === 'draft') {
    return jo.quoteStatus === 'rejected'
      ? { label: 'Quotation Rejected', cls: 'bg-red-100 text-red-700' }
      : { label: 'Quotation Ready', cls: 'bg-blue-100 text-blue-800' };
  }
  const labels: Record<string, [string, string]> = {
    pending: ['Pending', 'bg-yellow-100 text-yellow-800'],
    in_progress: ['In Progress', 'bg-blue-100 text-blue-800'],
    completed: ['Completed', 'bg-green-100 text-green-800'],
    delivered: ['Delivered', 'bg-green-100 text-green-800'],
    cancelled: ['Cancelled', 'bg-red-100 text-red-700'],
    voided: ['Voided', 'bg-gray-100 text-gray-500'],
  };
  const [label, cls] = labels[jo.status] || [jo.status.replace(/_/g, ' '), 'bg-gray-100 text-gray-700'];
  return { label, cls };
}

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
  // Job orders the shop made for this customer, including quotations to answer
  const [jobOrders, setJobOrders] = useState<CustomerJobOrder[]>([]);
  // Ids whose details were toggled from their default (open for quotations awaiting a reply)
  const [toggledJobIds, setToggledJobIds] = useState<Set<number>>(new Set());
  const toggleJob = (id: number) => setToggledJobIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [jobBusyId, setJobBusyId] = useState<number | null>(null);
  const [jobError, setJobError] = useState('');
  const [rejectingJob, setRejectingJob] = useState<CustomerJobOrder | null>(null);
  const [rejectError, setRejectError] = useState('');
  const { confirm, confirmDialog } = useConfirm();
  const [productOrders, setProductOrders] = useState<ProductOrder[]>([]);
  const [openProductIds, setOpenProductIds] = useState<Set<number>>(new Set());
  const toggleProduct = (id: number) => setOpenProductIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [productError, setProductError] = useState<{ id: number; message: string } | null>(null);
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

  // Opened from a notification: open that order's details and bring it into view
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  // The link already acted on, so reloading the orders doesn't jump back to it
  const focusedLink = useRef('');
  useEffect(() => {
    if (loading || searchParams.toString() === focusedLink.current) return;
    const jobId = Number(searchParams.get('job'));
    const orderId = Number(searchParams.get('order'));
    let key: string | null = null;
    if (jobId) {
      const jo = jobOrders.find(j => j.id === jobId);
      if (!jo) return;
      key = `jo-${jobId}`;
      // Details start open for a quotation awaiting a reply and closed otherwise
      setToggledJobIds(prev => {
        const next = new Set(prev);
        if (isAwaitingReply(jo)) next.delete(jobId); else next.add(jobId);
        return next;
      });
    } else if (orderId) {
      key = `po-${orderId}`;
      setOpenProductIds(prev => new Set(prev).add(orderId));
    }
    if (!key) return;
    focusedLink.current = searchParams.toString();
    setHighlightKey(key);
    const target = key;
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    setTimeout(() => setHighlightKey(k => (k === target ? null : k)), 4000);
  }, [searchParams, loading, jobOrders]);

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
      const [customResponse, productResponse, appointmentResponse, draftResponse, jobResponse] = await Promise.all([
        api.customerOrders.getMyOrders(),
        api.productOrders.getMyOrders(),
        api.appointments.getMyAppointments(),
        // A saved cart is optional — never let its absence fail the whole page.
        api.productOrders.getCartDraft().catch(() => ({ data: null })),
        api.myJobOrders.list().catch(() => ({ data: [] as CustomerJobOrder[] })),
      ]);

      setCustomOrders(customResponse.data || []);
      // Quotations waiting for an answer first, then newest
      setJobOrders([...(jobResponse.data || [])].sort((a, b) =>
        Number(isAwaitingReply(b)) - Number(isAwaitingReply(a))));
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

  const handleCancelProductOrder = async (order: ProductOrder) => {
    const ok = await confirm({
      title: `Cancel order ${order.orderNumber}?`,
      message: 'The items will be released and this order cannot be restored. You can place a new order any time.',
      confirmLabel: 'Cancel Order',
      cancelLabel: 'Keep Order',
      variant: 'danger',
    });
    if (!ok) return;
    setCancellingId(order.id); setProductError(null);
    try {
      const res = await api.productOrders.cancelMyOrder(order.id);
      if (res.data) setProductOrders(prev => prev.map(o => (o.id === order.id ? res.data! : o)));
    } catch (err) {
      setProductError({ id: order.id, message: err instanceof Error ? err.message : 'Could not cancel this order.' });
    } finally {
      setCancellingId(null);
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

  const acceptJobQuotation = async (jo: CustomerJobOrder) => {
    const ok = await confirm({
      title: 'Accept this quotation?',
      message: (
        <>
          <b>{jo.jobOrderId}</b> for <b>{peso(jo.totalPrice)}</b> will become a confirmed job order.
        </>
      ),
      warning: 'Please visit the branch to pay the down payment so work can start.',
      confirmLabel: 'Accept Quotation',
      variant: 'info',
    });
    if (!ok) return;
    setJobBusyId(jo.id); setJobError('');
    try {
      await api.myJobOrders.respondToQuotation(jo.id, 'accept');
      await fetchOrders();
    } catch (err) {
      setJobError(err instanceof Error ? err.message : 'Failed to accept the quotation.');
    } finally {
      setJobBusyId(null);
    }
  };

  const rejectJobQuotation = async (reason: string) => {
    if (!rejectingJob) return;
    setJobBusyId(rejectingJob.id); setRejectError('');
    try {
      await api.myJobOrders.respondToQuotation(rejectingJob.id, 'reject', reason);
      setRejectingJob(null);
      await fetchOrders();
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : 'Failed to reject the quotation.');
    } finally {
      setJobBusyId(null);
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
            Custom Orders ({customOrders.length + jobOrders.length})
            {jobOrders.some(isAwaitingReply) && (
              <span title="A quotation is waiting for your reply"
                className="ml-1.5 inline-block w-2 h-2 rounded-full bg-yellow-500 align-middle" />
            )}
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
            {jobError && (
              <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{jobError}</p>
            )}

            {/* Job orders and quotations from the shop */}
            {jobOrders.length > 0 && (
              <div className="space-y-4 mb-6">
                {jobOrders.map((jo) => {
                  const badge = jobOrderBadge(jo);
                  const price = jobOrderPriceBreakdown(jo.totalPrice || 0, jo.discountPercent, jo.vatPercent);
                  const awaiting = isAwaitingReply(jo);
                  const expanded = awaiting ? !toggledJobIds.has(jo.id) : toggledJobIds.has(jo.id);
                  const v = jo.vehicleInfo;
                  const isReupholstery = v?.make === 'Reupholstery';
                  const vehicle = v && v.make && v.make !== 'N/A' && !isReupholstery
                    ? [v.year, v.make, v.model !== 'N/A' ? v.model : ''].filter(Boolean).join(' ')
                    : '';
                  const services = (jo.description || '').split(',').map(x => x.trim()).filter(Boolean);
                  return (
                    <div key={`jo-${jo.id}`} id={`jo-${jo.id}`}
                      className={`bg-white rounded-xl border p-6 transition-shadow hover:shadow-md scroll-mt-24 ${highlightKey === `jo-${jo.id}` ? 'border-[#011c72] ring-2 ring-[#4a6aff]' : awaiting ? 'border-[#011c72] ring-1 ring-[#011c72]/20' : 'border-gray-200'}`}>
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-lg font-semibold text-gray-900">{jo.jobOrderId}</h3>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{jo.createdAt ? formatDate(jo.createdAt) : ''}</p>
                          <p className="text-sm text-gray-500 mt-1">Branch: {jo.branchName || 'N/A'}</p>
                        </div>
                        <div className="text-left lg:text-right">
                          <p className="text-xs text-gray-500">{awaiting ? 'Quoted price' : 'Total'}</p>
                          <p className="text-xl font-bold text-[#011c72]">{peso(jo.totalPrice)}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {(jo.description || '').split(',').map(x => x.trim()).filter(Boolean).map((svc, i) => (
                          <span key={i} className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-md">
                            {getServiceLabel(svc.replace(/ \(.*\)$/, ''))}
                          </span>
                        ))}
                      </div>

                      {jo.quoteStatus === 'rejected' && jo.status === 'draft' && (
                        <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                          You rejected this quotation: “{jo.quoteRejectReason}”. We&apos;ll contact you with a revised offer.
                        </p>
                      )}

                      {expanded && (
                        <div className="mt-4 border-t border-gray-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                          {/* Vehicle */}
                          <section>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                              {isReupholstery ? 'Item' : 'Vehicle'}
                            </h4>
                            {isReupholstery ? (
                              <p className="text-gray-900">{v?.model || 'Item for reupholstery'}</p>
                            ) : vehicle ? (
                              <>
                                <p className="text-gray-900 font-medium">{vehicle}</p>
                                {v?.plateNumber && <p className="text-gray-600">Plate no. {v.plateNumber}</p>}
                              </>
                            ) : (
                              <p className="text-gray-500">Not specified</p>
                            )}
                          </section>

                          {/* Work to be done */}
                          <section>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Work to be done</h4>
                            {services.length > 0 ? (
                              <ul className="space-y-1">
                                {services.map((svc, i) => {
                                  const detail = svc.match(/\(([^)]*)\)$/)?.[1];
                                  return (
                                    <li key={i} className="flex items-start gap-2 text-gray-900">
                                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#011c72] shrink-0" />
                                      <span>{getServiceLabel(svc.replace(/ \(.*\)$/, ''))}{detail ? ` — ${detail}` : ''}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="text-gray-500">Not specified</p>
                            )}
                            {jo.workSteps?.length > 0 && (
                              <ol className="mt-2 list-decimal list-inside space-y-0.5 text-gray-700">
                                {jo.workSteps.map((step, i) => <li key={i}>{step}</li>)}
                              </ol>
                            )}
                          </section>

                          {/* Specification from the order slip */}
                          {jo.specs?.length > 0 && (
                            <section>
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Specifications</h4>
                              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                                {jo.specs.map((sp) => (
                                  <Fragment key={sp.label}>
                                    <dt className="text-gray-500">{sp.label}</dt>
                                    <dd className="text-gray-900">{sp.value}</dd>
                                  </Fragment>
                                ))}
                              </dl>
                            </section>
                          )}

                          {/* Price */}
                          <section>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Price</h4>
                            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                              <dt className="text-gray-500">Price for the work</dt><dd className="text-gray-900 text-right">{peso(price.subtotal)}</dd>
                              {price.discountPercent > 0 && (<><dt className="text-gray-500">Discount ({price.discountPercent}%)</dt><dd className="text-green-700 text-right">− {peso(price.discount)}</dd></>)}
                              {price.vatPercent > 0 && (<><dt className="text-gray-500">VAT ({price.vatPercent}%)</dt><dd className="text-gray-900 text-right">+ {peso(price.vat)}</dd></>)}
                              <dt className="text-gray-900 font-semibold border-t border-gray-100 pt-1">Total</dt>
                              <dd className="text-gray-900 font-semibold text-right border-t border-gray-100 pt-1">{peso(price.total)}</dd>
                              {jo.status !== 'draft' && (
                                <>
                                  <dt className="text-gray-500">Paid</dt><dd className="text-gray-900 text-right">{peso(jo.downPayment)}</dd>
                                  <dt className="text-gray-500">Balance</dt><dd className="text-gray-900 text-right">{peso(jo.balance)}</dd>
                                </>
                              )}
                            </dl>
                          </section>

                          {/* Schedule */}
                          <section>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Schedule</h4>
                            <p className="text-gray-900">
                              Estimated completion: {jo.estimatedCompletion ? formatDate(jo.estimatedCompletion) : 'To be confirmed'}
                            </p>
                            {jo.status === 'draft' && (
                              <p className="text-gray-600 mt-1">
                                Once you accept, pay the down payment at {jo.branchName || 'the branch'} so work can start.
                              </p>
                            )}
                          </section>
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button type="button" onClick={() => toggleJob(jo.id)}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm">
                          {expanded ? 'Hide Details' : 'View Details'}
                        </button>
                        {awaiting && (
                          <>
                            <button type="button" onClick={() => acceptJobQuotation(jo)} disabled={jobBusyId === jo.id}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-sm disabled:opacity-50">
                              Accept Quotation
                            </button>
                            <button type="button" onClick={() => { setRejectError(''); setRejectingJob(jo); }} disabled={jobBusyId === jo.id}
                              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold text-sm disabled:opacity-50">
                              Reject Quotation
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {customOrders.length === 0 && jobOrders.length > 0 ? null : customOrders.length === 0 ? (
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
                  {savedCart.availability.map(row => {
                    // Short on stock can still be fixed by lowering the quantity; anything else can't be bought
                    const short = row.issue === 'insufficient';
                    const blocked = !!row.issue && !short;
                    return (
                    <li key={row.productId} className={`py-2.5 flex items-start justify-between gap-3 ${blocked ? 'bg-gray-50 px-2 -mx-2 rounded-md' : short ? 'bg-amber-50 px-2 -mx-2 rounded-md' : ''}`}>
                      <div className="min-w-0">
                        <p className={`text-sm ${blocked ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {row.requested}× {row.name}
                        </p>
                        {short && (
                          <p className="text-xs text-amber-800 mt-0.5">Only {row.available} left — you saved {row.requested}.</p>
                        )}
                        {blocked && row.issue !== 'out_of_stock' && (
                          <p className="text-xs text-gray-500 mt-0.5">{row.message}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {row.issue ? (
                          <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${short ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-600'}`}>
                            {short ? 'Not Enough Stock' : row.issue === 'out_of_stock' ? 'Out of Stock' : 'Unavailable'}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-700">
                            ₱{((row.currentPrice || 0) * row.requested).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </li>
                    );
                  })}
                </ul>

                {cartError && (
                  <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    {cartError}
                  </p>
                )}

                {!savedCart.isAvailable && (
                  <p className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
                    Your cart has items that are out of stock or short on stock. Click <b>Edit Cart</b> to
                    remove them or lower the quantity, or wait until they are back in stock, to place this order.
                  </p>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleConfirmSavedCart}
                    disabled={cartBusy || !savedCart.isAvailable || !savedCart.pickupBranchId}
                    title={!savedCart.isAvailable ? 'Remove the out-of-stock items first'
                      : !savedCart.pickupBranchId ? 'Choose a pickup branch in your cart first' : undefined}
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
                    id={`po-${order.id}`}
                    className={`bg-white rounded-xl border p-6 scroll-mt-24 transition-shadow ${highlightKey === `po-${order.id}` ? 'border-[#011c72] ring-2 ring-[#4a6aff]' : 'border-gray-200'}`}
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

                    {openProductIds.has(order.id) && <PremadeOrderDetails order={order} />}

                    {productError?.id === order.id && (
                      <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{productError.message}</p>
                    )}

                    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-3">
                      <button type="button" onClick={() => toggleProduct(order.id)}
                        className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm">
                        {openProductIds.has(order.id) ? 'Hide Details' : 'View Details'}
                      </button>
                      {order.status === 'pending' && (
                        <button type="button" onClick={() => handleCancelProductOrder(order)}
                          disabled={cancellingId === order.id}
                          className="inline-flex items-center px-4 py-2 rounded-lg text-red-600 font-medium text-sm hover:bg-red-50 disabled:opacity-50 transition-colors">
                          {cancellingId === order.id ? 'Cancelling…' : 'Cancel Order'}
                        </button>
                      )}
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
      <RejectQuotationDialog
        open={!!rejectingJob}
        busy={jobBusyId !== null}
        error={rejectError}
        onCancel={() => setRejectingJob(null)}
        onConfirm={rejectJobQuotation}
      />
      {confirmDialog}
    </div>
  );
}

const TRANSFER_LABELS: Record<string, string> = {
  pending: 'Being prepared',
  transferred: 'On the way',
  received: 'Arrived at pickup branch',
  cancelled: 'Cancelled',
};

/** Everything about a premade order the customer may want to check */
function PremadeOrderDetails({ order }: { order: ProductOrder }) {
  const paid = order.amountPaid ?? 0;
  const balance = order.remainingBalance ?? Math.max(0, order.totalAmount - paid);
  return (
    <div className="mt-4 pt-4 border-t border-gray-100 grid gap-5 sm:grid-cols-2 text-sm">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items</p>
        <div className="space-y-1.5">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span className="text-gray-700">
                {item.name}
                <span className="block text-xs text-gray-400">
                  ₱{(item.unitPrice ?? 0).toLocaleString()} × {item.quantity}
                  {item.sourceBranchName ? ` · from ${item.sourceBranchName}` : ''}
                </span>
              </span>
              <span className="text-gray-700 shrink-0">₱{item.total.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Payment</p>
        <div className="space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-medium text-gray-900">₱{order.totalAmount.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Paid</span><span className="text-gray-900">₱{paid.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Balance</span><span className="font-semibold text-[#011c72]">₱{balance.toLocaleString()}</span></div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pickup</p>
        <p className="text-gray-900">{order.pickupBranchName || order.branchName || 'N/A'}</p>
        {order.transfers && order.transfers.length > 0 && (
          <ul className="mt-2 space-y-1">
            {order.transfers.map(t => (
              <li key={t.id} className="text-xs text-gray-600">
                Items from {t.sourceBranchName || 'another branch'}: <span className="font-medium">{TRANSFER_LABELS[t.status] || t.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contact &amp; Notes</p>
        <p className="text-gray-900">{order.customerName}</p>
        <p className="text-gray-600">{order.customerPhone}</p>
        {order.customerEmail && <p className="text-gray-600">{order.customerEmail}</p>}
        {order.notes && <p className="mt-2 text-gray-600 whitespace-pre-line">{order.notes}</p>}
        {order.updatedAt && (
          <p className="mt-2 text-xs text-gray-400">Last updated {formatDate(order.updatedAt)}</p>
        )}
      </div>
    </div>
  );
}
