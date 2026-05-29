'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ProductOrder, ProductOrderTransfer, ProductOrderTimelineEvent } from '@/lib/api';
import { useAuth, hasAccess } from '@/context/AuthContext';

type SaveState = 'idle' | 'saving';

export default function ProductOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user ? hasAccess(user.role, ['administrator']) : false;
  const [order, setOrder] = useState<ProductOrder | null>(null);
  const [timeline, setTimeline] = useState<ProductOrderTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const orderId = useMemo(() => Number(params.id), [params.id]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [orderRes, timelineRes] = await Promise.all([
        api.productOrders.get(orderId),
        api.productOrders.getTimeline(orderId)
      ]);

      setOrder(orderRes.data || null);
      setTimeline(timelineRes.data || []);
    } catch (err) {
      setError('Failed to load purchase details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!Number.isFinite(orderId) || orderId <= 0) {
      setError('Invalid order id');
      setLoading(false);
      return;
    }
    loadData();
  }, [orderId, loadData]);

  const updateOrder = async (data: { status?: ProductOrder['status']; paymentStatus?: ProductOrder['paymentStatus']; notes?: string }) => {
    if (!order) return;
    try {
      setSaveState('saving');
      await api.productOrders.update(order.id, data);
      await loadData();
    } catch (err) {
      setError('Failed to update order');
      console.error(err);
    } finally {
      setSaveState('idle');
    }
  };

  const [transferSavingId, setTransferSavingId] = useState<number | null>(null);
  const [paymentInput, setPaymentInput] = useState<number | ''>('');
  const [addingPayment, setAddingPayment] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);

  const markTransferred = async (transferId: number) => {
    try {
      setTransferSavingId(transferId);
      await api.productOrderTransfers.markTransferred(transferId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to mark as transferred');
    } finally {
      setTransferSavingId(null);
    }
  };

  const confirmTransferReceipt = async (transferId: number) => {
    try {
      setTransferSavingId(transferId);
      await api.productOrderTransfers.confirmReceipt(transferId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to confirm receipt');
    } finally {
      setTransferSavingId(null);
    }
  };

  const handleAddPayment = async () => {
    if (!order || !paymentInput || paymentInput <= 0) return;
    try {
      setAddingPayment(true);
      await api.productOrders.update(order.id, { addPayment: paymentInput as number });
      setPaymentInput('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setAddingPayment(false);
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'processing':
        return 'bg-blue-100 text-blue-700';
      case 'ready':
        return 'bg-orange-100 text-orange-700';
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getPaymentClass = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-700';
      case 'partial':
        return 'bg-[#dde6ff] text-[#011c72]';
      default:
        return 'bg-red-100 text-red-700';
    }
  };

  const getTimelineTypeClass = (type: string) => {
    switch (type) {
      case 'created':
        return 'bg-indigo-100 text-indigo-700';
      case 'status':
        return 'bg-blue-100 text-blue-700';
      case 'payment':
        return 'bg-[#dde6ff] text-[#011c72]';
      case 'audit':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const printReceipt = () => {
    if (!order) return;

    const dateTime = new Date(order.createdAt).toLocaleString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });

    const printedAt = new Date().toLocaleString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });

    const paymentLabel = order.paymentStatus === 'paid' ? 'PAID' : order.paymentStatus === 'partial' ? 'PARTIAL PAYMENT' : 'UNPAID';
    const statusLabel = order.status.toUpperCase();

    const totalWithVat = order.totalAmount;
    const vat = totalWithVat * (12 / 112);
    const subtotal = totalWithVat - vat;

    const itemRows = order.items.map((item) => {
      const fromBranch = item.sourceBranchName && item.sourceBranchName !== order.branchName
        ? `<div class="item-branch">from ${item.sourceBranchName}</div>` : '';
      return `
      <tr>
        <td class="item-name">
          <div>${item.name}</div>
          <div class="item-sku">${item.sku}</div>
          ${fromBranch}
        </td>
        <td class="center">${item.quantity}</td>
        <td class="right">&#8369;${item.unitPrice.toLocaleString()}</td>
        <td class="right">&#8369;${item.total.toLocaleString()}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt – ${order.orderNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      width: 320px;
      margin: 0 auto;
      padding: 24px 20px 32px;
      background: #fff;
      color: #111;
    }

    /* ── Header ── */
    .header { text-align: center; margin-bottom: 4px; }
    .store-name {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 2px;
      text-transform: uppercase;
      line-height: 1.2;
    }
    .store-tagline { font-size: 9px; color: #555; letter-spacing: 1px; margin-top: 2px; }
    .receipt-title {
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-top: 8px;
      border: 1px solid #111;
      display: inline-block;
      padding: 2px 10px;
    }

    /* ── Dividers ── */
    .dash { border: none; border-top: 1px dashed #999; margin: 10px 0; }
    .solid { border: none; border-top: 2px solid #111; margin: 10px 0; }

    /* ── Key-value rows ── */
    .row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; gap: 8px; }
    .row .label { color: #555; flex-shrink: 0; }
    .row .val { font-weight: bold; text-align: right; word-break: break-all; }

    /* ── Badge ── */
    .badge {
      display: inline-block;
      font-size: 9px;
      font-weight: bold;
      letter-spacing: 1px;
      border: 1px solid #111;
      padding: 1px 6px;
      margin-left: 4px;
      vertical-align: middle;
    }
    .badge-paid { border-color: #16a34a; color: #16a34a; }
    .badge-partial { border-color: #d97706; color: #d97706; }
    .badge-unpaid { border-color: #dc2626; color: #dc2626; }

    /* ── Items table ── */
    table { width: 100%; border-collapse: collapse; margin: 6px 0; }
    thead tr th {
      font-size: 9px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 4px 3px;
      border-bottom: 1px solid #111;
      border-top: 1px solid #111;
    }
    td { padding: 5px 3px; font-size: 11px; vertical-align: top; }
    .item-name { max-width: 130px; }
    .item-sku { font-size: 9px; color: #777; margin-top: 1px; }
    .item-branch { font-size: 9px; color: #b45309; margin-top: 1px; }
    .center { text-align: center; }
    .right { text-align: right; }
    tr + tr td { border-top: 1px dotted #ddd; }

    /* ── Totals ── */
    .subtotal-row td { font-size: 11px; padding-top: 6px; border-top: 1px solid #111; }
    .total-row td { font-size: 13px; font-weight: bold; padding-top: 4px; }

    /* ── Footer ── */
    .footer { text-align: center; margin-top: 14px; }
    .footer .thanks { font-size: 12px; font-weight: bold; letter-spacing: 1px; margin-bottom: 4px; }
    .footer .sub { font-size: 9px; color: #666; margin-top: 2px; }
    .order-barcode {
      font-size: 9px;
      letter-spacing: 3px;
      color: #999;
      margin-top: 10px;
      font-family: monospace;
    }

    @media print {
      @page { margin: 6mm; size: 80mm auto; }
      body { width: auto; padding: 0; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="store-name">Seatmakers<br/>Avenue</div>
    <div class="store-tagline">Premium Upholstery &amp; Car Accessories</div>
    <div class="receipt-title">Official Receipt</div>
  </div>

  <hr class="dash"/>

  <div class="row"><span class="label">Branch:</span><span class="val">${order.branchName || 'N/A'}</span></div>
  <div class="row"><span class="label">Order No:</span><span class="val">${order.orderNumber}</span></div>
  <div class="row"><span class="label">Order Date:</span><span class="val">${dateTime}</span></div>
  <div class="row"><span class="label">Printed:</span><span class="val">${printedAt}</span></div>

  <hr class="dash"/>

  <div class="row"><span class="label">Customer:</span><span class="val">${order.customerName}</span></div>
  <div class="row"><span class="label">Phone:</span><span class="val">${order.customerPhone || '—'}</span></div>

  <hr class="dash"/>

  <table>
    <thead>
      <tr>
        <th style="text-align:left">Item</th>
        <th class="center">Qty</th>
        <th class="right">Unit</th>
        <th class="right">Subtotal</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr class="subtotal-row">
        <td colspan="3" class="right" style="font-size:11px">Net of VAT</td>
        <td class="right" style="font-size:11px">&#8369;${subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td colspan="3" class="right" style="font-size:11px; color:#555;">VAT (12%)</td>
        <td class="right" style="font-size:11px; color:#555;">&#8369;${vat.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
      <tr class="total-row">
        <td colspan="3" class="right">TOTAL</td>
        <td class="right">&#8369;${totalWithVat.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    </tfoot>
  </table>

  <hr class="dash"/>

  <div class="row">
    <span class="label">Payment Status:</span>
    <span class="val">
      <span class="badge badge-${order.paymentStatus === 'paid' ? 'paid' : order.paymentStatus === 'partial' ? 'partial' : 'unpaid'}">${paymentLabel}</span>
    </span>
  </div>
  <div class="row"><span class="label">Order Status:</span><span class="val">${statusLabel}</span></div>

  <hr class="solid"/>

  <div class="footer">
    <div class="thanks">Thank you for your purchase!</div>
    <div class="sub">Please keep this receipt for your records.</div>
    <div class="sub">For concerns, present this receipt at any branch.</div>
    <div class="order-barcode">${order.orderNumber}</div>
  </div>

</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank', 'width=420,height=700');
    if (!w) { URL.revokeObjectURL(url); return; }
    w.focus();
    setTimeout(() => { w.print(); w.close(); URL.revokeObjectURL(url); }, 400);
  };

  const printInvoice = () => {
    if (!order) return;

    const invoiceDate = new Date(order.createdAt).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const printedAt = new Date().toLocaleString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
    const totalWithVat = order.totalAmount;
    const vat = totalWithVat * (12 / 112);
    const subtotal = totalWithVat - vat;

    const itemRows = order.items.map((item) => {
      const fromBranch = item.sourceBranchName && item.sourceBranchName !== order.branchName
        ? `<div class="item-sub">from ${item.sourceBranchName}</div>` : '';
      return `
      <tr>
        <td><div>${item.name}</div><div class="item-sub">${item.sku}</div>${fromBranch}</td>
        <td class="center">${item.quantity}</td>
        <td class="right">&#8369;${item.unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        <td class="right">&#8369;${item.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Invoice – ${order.orderNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; background: #fff; padding: 40px; max-width: 700px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .company-name { font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #b45309; }
    .company-sub { font-size: 11px; color: #666; margin-top: 4px; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 36px; font-weight: 800; letter-spacing: 4px; color: #111; }
    .invoice-title .inv-num { font-size: 12px; color: #555; margin-top: 4px; }
    .divider { border: none; border-top: 2px solid #111; margin: 20px 0; }
    .divider-light { border: none; border-top: 1px solid #ddd; margin: 16px 0; }
    .meta-row { display: flex; gap: 40px; margin-bottom: 24px; }
    .meta-block label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; }
    .meta-block p { font-size: 13px; font-weight: 600; margin-top: 3px; }
    .meta-block .small { font-size: 12px; color: #555; font-weight: 400; margin-top: 1px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
    thead th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 10px 8px; background: #f4f4f4; border-top: 2px solid #111; border-bottom: 2px solid #111; }
    td { padding: 10px 8px; font-size: 12px; border-bottom: 1px solid #eee; vertical-align: top; }
    .item-sub { font-size: 10px; color: #888; margin-top: 2px; }
    .center { text-align: center; }
    .right { text-align: right; }
    .totals { width: 280px; margin-left: auto; margin-top: 8px; }
    .totals-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; color: #555; }
    .totals-row.total { font-size: 16px; font-weight: 800; color: #111; border-top: 2px solid #111; padding-top: 10px; margin-top: 4px; }
    .amount-due { background: #b45309; color: #fff; border-radius: 8px; padding: 16px 20px; text-align: right; margin-top: 24px; }
    .amount-due .label { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.85; }
    .amount-due .amount { font-size: 28px; font-weight: 800; margin-top: 4px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 11px; color: #888; }
    .status-badge { display: inline-block; font-size: 10px; font-weight: 700; border: 1.5px solid #b45309; color: #b45309; padding: 2px 10px; border-radius: 4px; letter-spacing: 1px; text-transform: uppercase; margin-top: 6px; }
    @media print { @page { margin: 12mm; size: A4; } body { padding: 0; max-width: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">Seatmakers Avenue</div>
      <div class="company-sub">Premium Upholstery &amp; Car Accessories</div>
      <div class="company-sub">${order.branchName || 'N/A'}</div>
    </div>
    <div class="invoice-title">
      <h1>INVOICE</h1>
      <div class="inv-num">${order.orderNumber}</div>
      <div class="status-badge">Amount Due</div>
    </div>
  </div>
  <hr class="divider"/>
  <div class="meta-row">
    <div class="meta-block" style="flex:1">
      <label>Bill To</label>
      <p>${order.customerName}</p>
      <div class="small">${order.customerPhone || ''}</div>
      ${order.customerEmail ? `<div class="small">${order.customerEmail}</div>` : ''}
    </div>
    <div class="meta-block">
      <label>Invoice Date</label>
      <p>${invoiceDate}</p>
    </div>
    <div class="meta-block">
      <label>Due Date</label>
      <p>Upon Receipt</p>
    </div>
    <div class="meta-block">
      <label>Printed</label>
      <p style="font-size:11px">${printedAt}</p>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left">Description</th>
        <th class="center">Qty</th>
        <th class="right">Unit Price</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="totals">
    <div class="totals-row"><span>Net of VAT</span><span>&#8369;${subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
    <div class="totals-row"><span>VAT (12%)</span><span>&#8369;${vat.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
    <div class="totals-row total"><span>Total</span><span>&#8369;${totalWithVat.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
  </div>
  <div class="amount-due">
    <div class="label">Total Amount Due</div>
    <div class="amount">&#8369;${totalWithVat.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
  </div>
  <div class="footer">
    <div>Thank you for choosing Seatmakers Avenue!</div>
    <div>For concerns, contact us at your pickup branch.</div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank', 'width=750,height=900');
    if (!w) { URL.revokeObjectURL(url); return; }
    w.focus();
    setTimeout(() => { w.print(); URL.revokeObjectURL(url); }, 400);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="text-red-700">{error || 'Order not found'}</p>
          <button onClick={() => router.push('/product-orders')} className="mt-4 text-[#011c72] hover:text-[#011c72] font-medium">
            Back to Product Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <Link href="/product-orders" className="text-[#011c72] text-sm font-medium">
              ← Back to Product Orders
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">{order.orderNumber}</h1>
            <p className="text-gray-600">Detailed purchase tracking and timeline</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusClass(order.status)}`}>{order.status.toUpperCase()}</span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPaymentClass(order.paymentStatus)}`}>{order.paymentStatus.toUpperCase()}</span>
            {order.groupId && (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-purple-100 text-purple-700">
                Group Order
              </span>
            )}
          </div>
        </div>

        {order.transfers && order.transfers.length > 0 && (
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-start gap-3">
            <svg className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <div>
              <p className="font-semibold text-purple-700 text-sm">Multi-Branch Order</p>
              <p className="text-sm text-purple-600 mt-0.5">
                This order includes items from {order.transfers.length} other branch{order.transfers.length !== 1 ? 'es' : ''}.
                Those branches will transfer their items to <strong>{order.branchName}</strong> for customer pickup.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Items Purchased</h2>
            <div className="space-y-2">
              {order.items.map((item, index) => (
                <div key={index} className="flex justify-between text-sm border-b border-gray-100 pb-2">
                  <span className="text-gray-900">
                    {item.quantity}x {item.name} ({item.sku})
                    {item.sourceBranchName && item.sourceBranchName !== order.branchName && (
                      <span className="ml-2 text-xs text-orange-500">from {item.sourceBranchName}</span>
                    )}
                  </span>
                  <span className="text-gray-600">₱{item.total.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between">
              <span className="font-medium text-gray-800">Total Amount</span>
              <span className="text-xl font-semibold text-[#011c72]">₱{order.totalAmount.toLocaleString()}</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Workflow</h2>
            
            {/* Step-by-step workflow */}
            <div className="space-y-3">
              {/* Step 1: Invoice */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                      order.status !== 'pending'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-[#dde6ff] text-[#011c72]'
                    }`}>
                      {order.status !== 'pending' ? '✓' : '1'}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Step 1: Generate Invoice</p>
                      <p className="text-xs text-gray-500 mt-1">Create and prepare invoice for the customer</p>
                    </div>
                  </div>
                </div>
                {order.status === 'pending' && (
                  <button
                    onClick={() => setShowInvoice(true)}
                    disabled={saveState === 'saving'}
                    className="w-full px-4 py-2 rounded-lg bg-[#011c72] text-white font-medium hover:bg-[#01268c] disabled:opacity-50 text-sm"
                  >
                    Generate Invoice
                  </button>
                )}
                {order.status !== 'pending' && (
                  <p className="text-xs text-green-600 font-medium">Completed</p>
                )}
              </div>

              {/* Step 2: Payment Confirmation */}
              <div className={`border rounded-lg p-4 ${
                order.status === 'pending'
                  ? 'border-gray-200 bg-gray-50 opacity-50'
                  : 'border-gray-200'
              }`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${
                      order.paymentStatus === 'paid'
                        ? 'bg-green-100 text-green-700'
                        : order.status === 'pending'
                        ? 'bg-gray-100 text-gray-400'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {order.paymentStatus === 'paid' ? '✓' : '2'}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Step 2: Confirm Payment</p>
                      <p className="text-xs text-gray-500 mt-1">Record payment amount received</p>
                    </div>
                  </div>
                  {order.status !== 'pending' && order.status !== 'completed' && !(order.amountPaid && order.amountPaid > 0) && (
                    <button
                      onClick={() => updateOrder({ status: 'pending' })}
                      disabled={saveState === 'saving'}
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#011c72] transition-colors disabled:opacity-50 flex-shrink-0"
                      title="Go back to Step 1"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Back
                    </button>
                  )}
                </div>

                {order.status !== 'pending' && (
                  <div className="space-y-3">
                    {/* Payment progress */}
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between text-gray-600">
                        <span>Total Amount</span>
                        <span className="font-semibold text-gray-900">₱{order.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Amount Paid</span>
                        <span className="font-semibold text-green-700">₱{((order.amountPaid ?? 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                      {order.paymentStatus !== 'paid' && (
                        <div className="flex justify-between text-gray-600 pt-1 border-t border-gray-200">
                          <span>Remaining</span>
                          <span className="font-bold text-red-600">₱{((order.remainingBalance ?? order.totalAmount)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>

                    {order.paymentStatus !== 'paid' && (
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-gray-600">Record Payment</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">₱</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            max={order.remainingBalance ?? order.totalAmount}
                            value={paymentInput}
                            onChange={(e) => setPaymentInput(e.target.value === '' ? '' : parseFloat(e.target.value))}
                            placeholder="0.00"
                            className="w-full pl-7 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
                          />
                        </div>
                        {typeof paymentInput === 'number' && paymentInput > 0 && (
                          <p className="text-xs text-gray-500">
                            {paymentInput >= (order.remainingBalance ?? order.totalAmount)
                              ? 'This will fully settle the order.'
                              : `₱${Math.max(0, (order.remainingBalance ?? order.totalAmount) - paymentInput).toLocaleString('en-PH', { minimumFractionDigits: 2 })} will remain after this payment.`}
                          </p>
                        )}
                        <button
                          onClick={handleAddPayment}
                          disabled={addingPayment || !paymentInput || (paymentInput as number) <= 0}
                          className="w-full px-3 py-2 rounded-lg bg-[#011c72] text-white font-medium hover:bg-[#01268c] disabled:opacity-50 text-sm"
                        >
                          {addingPayment ? 'Recording...' : 'Record Payment'}
                        </button>
                      </div>
                    )}

                    {order.paymentStatus === 'paid' && (
                      <p className="text-xs text-green-600 font-medium">Fully paid — ₱{order.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                    )}
                    {order.paymentStatus === 'partial' && (
                      <p className="text-xs text-[#011c72] font-medium">Partial — continue recording payments above until fully settled.</p>
                    )}
                  </div>
                )}

                {order.status === 'pending' && (
                  <p className="text-xs text-gray-500">Complete Step 1 first</p>
                )}
              </div>

              {/* Step 3: Complete Transaction */}
              <div className={`border rounded-lg p-4 ${
                order.paymentStatus !== 'paid'
                  ? 'border-gray-200 bg-gray-50 opacity-50'
                  : order.status === 'completed'
                  ? 'border-green-200 bg-green-50'
                  : 'border-gray-200'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                      order.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : order.paymentStatus !== 'paid'
                        ? 'bg-gray-100 text-gray-400'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {order.status === 'completed' ? '✓' : '3'}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Step 3: Complete Transaction</p>
                      <p className="text-xs text-gray-500 mt-1">Finalize order and mark as completed</p>
                    </div>
                  </div>
                </div>
                {order.paymentStatus === 'paid' && order.status !== 'completed' && (
                  <button
                    onClick={() => updateOrder({ status: 'completed' })}
                    disabled={saveState === 'saving'}
                    className="w-full px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 text-sm"
                  >
                    {saveState === 'saving' ? 'Processing...' : 'Complete Transaction'}
                  </button>
                )}
                {order.status === 'completed' && (
                  <p className="text-xs text-green-600 font-medium">✓ Transaction Complete</p>
                )}
                {order.paymentStatus !== 'paid' && (
                  <p className="text-xs text-gray-500">Complete Step 2 first</p>
                )}
              </div>
            </div>

            {/* Cancel button - always available */}
            {order.status !== 'completed' && order.status !== 'cancelled' && (
              <button
                onClick={() => updateOrder({ status: 'cancelled' })}
                disabled={saveState === 'saving'}
                className="w-full mt-4 px-4 py-2 rounded-lg border border-red-200 text-red-600 font-medium hover:bg-red-50 disabled:opacity-50 text-sm"
              >
                Cancel Order
              </button>
            )}

            {/* Print Receipt button */}
            <button
              onClick={printReceipt}
              className="w-full mt-3 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 text-sm"
            >
              Print Receipt
            </button>

            {/* Transfer requests for multi-branch orders */}
            {order.transfers && order.transfers.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Branch Transfers</p>
                {(order.transfers as ProductOrderTransfer[]).map((transfer) => (
                  <div key={transfer.id} className="p-3 rounded-lg border border-purple-200 bg-purple-50 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-medium text-gray-800">
                        {transfer.sourceBranchName} → {order.branchName}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        transfer.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : transfer.status === 'transferred'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {transfer.status === 'pending' ? 'Awaiting Transfer'
                          : transfer.status === 'transferred' ? 'In Transit'
                          : '✓ Received'}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {transfer.items.map((item, idx) => (
                        <p key={idx} className="text-xs text-gray-600">
                          {item.quantity}x {item.name}
                        </p>
                      ))}
                    </div>
                    {transfer.status === 'pending' && (user?.role === 'administrator' || user?.branchId === transfer.sourceBranchId) && (
                      <button
                        onClick={() => markTransferred(transfer.id)}
                        disabled={transferSavingId === transfer.id}
                        className="w-full px-3 py-1.5 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50 text-xs"
                      >
                        {transferSavingId === transfer.id ? 'Saving…' : 'Mark as Transferred'}
                      </button>
                    )}
                    {transfer.status === 'transferred' && (user?.role === 'administrator' || user?.branchId === transfer.pickupBranchId) && (
                      <button
                        onClick={() => confirmTransferReceipt(transfer.id)}
                        disabled={transferSavingId === transfer.id}
                        className="w-full px-3 py-1.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 text-xs"
                      >
                        {transferSavingId === transfer.id ? 'Processing…' : 'Confirm Receipt & Add to Inventory'}
                      </button>
                    )}
                    {transfer.status === 'received' && (
                      <p className="text-xs text-green-600 font-medium">✓ Added to {order.branchName} inventory</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 text-sm space-y-2">
              <p className="text-gray-600"><span className="font-medium text-gray-800">Customer:</span> {order.customerName}</p>
              <p className="text-gray-600"><span className="font-medium text-gray-800">Phone:</span> {order.customerPhone}</p>
              <p className="text-gray-600"><span className="font-medium text-gray-800">Pickup Branch:</span> {order.branchName || 'N/A'}</p>
              <p className="text-gray-600"><span className="font-medium text-gray-800">Created:</span> {new Date(order.createdAt).toLocaleString('en-PH')}</p>
              {isAdmin && order.groupId && (
                <p className="text-gray-600"><span className="font-medium text-gray-800">Group ID:</span> <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{order.groupId}</code></p>
              )}
            </div>
          </div>
        </div>

        {showInvoice && order && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Invoice Preview</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{order.orderNumber}</p>
                </div>
                <button
                  onClick={() => setShowInvoice(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Invoice Content */}
              <div className="overflow-y-auto flex-1 p-6">
                {/* Company + Invoice Title */}
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <p className="text-xl font-extrabold text-[#011c72] tracking-widest uppercase">Seatmakers Avenue</p>
                    <p className="text-xs text-gray-500 mt-0.5">Premium Upholstery &amp; Car Accessories</p>
                    <p className="text-xs text-gray-500">{order.branchName || 'N/A'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-black tracking-widest text-gray-900">INVOICE</p>
                    <p className="text-xs text-gray-500 mt-1">{order.orderNumber}</p>
                    <span className="inline-block mt-1 text-[10px] font-bold tracking-widest uppercase border border-[#011c72] text-[#011c72] px-2 py-0.5 rounded">Amount Due</span>
                  </div>
                </div>

                <hr className="border-gray-200 mb-6" />

                {/* Meta: Bill To + Dates */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Bill To</p>
                    <p className="font-semibold text-gray-900">{order.customerName}</p>
                    {order.customerPhone && <p className="text-sm text-gray-500">{order.customerPhone}</p>}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Invoice Date</p>
                      <p className="text-sm font-medium text-gray-800 mt-0.5">
                        {new Date(order.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Due Date</p>
                      <p className="text-sm font-medium text-gray-800 mt-0.5">Upon Receipt</p>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="rounded-xl overflow-hidden border border-gray-200 mb-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-500">Description</th>
                        <th className="text-center px-3 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-500">Qty</th>
                        <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-500">Unit Price</th>
                        <th className="text-right px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-400">{item.sku}</p>
                            {item.sourceBranchName && item.sourceBranchName !== order.branchName && (
                              <p className="text-xs text-[#011c72]">from {item.sourceBranchName}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center text-gray-700">{item.quantity}</td>
                          <td className="px-3 py-3 text-right text-gray-700">₱{item.unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">₱{item.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="flex justify-end mb-6">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Net of VAT</span>
                      <span>₱{(order.totalAmount * (100 / 112)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>VAT (12%)</span>
                      <span>₱{(order.totalAmount * (12 / 112)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-2">
                      <span>Total</span>
                      <span>₱{order.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Amount Due Banner */}
                <div className="bg-[#011c72] text-white rounded-xl px-6 py-4 flex items-center justify-between">
                  <p className="text-sm font-semibold uppercase tracking-widest opacity-90">Total Amount Due</p>
                  <p className="text-2xl font-black">₱{order.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>

                <p className="text-xs text-gray-400 text-center mt-4">Thank you for choosing Seatmakers Avenue!</p>
              </div>

              {/* Modal Footer / Actions */}
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200">
                <button
                  onClick={printInvoice}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Invoice
                </button>
                <button
                  onClick={async () => {
                    await updateOrder({ status: 'processing' });
                    setShowInvoice(false);
                  }}
                  disabled={saveState === 'saving'}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  {saveState === 'saving' ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Confirm &amp; Proceed to Payment
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Timeline</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTimelineTypeClass('created')}`}>Created</span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTimelineTypeClass('status')}`}>Status</span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTimelineTypeClass('payment')}`}>Payment</span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTimelineTypeClass('audit')}`}>Audit</span>
            </div>
          </div>
          {timeline.length === 0 ? (
            <p className="text-gray-500 text-sm">No timeline events yet.</p>
          ) : (
            <div className="space-y-3">
              {timeline.map((event, index) => (
                <div key={`${event.timestamp}-${index}`} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-1 rounded-full font-semibold uppercase tracking-wide ${getTimelineTypeClass(event.type)}`}>
                        {event.type}
                      </span>
                      <p className="text-sm font-medium text-gray-900">{event.title}</p>
                    </div>
                    <span className="text-xs text-gray-500">{event.timestamp ? new Date(event.timestamp).toLocaleString('en-PH') : 'N/A'}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                  {event.by && <p className="text-xs text-gray-500 mt-1">By: {event.by}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
