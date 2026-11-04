'use client';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface CatalogItem {
  id: number;
  title: string;
  description: string;
  tag: string;
  category: string;
  imageUrl: string;
  sortOrder: number;
}

// Gallery filters, matching CATALOG_CATEGORIES on the server (less Promotions); used until the catalog loads
const DEFAULT_CATEGORIES = ['Automotive', 'Sofas', 'Chairs', 'Commercial', 'Custom Projects'];
// Tiles shown at first, and added by each "See More" click
const GALLERY_PAGE = 8;

interface EditState {
  title: string;
  description: string;
  tag: string;
  category: string;
}

function CatalogCard({
  item,
  isAdmin,
  categories,
  onSave,
  onDelete,
  onImageUpload,
}: {
  item: CatalogItem;
  isAdmin: boolean;
  categories: string[];
  onSave: (id: number, data: EditState) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onImageUpload: (id: number, file: File) => Promise<void>;
}) {
  const toForm = (): EditState => ({ title: item.title, description: item.description, tag: item.tag, category: item.category });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>(toForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const imageUrl = item.imageUrl
    ? item.imageUrl.startsWith('/api/') ? `${API_BASE}${item.imageUrl}` : item.imageUrl
    : null;

  async function handleSave() {
    setSaving(true);
    await onSave(item.id, form);
    setSaving(false);
    setEditing(false);
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await onImageUpload(item.id, file);
    setUploading(false);
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#011c72] focus:border-transparent';

  return (
    <div className="flex flex-col">
      {/* Photo tile */}
      <div className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 shadow-sm">
        {imageUrl ? (
          <Image src={imageUrl} alt={item.title} fill sizes="(min-width: 1024px) 25vw, 50vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500" unoptimized />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs text-gray-400">No image</span>
          </div>
        )}

        {/* Details slide up on hover (always shown on touch screens without hover) */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-10 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100 transition-all duration-300">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">{item.category}</p>
          <h3 className="text-white font-bold text-sm sm:text-base leading-snug">{item.title}</h3>
          {item.description && (
            <p className="text-white/80 text-xs mt-1 line-clamp-2 hidden sm:block">{item.description}</p>
          )}
        </div>

        {item.tag && (
          <span className="absolute top-2 left-2 text-[10px] px-2.5 py-1 rounded-full bg-[#011c72] text-white font-semibold uppercase tracking-wider">
            {item.tag}
          </span>
        )}

        {isAdmin && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white text-xs px-2.5 py-1 rounded-md transition-colors z-10"
          >
            {uploading ? 'Uploading…' : 'Change Photo'}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
      </div>

      {/* Admin tools under the tile */}
      {isAdmin && (editing ? (
        <div className="mt-3 flex flex-col gap-2">
          <input className={inputCls} value={form.title} placeholder="Title"
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className={inputCls} value={form.tag} placeholder="Tag (optional)"
              onChange={e => setForm(f => ({ ...f, tag: e.target.value }))} />
          </div>
          <textarea className={`${inputCls} resize-none`} rows={2} value={form.description} placeholder="Description"
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.title.trim()}
              className="flex-1 py-1.5 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-xs font-semibold transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); setForm(toForm()); }}
              className="flex-1 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button onClick={() => { setForm(toForm()); setEditing(true); }}
            className="flex-1 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Edit
          </button>
          <button onClick={() => onDelete(item.id)}
            className="py-1.5 px-3 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

// Shown in the Promotions section instead of the gallery (see CATALOG_CATEGORIES on the server)
const PROMOTIONS = 'Promotions';

// Contact details used across the page
const CONTACT_PHONE = '0933 854 0446';
const CONTACT_EMAIL = 'seatmakersavenue@yahoo.com';
const MAIN_ADDRESS = '275 Col. Boni Serrano, Cubao, Quezon City, Philippines 1109';
const MESSENGER_URL = 'https://www.facebook.com/profile.php?id=61550206889812&rdid=Z6BNtZZYmiR2Ki8Y&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F18pjxJ6QEB%2F#';

interface PublicBranch {
  id: number;
  name: string;
  address: string;
  phone?: string | null;
}

const services = [
  { title: 'Car Seat Covers', desc: 'Made-to-measure seat covers for cars, SUVs, vans and pickups, in leatherette, fabric and other materials.' },
  { title: 'Seat Reupholstery', desc: 'Worn or torn seats restored with new foam, fabric or leather, stitched to your chosen design.' },
  { title: 'Vehicle Interiors', desc: 'Flooring, ceiling (headliner) and door siding work to finish your vehicle’s interior.' },
  { title: 'Sofas & Chairs', desc: 'Upholstery and reupholstery for sofas, dining chairs, office chairs and other home furniture.' },
  { title: 'Commercial Seating', desc: 'Seating for restaurants, offices, salons and other businesses, made to your specifications.' },
  { title: 'Custom Projects', desc: 'Have a design in mind? Bring reference photos or sketches and we’ll build it with you.' },
  { title: 'Premade Products', desc: 'Ready-made seat covers and upholstery products available at our branches.' },
];

const faqs = [
  { q: 'How long does a custom seat cover take?', a: 'Typically 3–7 business days depending on the design and materials chosen.' },
  { q: 'Do you offer installation?', a: 'Yes! Our skilled team handles professional installation at any of our branches.' },
  { q: 'Can I bring my own design?', a: 'Absolutely. Visit a branch or message us with reference photos or sketches — we will do our best to match your vision.' },
  { q: 'What types of vehicles do you cover?', a: 'We work with all types — cars, SUVs, vans, jeeps, and more. Bring your vehicle details when you visit or message us.' },
  { q: 'How do I get a price or follow up on my order?', a: 'For a price, message us on Facebook, call us, or visit any branch. To check on an order, use Track Your Order above with the number on your receipt.' },
];

function SectionHeading({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return (
    <div className="text-center mb-12">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#011c72] mb-3">{kicker}</p>
      <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">{title}</h2>
      <div className="w-16 h-1 bg-[#011c72] mx-auto rounded-full" />
      {subtitle && <p className="text-gray-500 mt-5 text-base max-w-xl mx-auto">{subtitle}</p>}
    </div>
  );
}

function AddItemForm({ categories, initialCategory, heading, onAdd, onCancel }: {
  categories: string[];
  initialCategory: string;
  heading: string;
  onAdd: (form: EditState) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<EditState>({ title: '', description: '', tag: '', category: initialCategory });
  const [submitting, setSubmitting] = useState(false);
  const inputCls = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#011c72]';

  async function submit() {
    if (!form.title.trim()) return;
    setSubmitting(true);
    const ok = await onAdd(form);
    setSubmitting(false);
    if (ok) setForm({ title: '', description: '', tag: '', category: form.category });
  }

  return (
    <div className="mb-10 rounded-xl border border-[#dde6ff] bg-[#eef2ff] p-6 text-left">
      <h3 className="text-sm font-bold text-[#011c72] mb-4 uppercase tracking-wide">{heading}</h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <input className={inputCls} placeholder="Title *" value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        <select className={inputCls} value={form.category}
          onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className={inputCls} placeholder={form.category === PROMOTIONS ? 'Tag (e.g. 20% OFF)' : 'Tag (e.g. New Arrival)'}
          value={form.tag} onChange={e => setForm(f => ({ ...f, tag: e.target.value }))} />
        <textarea className={`sm:col-span-3 ${inputCls} resize-none`} rows={2} placeholder="Description"
          value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>
      <p className="text-xs text-gray-400 mt-2">You can upload a photo after creating the item.</p>
      <div className="flex gap-2 mt-4">
        <button onClick={submit} disabled={submitting || !form.title.trim()}
          className="px-5 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-semibold transition-colors disabled:opacity-50">
          {submitting ? 'Adding…' : 'Add to Website'}
        </button>
        <button onClick={onCancel}
          className="px-5 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-white transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

interface TrackedOrder {
  reference: string;
  kind: 'job_order' | 'product_order';
  kindLabel: string;
  description: string;
  status: 'received' | 'in_progress' | 'ready' | 'done' | 'cancelled';
  statusLabel: string;
  branchName: string | null;
  branchPhone: string | null;
  recordedOn: string | null;
  estimatedCompletion: string | null;
  completedOn: string | null;
  paymentStatus: string;
}

const TRACK_STEPS: { key: TrackedOrder['status']; label: string }[] = [
  { key: 'received', label: 'Received' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'ready', label: 'Ready' },
  { key: 'done', label: 'Done' },
];

function formatTrackDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Look up an order by its receipt number. Read-only: shows status only. */
function TrackOrder() {
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<TrackedOrder | null>(null);

  async function lookUp(e: React.FormEvent) {
    e.preventDefault();
    if (!reference.trim()) { setError('Enter your order number.'); return; }
    setBusy(true); setError(''); setOrder(null);
    try {
      const res = await fetch(`${API_BASE}/api/track-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: reference.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === 'success') setOrder(data.data);
      else setError(data.message || 'Something went wrong. Please try again.');
    } catch {
      setError('Could not reach the server. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = order ? TRACK_STEPS.findIndex(s => s.key === order.status) : -1;
  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#011c72] focus:border-transparent';

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={lookUp} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 sm:items-end">
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1.5">Order number</span>
          <input className={inputCls} value={reference} onChange={e => setReference(e.target.value)}
            placeholder="e.g. JO-BA-2026-0001" autoComplete="off" maxLength={50} />
        </label>
        <button type="submit" disabled={busy}
          className="px-6 py-3 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-semibold transition-colors disabled:opacity-60">
          {busy ? 'Checking…' : 'Track'}
        </button>
        <p className="sm:col-span-2 text-xs text-gray-400">
          Your order number is on the receipt or job order slip you received at the branch.
        </p>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {order && (
        <div className="mt-5 bg-white rounded-xl border border-gray-200 shadow-sm p-6" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{order.kindLabel}</p>
              <p className="text-lg font-bold text-gray-900 break-all">{order.reference}</p>
              {order.description && <p className="text-sm text-gray-500 mt-0.5">{order.description}</p>}
            </div>
            <span className={`shrink-0 px-3 py-1 rounded-full text-sm font-semibold ${
              order.status === 'cancelled' ? 'bg-red-100 text-red-700'
                : order.status === 'ready' || order.status === 'done' ? 'bg-green-100 text-green-700'
                : 'bg-[#eef2ff] text-[#011c72]'}`}>
              {order.statusLabel}
            </span>
          </div>

          {order.status !== 'cancelled' && (
            <ol className="mt-6 grid grid-cols-4 gap-1">
              {TRACK_STEPS.map((s, i) => (
                <li key={s.key} className="flex flex-col items-center text-center">
                  <span className={`h-1.5 w-full rounded-full ${i <= stepIndex ? 'bg-[#011c72]' : 'bg-gray-200'}`} />
                  <span className={`mt-2 text-[11px] sm:text-xs ${i <= stepIndex ? 'font-semibold text-[#011c72]' : 'text-gray-400'}`}>{s.label}</span>
                </li>
              ))}
            </ol>
          )}

          <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {order.branchName && (<div><dt className="text-gray-400">Branch</dt><dd className="text-gray-900 font-medium">{order.branchName}</dd></div>)}
            {order.recordedOn && (<div><dt className="text-gray-400">Recorded on</dt><dd className="text-gray-900 font-medium">{formatTrackDate(order.recordedOn)}</dd></div>)}
            {order.estimatedCompletion && order.status !== 'done' && order.status !== 'cancelled' && (
              <div><dt className="text-gray-400">Expected completion</dt><dd className="text-gray-900 font-medium">{formatTrackDate(order.estimatedCompletion)}</dd></div>
            )}
            {order.completedOn && (<div><dt className="text-gray-400">Completed on</dt><dd className="text-gray-900 font-medium">{formatTrackDate(order.completedOn)}</dd></div>)}
            <div><dt className="text-gray-400">Payment</dt><dd className="text-gray-900 font-medium">{order.paymentStatus}</dd></div>
          </dl>

          <p className="mt-5 text-xs text-gray-500">
            Questions about this order? Contact {order.branchName || 'the branch'}
            {order.branchPhone ? <> at <a className="text-[#011c72] hover:underline" href={`tel:${order.branchPhone.replace(/[^0-9+]/g, '')}`}>{order.branchPhone}</a></> : ''}
            {' '}or message us on Facebook.
          </p>
        </div>
      )}
    </div>
  );
}

/** The public website: information about the business only. Nothing here orders, books or reserves. */
export default function LandingPage() {
  const { can } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const isAdmin = can('catalog.manage');

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Which section's "add" form is open (gallery or promotions)
  const [addingIn, setAddingIn] = useState<'gallery' | 'promotions' | null>(null);
  const [heroTitle, setHeroTitle] = useState('Crafted for Comfort. Built to Last.');
  const [heroDesc, setHeroDesc] = useState('Premium seat covers, upholstery and interior work for vehicles and furniture — made to fit, built to last.');
  const [editingHero, setEditingHero] = useState(false);
  const [heroForm, setHeroForm] = useState({ title: heroTitle, desc: heroDesc });
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [categories, setCategories] = useState<string[]>([...DEFAULT_CATEGORIES, PROMOTIONS]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(GALLERY_PAGE);
  const [branchList, setBranchList] = useState<PublicBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  useEffect(() => {
    fetchCatalog();
    fetchBranches();
  }, []);

  async function fetchCatalog() {
    try {
      const res = await fetch(`${API_BASE}/api/catalog`);
      const data = await res.json();
      if (data.status === 'success') {
        setItems(data.data);
        if (Array.isArray(data.categories)) setCategories(data.categories);
      }
    } catch {
      // silently fail — catalog just shows empty
    } finally {
      setLoading(false);
    }
  }

  async function fetchBranches() {
    try {
      const res = await fetch(`${API_BASE}/api/settings/branches/public`);
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data)) setBranchList(data.data);
    } catch {
      // the main shop's address is shown instead
    } finally {
      setBranchesLoading(false);
    }
  }

  async function handleSave(id: number, form: EditState) {
    const token = getAuthToken();
    const res = await fetch(`${API_BASE}/api/catalog/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: form.title, description: form.description, tag: form.tag, category: form.category }),
    });
    const data = await res.json();
    if (data.status === 'success') {
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...data.data, imageUrl: data.data.imageUrl } : i));
    }
  }

  async function handleDelete(id: number) {
    const ok = await confirm({
      title: 'Remove this item?',
      message: 'It will no longer appear on the website.',
      warning: 'This cannot be undone.',
      confirmLabel: 'Remove item',
      variant: 'danger',
    });
    if (!ok) return;
    const token = getAuthToken();
    const res = await fetch(`${API_BASE}/api/catalog/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.status === 'success') setItems(prev => prev.filter(i => i.id !== id));
  }

  async function handleImageUpload(id: number, file: File) {
    const token = getAuthToken();
    const form = new FormData();
    form.append('image', file);
    const res = await fetch(`${API_BASE}/api/catalog/${id}/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json();
    if (data.status === 'success') {
      setItems(prev => prev.map(i => i.id === id ? { ...i, imageUrl: data.imageUrl } : i));
    }
  }

  async function handleAddItem(form: EditState) {
    const token = getAuthToken();
    const res = await fetch(`${API_BASE}/api/catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: form.title, description: form.description, tag: form.tag, category: form.category }),
    });
    const data = await res.json();
    if (data.status !== 'success') return false;
    setItems(prev => [...prev, data.data]);
    setAddingIn(null);
    return true;
  }

  const promotions = items.filter(i => i.category === PROMOTIONS);
  const galleryItems = items.filter(i => i.category !== PROMOTIONS);
  const galleryCategories = categories.filter(c => c !== PROMOTIONS);
  const shownGallery = categoryFilter ? galleryItems.filter(i => i.category === categoryFilter) : galleryItems;

  const cardProps = { isAdmin, categories, onSave: handleSave, onDelete: handleDelete, onImageUpload: handleImageUpload };
  const addButtonCls = 'mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-semibold transition-colors shadow-md';
  const plusIcon = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* Floating Messenger Button */}
      <a
        href={MESSENGER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#0084ff] hover:bg-[#0073e6] text-white px-4 py-3 rounded-full shadow-lg transition-all hover:scale-105"
        aria-label="Message us on Facebook"
      >
        <MessengerIcon className="w-5 h-5 flex-shrink-0" />
        <span className="text-sm font-semibold hidden sm:inline">Message Us</span>
      </a>

      {/* ── Hero ── */}
      <section id="home" className="scroll-mt-16 relative bg-gradient-to-br from-gray-900 via-gray-800 to-[#010b30] min-h-[560px] flex items-center">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_left,_#3b82f6_0%,_transparent_60%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 text-center w-full">
          {editingHero && isAdmin ? (
            <div className="max-w-2xl mx-auto space-y-4">
              <input
                className="w-full rounded-lg border border-white/20 bg-white/10 text-white placeholder-white/50 px-4 py-3 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-[#011c72]"
                value={heroForm.title}
                onChange={e => setHeroForm(f => ({ ...f, title: e.target.value }))}
              />
              <textarea
                rows={3}
                className="w-full rounded-lg border border-white/20 bg-white/10 text-white/80 placeholder-white/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#011c72] resize-none"
                value={heroForm.desc}
                onChange={e => setHeroForm(f => ({ ...f, desc: e.target.value }))}
              />
              <div className="flex justify-center gap-3">
                <button onClick={() => { setHeroTitle(heroForm.title); setHeroDesc(heroForm.desc); setEditingHero(false); }} className="px-6 py-2 rounded-lg bg-[#011c72] text-white text-sm font-semibold hover:bg-[#01268c] transition-colors">Save</button>
                <button onClick={() => { setHeroForm({ title: heroTitle, desc: heroDesc }); setEditingHero(false); }} className="px-6 py-2 rounded-lg border border-white/30 text-white/80 text-sm hover:bg-white/10 transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a6aff] font-semibold mb-4">Automotive &amp; Furniture Upholstery</p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6 max-w-3xl mx-auto">
                {heroTitle}
              </h1>
              <p className="text-gray-300 text-lg leading-relaxed mb-10 max-w-2xl mx-auto">{heroDesc}</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href="#gallery"
                  className="inline-flex items-center justify-center px-8 py-4 rounded-md bg-[#011c72] hover:bg-[#01268c] text-white font-semibold text-sm uppercase tracking-wide transition-colors shadow-lg"
                >
                  See Our Work
                </a>
                <a
                  href="#contact"
                  className="inline-flex items-center justify-center px-8 py-4 rounded-md border-2 border-white/40 hover:border-white/70 text-white font-semibold text-sm uppercase tracking-wide transition-colors"
                >
                  Contact Us
                </a>
              </div>
              {isAdmin && (
                <button onClick={() => { setHeroForm({ title: heroTitle, desc: heroDesc }); setEditingHero(true); }} className="mt-8 text-xs text-white/30 hover:text-white/60 underline underline-offset-2 transition-colors">
                  Edit hero text
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Track Your Order ── */}
      <section id="track" className="scroll-mt-16 py-16 bg-gray-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading kicker="Already ordered?" title="Track Your Order"
            subtitle="Enter your order number to see where your order is." />
          <TrackOrder />
        </div>
      </section>

      {/* ── About Us ── */}
      <section id="about" className="scroll-mt-16 py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading kicker="About Us" title="Why Choose Seatmakers Avenue?"
            subtitle="We make and restore seats and interiors for vehicles, homes and businesses — quality craftsmanship, trusted by hundreds of customers across the city." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
                ),
                title: 'Premium Quality',
                desc: 'Only the best materials — durable, comfortable, and built to last.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
                ),
                title: 'Custom Made',
                desc: 'Every piece tailored to fit your exact vehicle or furniture and your style.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                ),
                title: 'Fast Turnaround',
                desc: 'Most work completed in 3–7 business days so you are back on the road fast.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                ),
                title: 'Multiple Branches',
                desc: 'Conveniently located branches across the city for easy drop-off and pickup.',
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl border border-gray-100 shadow-md p-7 text-center hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
                <div className="w-14 h-14 rounded-full bg-[#eef2ff] text-[#011c72] flex items-center justify-center mx-auto mb-5 group-hover:bg-[#011c72] group-hover:text-white transition-colors duration-300">
                  {item.icon}
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-base">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Products & Services ── */}
      <section id="products" className="scroll-mt-16 py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading kicker="What We Do" title="Products & Services"
            subtitle="For prices and availability, message us or visit any of our branches." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {services.map(s => (
              <div key={s.title} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                <div className="w-10 h-1 bg-[#011c72] rounded-full mb-4" />
                <h3 className="font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Promotions ── */}
      <section id="promotions" className="scroll-mt-16 py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <SectionHeading kicker="Promotions" title="Current Offers"
              subtitle="Featured products and limited-time offers. Visit a branch or message us to take advantage of them." />
            {isAdmin && addingIn !== 'promotions' && (
              <button onClick={() => setAddingIn('promotions')} className={`${addButtonCls} -mt-4 mb-10`}>
                {plusIcon}
                Add Promotion
              </button>
            )}
          </div>
          {addingIn === 'promotions' && isAdmin && (
            <AddItemForm categories={categories} initialCategory={PROMOTIONS} heading="New Promotion"
              onAdd={handleAddItem} onCancel={() => setAddingIn(null)} />
          )}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
              {[...Array(4)].map((_, i) => <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : promotions.length === 0 ? (
            <div className="max-w-xl mx-auto text-center rounded-xl border border-dashed border-gray-300 px-6 py-10">
              <p className="text-gray-600 font-medium">No promotions running right now.</p>
              <p className="text-sm text-gray-400 mt-1">
                Follow us on <a href={MESSENGER_URL} target="_blank" rel="noopener noreferrer" className="text-[#011c72] hover:underline">Facebook</a> for upcoming offers.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
              {promotions.map(item => <CatalogCard key={item.id} item={item} {...cardProps} />)}
            </div>
          )}
        </div>
      </section>

      {/* ── Gallery ── */}
      <section id="gallery" className="scroll-mt-16 py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#4a6aff] mb-3">Our Work</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Project <span className="text-[#011c72]">Gallery</span>
            </h2>
            <p className="text-gray-500 mt-4 text-base max-w-xl mx-auto leading-relaxed">
              Completed projects and available designs showcasing our craftsmanship and attention to detail.
            </p>
            {isAdmin && addingIn !== 'gallery' && (
              <button onClick={() => setAddingIn('gallery')} className={addButtonCls}>
                {plusIcon}
                Add Item
              </button>
            )}
          </div>

          {addingIn === 'gallery' && isAdmin && (
            <AddItemForm categories={categories} initialCategory={galleryCategories[0] || DEFAULT_CATEGORIES[0]}
              heading="New Gallery Item" onAdd={handleAddItem} onCancel={() => setAddingIn(null)} />
          )}

          {/* Category filters */}
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-10">
            {[null, ...galleryCategories].map(c => {
              const active = categoryFilter === c;
              return (
                <button
                  key={c ?? 'all'}
                  onClick={() => { setCategoryFilter(c); setVisibleCount(GALLERY_PAGE); }}
                  className={`px-4 sm:px-5 py-2 rounded-full text-sm font-semibold border transition-colors ${
                    active
                      ? 'bg-[#011c72] border-[#011c72] text-white shadow-sm'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-[#011c72] hover:text-[#011c72]'
                  }`}
                >
                  {c ?? 'All'}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
              {[...Array(GALLERY_PAGE)].map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : shownGallery.length === 0 ? (
            <div className="text-center py-20 text-gray-300">
              <svg className="w-14 h-14 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <p className="text-lg font-medium text-gray-400">
                {categoryFilter ? `No ${categoryFilter.toLowerCase()} projects yet.` : 'No gallery items yet.'}
              </p>
              {isAdmin && <p className="text-sm mt-1 text-gray-400">Click &ldquo;Add Item&rdquo; to get started.</p>}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                {shownGallery.slice(0, visibleCount).map(item => <CatalogCard key={item.id} item={item} {...cardProps} />)}
              </div>
              {shownGallery.length > visibleCount && (
                <div className="text-center mt-10">
                  <button
                    onClick={() => setVisibleCount(n => n + GALLERY_PAGE)}
                    className="inline-flex items-center gap-2 px-7 py-3 rounded-md bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-semibold shadow-md transition-colors"
                  >
                    See More Projects
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="process" className="scroll-mt-16 py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading kicker="Our Process" title="How It Works" subtitle="Three simple steps to your perfect seats" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-10 left-[calc(33%+1rem)] right-[calc(33%+1rem)] h-0.5 bg-[#dde6ff] z-0" />
            {[
              { step: '01', title: 'Visit or Message Us', desc: 'Drop by any branch, call, or message us on Facebook with what you need.' },
              { step: '02', title: 'Get a Price', desc: 'Our team checks your vehicle or furniture, helps you choose materials, and tells you the price.' },
              { step: '03', title: 'Pick Up & Enjoy', desc: 'We get to work and let you know when it is ready at your branch.' },
            ].map((item) => (
              <div key={item.step} className="relative z-10 bg-white rounded-xl shadow-md p-8 text-center flex flex-col items-center border border-gray-100">
                <div className="w-16 h-16 rounded-full bg-[#011c72] text-white font-bold text-xl flex items-center justify-center mb-5 shadow-md">
                  {item.step}
                </div>
                <h3 className="font-bold text-gray-900 mb-3 text-lg">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Branches ── */}
      <section id="branches" className="scroll-mt-16 py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading kicker="Visit Us" title="Our Branches" subtitle="Drop by any branch to see materials, get a price, or pick up your order." />
          {branchesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...Array(3)].map((_, i) => <div key={i} className="h-36 rounded-xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {(branchList.length > 0 ? branchList : [{ id: 0, name: 'Seatmakers Avenue', address: MAIN_ADDRESS, phone: CONTACT_PHONE }]).map(b => (
                <div key={b.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col">
                  <h3 className="font-bold text-gray-900 mb-3">{b.name}</h3>
                  <p className="flex items-start gap-2.5 text-sm text-gray-600">
                    <PinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#011c72]" />
                    <span className="break-words min-w-0">{b.address}</span>
                  </p>
                  {b.phone && (
                    <a href={`tel:${b.phone.replace(/[^0-9+]/g, '')}`} className="mt-2 flex items-center gap-2.5 text-sm text-gray-600 hover:text-[#011c72]">
                      <PhoneIcon className="w-4 h-4 flex-shrink-0 text-[#011c72]" />
                      {b.phone}
                    </a>
                  )}
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="mt-auto pt-4 text-sm font-semibold text-[#011c72] hover:underline">
                    View on map →
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="scroll-mt-16 py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading kicker="FAQ" title="Frequently Asked Questions" subtitle="Good to know before you visit" />
          <div className="max-w-3xl mx-auto space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900 text-sm pr-4">{faq.q}</span>
                  <svg
                    className={`w-5 h-5 text-[#011c72] flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-sm text-gray-500 border-t border-gray-100 pt-4 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact Us ── */}
      <section id="contact" className="scroll-mt-16 py-20 bg-[#011c72]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Contact Us</h2>
          <p className="text-white/80 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Questions, prices or follow-ups — reach us any of these ways.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto text-left">
            <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`} className="flex items-center gap-3 rounded-xl bg-white/10 hover:bg-white/15 px-5 py-4 text-white transition-colors">
              <PhoneIcon className="w-5 h-5 flex-shrink-0" />
              <span className="min-w-0"><span className="block text-xs text-white/60 uppercase tracking-wider">Call</span>{CONTACT_PHONE}</span>
            </a>
            <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-3 rounded-xl bg-white/10 hover:bg-white/15 px-5 py-4 text-white transition-colors">
              <MailIcon className="w-5 h-5 flex-shrink-0" />
              <span className="min-w-0 break-all"><span className="block text-xs text-white/60 uppercase tracking-wider">Email</span>{CONTACT_EMAIL}</span>
            </a>
            <a href={MESSENGER_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl bg-white/10 hover:bg-white/15 px-5 py-4 text-white transition-colors">
              <MessengerIcon className="w-5 h-5 flex-shrink-0" />
              <span className="min-w-0"><span className="block text-xs text-white/60 uppercase tracking-wider">Messenger</span>Message us on Facebook</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 mb-10">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 bg-[#011c72] rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <p className="text-base font-bold">Seatmakers Avenue</p>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">Premium automotive and furniture upholstery and custom seat covers. Crafted with care.</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">Quick Links</p>
              <ul className="space-y-3">
                {[
                  { label: 'Track Your Order', href: '#track' },
                  { label: 'Products & Services', href: '#products' },
                  { label: 'Promotions', href: '#promotions' },
                  { label: 'Gallery', href: '#gallery' },
                  { label: 'Branches', href: '#branches' },
                ].map(link => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-gray-400 hover:text-[#4a6aff] transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">Contact Us</p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-sm text-gray-400">
                  <PhoneIcon className="w-4 h-4 flex-shrink-0 text-[#4a6aff]" />
                  {CONTACT_PHONE}
                </li>
                <li className="flex items-center gap-3 text-sm text-gray-400 break-all">
                  <MailIcon className="w-4 h-4 flex-shrink-0 text-[#4a6aff]" />
                  {CONTACT_EMAIL}
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-400">
                  <PinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#4a6aff]" />
                  {MAIN_ADDRESS}
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center">
            <p className="text-sm text-gray-500">© {new Date().getFullYear()} Seatmakers Avenue. All rights reserved.</p>
          </div>
        </div>
      </footer>
      {confirmDialog}
    </div>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  );
}

function MessengerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.908 1.438 5.504 3.688 7.205V22l3.37-1.85c.9.25 1.853.385 2.942.385 5.523 0 10-4.145 10-9.243S17.523 2 12 2zm1.006 12.44l-2.545-2.715-4.97 2.715 5.467-5.8 2.608 2.715 4.908-2.715-5.468 5.8z" />
    </svg>
  );
}
