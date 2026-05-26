'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface CatalogItem {
  id: number;
  title: string;
  description: string;
  tag: string;
  imageUrl: string;
  sortOrder: number;
}

interface EditState {
  title: string;
  description: string;
  tag: string;
}

function CatalogCard({
  item,
  isAdmin,
  onSave,
  onDelete,
  onImageUpload,
}: {
  item: CatalogItem;
  isAdmin: boolean;
  onSave: (id: number, data: EditState) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onImageUpload: (id: number, file: File) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>({ title: item.title, description: item.description, tag: item.tag });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const imageUrl = item.imageUrl
    ? item.imageUrl.startsWith('http') || item.imageUrl.startsWith('/')
      ? item.imageUrl.startsWith('/api/')
        ? `${API_BASE}${item.imageUrl}`
        : item.imageUrl
      : item.imageUrl
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

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="relative h-56 bg-zinc-100 dark:bg-zinc-800">
        {imageUrl ? (
          <Image src={imageUrl} alt={item.title} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-2">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span className="text-xs">No image</span>
          </div>
        )}
        {isAdmin && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1 rounded-lg transition-colors"
          >
            {uploading ? 'Uploading…' : 'Change Photo'}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
        {item.tag && !editing && (
          <span className="absolute top-2 left-2 text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
            {item.tag}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        {editing ? (
          <>
            <input
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Title"
            />
            <input
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={form.tag}
              onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}
              placeholder="Tag (e.g. New Arrival, Best Seller)"
            />
            <textarea
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              rows={3}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description"
            />
            <div className="flex gap-2 mt-auto">
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="flex-1 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setForm({ title: item.title, description: item.description, tag: item.tag }); }}
                className="flex-1 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white leading-tight">{item.title}</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 flex-1">{item.description || <span className="italic">No description</span>}</p>
            {isAdmin && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => { setForm({ title: item.title, description: item.description, tag: item.tag }); setEditing(true); }}
                  className="flex-1 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  className="py-1.5 px-3 rounded-lg border border-red-200 dark:border-red-900 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Remove
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const faqs = [
  { q: 'How long does a custom seat cover take?', a: 'Typically 3–7 business days depending on the design and materials chosen.' },
  { q: 'Do you offer installation?', a: 'Yes! Our skilled team handles professional installation at any of our branches.' },
  { q: 'Can I bring my own design?', a: 'Absolutely. Book an appointment and bring reference photos or sketches — we will do our best to match your vision.' },
  { q: 'What types of vehicles do you cover?', a: 'We work with all types — cars, SUVs, vans, jeeps, and more. Bring your vehicle details when booking.' },
  { q: 'How do I track my order?', a: 'After placing your order, log in and go to "My Orders" to see real-time status updates.' },
];

export default function LandingPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrator';

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState<EditState>({ title: '', description: '', tag: '' });
  const [submitting, setSubmitting] = useState(false);
  const [heroTitle, setHeroTitle] = useState('Crafted for comfort. Built to last.');
  const [heroDesc, setHeroDesc] = useState('Explore our collection of premium seat covers, upholstery styles, and interior designs — each made to fit your vehicle perfectly.');
  const [editingHero, setEditingHero] = useState(false);
  const [heroForm, setHeroForm] = useState({ title: heroTitle, desc: heroDesc });
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [cardsPerView, setCardsPerView] = useState(3);

  useEffect(() => {
    fetchCatalog();
  }, []);

  useEffect(() => {
    function updateCardsPerView() {
      if (window.innerWidth < 640) setCardsPerView(1);
      else if (window.innerWidth < 1024) setCardsPerView(2);
      else setCardsPerView(3);
    }
    updateCardsPerView();
    window.addEventListener('resize', updateCardsPerView);
    return () => window.removeEventListener('resize', updateCardsPerView);
  }, []);

  useEffect(() => {
    const maxIdx = Math.max(0, items.length - cardsPerView);
    if (carouselIndex > maxIdx) setCarouselIndex(maxIdx);
  }, [items.length, cardsPerView]);

  async function fetchCatalog() {
    try {
      const res = await fetch(`${API_BASE}/api/catalog`);
      const data = await res.json();
      if (data.status === 'success') setItems(data.data);
    } catch {
      // silently fail — catalog just shows empty
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(id: number, form: EditState) {
    const token = getAuthToken();
    const res = await fetch(`${API_BASE}/api/catalog/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: form.title, description: form.description, tag: form.tag }),
    });
    const data = await res.json();
    if (data.status === 'success') {
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...data.data, imageUrl: data.data.imageUrl } : i));
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this item from the catalog?')) return;
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

  async function handleAddItem() {
    if (!newForm.title.trim()) return;
    setSubmitting(true);
    const token = getAuthToken();
    const res = await fetch(`${API_BASE}/api/catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: newForm.title, description: newForm.description, tag: newForm.tag }),
    });
    const data = await res.json();
    if (data.status === 'success') {
      setItems(prev => [...prev, data.data]);
      setNewForm({ title: '', description: '', tag: '' });
      setAdding(false);
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">

      {/* Floating WhatsApp Button */}
      <a
        href="https://wa.me/639XXXXXXXXX"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-full shadow-xl transition-all hover:scale-105"
        aria-label="Chat with us on WhatsApp"
      >
        <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        <span className="text-sm font-semibold hidden sm:inline">Chat with Us</span>
      </a>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Hero */}
        <section className="mb-14">
          <div className="rounded-3xl bg-gradient-to-br from-amber-600 to-amber-700 dark:from-amber-700 dark:to-amber-900 p-10 sm:p-14 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            <div className="relative max-w-2xl">
              <p className="text-xs uppercase tracking-[0.25em] text-amber-200 font-semibold mb-3">Premium Automotive Upholstery</p>

              {editingHero && isAdmin ? (
                <div className="space-y-3">
                  <input
                    className="w-full rounded-xl bg-white/20 text-white placeholder-white/60 px-4 py-2 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-white/50"
                    value={heroForm.title}
                    onChange={e => setHeroForm(f => ({ ...f, title: e.target.value }))}
                  />
                  <textarea
                    rows={3}
                    className="w-full rounded-xl bg-white/20 text-white placeholder-white/60 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 resize-none"
                    value={heroForm.desc}
                    onChange={e => setHeroForm(f => ({ ...f, desc: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { setHeroTitle(heroForm.title); setHeroDesc(heroForm.desc); setEditingHero(false); }} className="px-4 py-2 rounded-lg bg-white text-amber-700 text-sm font-semibold hover:bg-amber-50 transition-colors">Save</button>
                    <button onClick={() => { setHeroForm({ title: heroTitle, desc: heroDesc }); setEditingHero(false); }} className="px-4 py-2 rounded-lg bg-white/20 text-white text-sm hover:bg-white/30 transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-3xl sm:text-4xl font-bold text-white leading-snug">{heroTitle}</h1>
                  <p className="mt-4 text-amber-100 text-base leading-relaxed">{heroDesc}</p>
                  <div className="mt-8 flex flex-col sm:flex-row gap-3">
                    <a href="#catalog" className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-white text-amber-700 font-semibold hover:bg-amber-50 transition-colors text-sm">
                      Browse Catalog
                    </a>
                    <Link href="/place-order?tab=appointment" className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-white/40 text-white font-semibold hover:bg-white/10 transition-colors text-sm">
                      Book Appointment
                    </Link>
                  </div>
                  {isAdmin && (
                    <button onClick={() => { setHeroForm({ title: heroTitle, desc: heroDesc }); setEditingHero(true); }} className="mt-4 text-xs text-amber-200 hover:text-white underline underline-offset-2 transition-colors">
                      Edit hero text
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* Why Choose Us */}
        <section className="mb-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Why Choose Seatmakers Avenue?</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm">Quality craftsmanship, trusted by hundreds of vehicle owners</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: (
                  <svg className="w-7 h-7 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
                ),
                title: 'Premium Quality',
                desc: 'Only the best materials — durable, comfortable, and built to last.',
              },
              {
                icon: (
                  <svg className="w-7 h-7 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
                ),
                title: 'Custom Made',
                desc: 'Every piece tailored to fit your exact vehicle and style preference.',
              },
              {
                icon: (
                  <svg className="w-7 h-7 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                ),
                title: 'Fast Turnaround',
                desc: 'Most orders completed in 3–7 business days so you are back on the road fast.',
              },
              {
                icon: (
                  <svg className="w-7 h-7 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                ),
                title: 'Multiple Branches',
                desc: 'Conveniently located branches across the city for easy drop-off and pickup.',
              },
            ].map((item) => (
              <div key={item.title} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 text-center hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-4">
                  {item.icon}
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section className="mb-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">How It Works</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm">Three simple steps to get your perfect seat covers</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            <div className="hidden md:block absolute top-9 left-[calc(33%+1rem)] right-[calc(33%+1rem)] h-0.5 bg-amber-200 dark:bg-amber-800 z-0" />
            {[
              {
                step: '01',
                title: 'Browse & Book',
                desc: 'Explore our catalog or book an appointment for a custom order consultation.',
                href: '#catalog',
                cta: 'See Catalog',
              },
              {
                step: '02',
                title: 'Get Quoted',
                desc: 'Our team reviews your request, prepares a quote, and confirms the appointment.',
                href: '/place-order?tab=appointment',
                cta: 'Book Now',
              },
              {
                step: '03',
                title: 'Pick Up & Enjoy',
                desc: 'Come to your chosen branch when your order is ready and drive away in style.',
                href: '/my-orders',
                cta: 'Track Orders',
              },
            ].map((item) => (
              <div key={item.step} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-7 text-center relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-bold text-xl flex items-center justify-center mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4">{item.desc}</p>
                <a href={item.href} className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline mt-auto">
                  {item.cta} →
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* Catalog Section */}
        <section id="catalog">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Our Catalog</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Browse our available styles and designs.</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Item
              </button>
            )}
          </div>

          {/* Add Item Form */}
          {adding && isAdmin && (
            <div className="mb-8 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-6">
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-4">New Catalog Item</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Title *"
                  value={newForm.title}
                  onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                />
                <input
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Tag (e.g. New Arrival)"
                  value={newForm.tag}
                  onChange={e => setNewForm(f => ({ ...f, tag: e.target.value }))}
                />
                <textarea
                  className="sm:col-span-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                  rows={2}
                  placeholder="Description"
                  value={newForm.description}
                  onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">You can upload a photo after creating the item.</p>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleAddItem}
                  disabled={submitting || !newForm.title.trim()}
                  className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Adding…' : 'Add to Catalog'}
                </button>
                <button
                  onClick={() => { setAdding(false); setNewForm({ title: '', description: '', tag: '' }); }}
                  className="px-5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Carousel */}
          {loading ? (
            <div className="flex gap-5 overflow-hidden">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex-shrink-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden" style={{ width: `calc(${100 / cardsPerView}% - 1.25rem)` }}>
                  <div className="h-56 bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse w-full" />
                    <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-zinc-400 dark:text-zinc-600">
              <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <p className="text-lg font-medium">No catalog items yet.</p>
              {isAdmin && <p className="text-sm mt-1">Click &ldquo;Add Item&rdquo; to get started.</p>}
            </div>
          ) : (() => {
            const maxIdx = Math.max(0, items.length - cardsPerView);
            const cardWidthPct = 100 / cardsPerView;
            return (
              <div>
                <div className="relative">
                  {/* Prev button */}
                  <button
                    onClick={() => setCarouselIndex(i => Math.max(0, i - 1))}
                    disabled={carouselIndex === 0}
                    className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-md flex items-center justify-center text-zinc-700 dark:text-zinc-300 hover:bg-amber-50 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    aria-label="Previous"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>

                  {/* Sliding track */}
                  <div className="overflow-hidden">
                    <div
                      className="flex transition-transform duration-300 ease-in-out"
                      style={{ transform: `translateX(-${carouselIndex * cardWidthPct}%)` }}
                    >
                      {items.map(item => (
                        <div
                          key={item.id}
                          className="flex-shrink-0 px-3"
                          style={{ width: `${cardWidthPct}%` }}
                        >
                          <CatalogCard
                            item={item}
                            isAdmin={isAdmin}
                            onSave={handleSave}
                            onDelete={handleDelete}
                            onImageUpload={handleImageUpload}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Next button */}
                  <button
                    onClick={() => setCarouselIndex(i => Math.min(maxIdx, i + 1))}
                    disabled={carouselIndex >= maxIdx}
                    className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-md flex items-center justify-center text-zinc-700 dark:text-zinc-300 hover:bg-amber-50 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    aria-label="Next"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>

                {/* Dot indicators */}
                {items.length > cardsPerView && (
                  <div className="flex justify-center gap-2 mt-6">
                    {Array.from({ length: maxIdx + 1 }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCarouselIndex(i)}
                        className={`rounded-full transition-all duration-200 ${i === carouselIndex ? 'w-6 h-2.5 bg-amber-600' : 'w-2.5 h-2.5 bg-zinc-300 dark:bg-zinc-600 hover:bg-amber-400'}`}
                        aria-label={`Go to slide ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </section>

        {/* CTA */}
        <section className="mt-16">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Ready to order?</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">Choose a design from our catalog and place your order, or book an appointment for a custom consultation.</p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/place-order?tab=appointment" className="inline-flex items-center justify-center px-7 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors text-sm">
                Book Appointment
              </Link>
              <Link href="/place-order?tab=products" className="inline-flex items-center justify-center px-7 py-3 rounded-xl border border-amber-600 text-amber-700 dark:text-amber-400 font-semibold hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors text-sm">
                Purchase Premade Products
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Frequently Asked Questions</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm">Everything you need to know before ordering</p>
          </div>
          <div className="max-w-2xl mx-auto space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <span className="font-medium text-zinc-900 dark:text-white text-sm pr-4">{faq.q}</span>
                  <svg
                    className={`w-5 h-5 text-zinc-400 flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-zinc-600 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-3 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-white mb-2">Seatmakers Avenue</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">Premium automotive upholstery and custom seat covers. Crafted with care for every vehicle.</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Quick Links</p>
              <ul className="space-y-2">
                {[
                  { label: 'Browse Catalog', href: '#catalog' },
                  { label: 'Book Appointment', href: '/place-order?tab=appointment' },
                  { label: 'Shop Products', href: '/place-order?tab=products' },
                  { label: 'Track My Order', href: '/my-orders' },
                ].map(link => (
                  <li key={link.label}>
                    <a href={link.href} className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Contact Us</p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  +63 9XX XXX XXXX
                </li>
                <li className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  hello@seatmakersavenue.com
                </li>
                <li className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Multiple branches available
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6 text-center">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">© 2026 Seatmakers Avenue. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
