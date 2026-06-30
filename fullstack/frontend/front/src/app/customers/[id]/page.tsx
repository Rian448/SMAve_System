'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api, type Customer, type CustomerOrderSummary } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  voided: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-100 text-red-800',
};

export default function CustomerProfilePage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Editable profile fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  // Discount & promo
  const [discountPercent, setDiscountPercent] = useState<string>('');
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState<string>('');

  useEffect(() => {
    api.customers.get(id)
      .then((res) => {
        const c = res.data!;
        setCustomer(c);
        setName(c.name);
        setPhone(c.phone);
        setEmail(c.email);
        setAddress(c.address);
        setNotes(c.notes);
        setDiscountPercent(c.discountPercent != null ? String(c.discountPercent) : '');
        setPromoCode(c.promoCode || '');
        setPromoDiscount(c.promoDiscount != null ? String(c.promoDiscount) : '');
        setOrders(c.orderHistory || []);
      })
      .catch(() => setError('Customer not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.customers.update(id, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        notes: notes.trim(),
        discountPercent: discountPercent !== '' ? Number(discountPercent) : null,
        promoCode: promoCode.trim() || null,
        promoDiscount: promoDiscount !== '' ? Number(promoDiscount) : null,
      });
      setCustomer(res.data!);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent text-sm';

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  if (error && !customer) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-red-500 text-sm">{error}</div>;

  const totalSpend = orders.reduce((s, o) => s + (o.totalPrice || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Back + header */}
        <div>
          <button onClick={() => router.back()}
            className="inline-flex items-center text-gray-500 hover:text-gray-800 text-sm mb-4 transition-colors">
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{customer?.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">Customer since {customer?.createdAt || '—'}</p>
            </div>
            <div className="flex items-center gap-3">
              {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 rounded-xl bg-[#011c72] text-white text-sm font-medium hover:bg-[#022494] transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Orders', value: orders.length },
            { label: 'Total Spend', value: `₱${totalSpend.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            { label: 'Loyalty Discount', value: discountPercent ? `${discountPercent}%` : 'None' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Profile */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Profile</h2>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Full Name <span className="text-red-500">*</span></label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Address</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent text-sm resize-none" />
            </div>
          </div>

          {/* Discount & Promo */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Discount &amp; Promo</h2>

            <div className="bg-[#eef1fb] border border-[#c7d2f5] rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-[#011c72]">Loyalty Discount</p>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    placeholder="0"
                    className="w-full pr-8 pl-3 py-2 rounded-lg border border-[#c7d2f5] bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent text-sm"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
                {discountPercent && (
                  <button type="button" onClick={() => setDiscountPercent('')}
                    className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>
              <p className="text-xs text-[#011c72]">Applied automatically when this customer is linked to a new order.</p>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-purple-800">Promo Code</p>
              <div>
                <label className="block text-xs text-purple-700 mb-1">Code</label>
                <input type="text" value={promoCode} onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="e.g. LOYAL2025"
                  className="w-full px-3 py-2 rounded-lg border border-purple-200 bg-white text-gray-900 focus:ring-2 focus:ring-purple-400 focus:border-transparent text-sm" />
              </div>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <label className="block text-xs text-purple-700 mb-1">Promo Discount</label>
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={promoDiscount}
                    onChange={(e) => setPromoDiscount(e.target.value)}
                    placeholder="0"
                    className="w-full pr-8 pl-3 py-2 rounded-lg border border-purple-200 bg-white text-gray-900 focus:ring-2 focus:ring-purple-400 focus:border-transparent text-sm"
                  />
                  <span className="absolute right-3 bottom-2 text-gray-400 text-sm">%</span>
                </div>
              </div>
              {(promoCode || promoDiscount) && (
                <button type="button" onClick={() => { setPromoCode(''); setPromoDiscount(''); }}
                  className="text-xs text-red-500 hover:text-red-700">Clear promo</button>
              )}
            </div>
          </div>
        </div>

        {/* Order History */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Order History</h2>
          </div>
          {orders.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-10">No orders yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Job Order #</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Date</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Total</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o) => (
                  <tr key={o.id}
                    onClick={() => router.push(`/sales/${o.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-5 py-3 font-medium text-[#011c72]">{o.jobOrderId}</td>
                    <td className="px-5 py-3 text-gray-600">{o.createdAt}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-600'}`}>
                        {o.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-900">
                      ₱{o.totalPrice.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      ₱{o.balance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </main>
    </div>
  );
}
