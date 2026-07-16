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
    <div className="group bg-white rounded-xl shadow-md overflow-hidden flex flex-col hover:shadow-xl transition-all duration-300">
      {/* Image with gallery overlay */}
      <div className="relative h-64 bg-gray-100 overflow-hidden">
        {imageUrl ? (
          <Image src={imageUrl} alt={item.title} fill className="object-cover group-hover:scale-105 transition-transform duration-500" unoptimized />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs text-gray-400">No image</span>
          </div>
        )}

        {/* Hover overlay */}
        {!editing && (
          <div className="absolute inset-0 bg-[#011c72]/85 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-4 px-6">
            <h3 className="text-white font-bold text-lg text-center leading-snug">{item.title}</h3>
            <span className="px-5 py-2 border-2 border-white text-white text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-[#011c72] transition-colors cursor-default">
              View Details
            </span>
          </div>
        )}

        {/* Tag badge */}
        {item.tag && !editing && (
          <span className="absolute top-0 left-0 text-xs px-3 py-1.5 bg-[#011c72] text-white font-semibold uppercase tracking-wider">
            {item.tag}
          </span>
        )}

        {isAdmin && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-md transition-colors z-10"
          >
            {uploading ? 'Uploading…' : 'Change Photo'}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1">
        {editing ? (
          <div className="p-5 flex flex-col flex-1 gap-3">
            <input
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Title"
            />
            <input
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#011c72] focus:border-transparent"
              value={form.tag}
              onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}
              placeholder="Tag (e.g. New Arrival, Best Seller)"
            />
            <textarea
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#011c72] focus:border-transparent resize-none"
              rows={3}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description"
            />
            <div className="flex gap-2 mt-auto">
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="flex-1 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setForm({ title: item.title, description: item.description, tag: item.tag }); }}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="border-l-4 border-[#011c72] p-5 flex flex-col flex-1 gap-2">
            <h3 className="text-base font-bold text-gray-900 leading-tight">{item.title}</h3>
            <p className="text-sm text-gray-500 flex-1 leading-relaxed">{item.description || <span className="italic">No description</span>}</p>
            {isAdmin && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { setForm({ title: item.title, description: item.description, tag: item.tag }); setEditing(true); }}
                  className="flex-1 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  className="py-1.5 px-3 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
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
  const [heroTitle, setHeroTitle] = useState('Crafted for Comfort. Built to Last.');
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
    <div className="min-h-screen bg-white text-gray-900">

      {/* Floating Messenger Button */}
      <a
        href="https://www.facebook.com/profile.php?id=61550206889812&rdid=Z6BNtZZYmiR2Ki8Y&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F18pjxJ6QEB%2F#"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#0084ff] hover:bg-[#0073e6] text-white px-4 py-3 rounded-full shadow-lg transition-all hover:scale-105"
        aria-label="Message us on Facebook"
      >
        <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.908 1.438 5.504 3.688 7.205V22l3.37-1.85c.9.25 1.853.385 2.942.385 5.523 0 10-4.145 10-9.243S17.523 2 12 2zm1.006 12.44l-2.545-2.715-4.97 2.715 5.467-5.8 2.608 2.715 4.908-2.715-5.468 5.8z" />
        </svg>
        <span className="text-sm font-semibold hidden sm:inline">Message Us</span>
      </a>

      {/* ── Hero ── */}
      <section id="home" className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-[#010b30] min-h-[560px] flex items-center">
        {/* subtle overlay pattern */}
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
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a6aff] font-semibold mb-4">Premium Automotive Upholstery</p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6 max-w-3xl mx-auto">
                {heroTitle}
              </h1>
              <p className="text-gray-300 text-lg leading-relaxed mb-10 max-w-2xl mx-auto">{heroDesc}</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href="#catalog"
                  className="inline-flex items-center justify-center px-8 py-4 rounded-md bg-[#011c72] hover:bg-[#01268c] text-white font-semibold text-sm uppercase tracking-wide transition-colors shadow-lg"
                >
                  Browse Catalog
                </a>
                <Link
                  href="/place-order?tab=appointment"
                  className="inline-flex items-center justify-center px-8 py-4 rounded-md border-2 border-white/40 hover:border-white/70 text-white font-semibold text-sm uppercase tracking-wide transition-colors"
                >
                  Book Appointment
                </Link>
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

      {/* ── Why Choose Us ── */}
      <section id="why-us" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#011c72] mb-3">Why Us</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Why Choose Seatmakers Avenue?</h2>
            <div className="w-16 h-1 bg-[#011c72] mx-auto rounded-full" />
            <p className="text-gray-500 mt-5 text-base max-w-xl mx-auto">Quality craftsmanship, trusted by hundreds of vehicle owners across the city.</p>
          </div>
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
                desc: 'Every piece tailored to fit your exact vehicle and style preference.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                ),
                title: 'Fast Turnaround',
                desc: 'Most orders completed in 3–7 business days so you are back on the road fast.',
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

      {/* ── How It Works ── */}
      <section id="process" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#011c72] mb-3">Our Process</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">How It Works</h2>
            <div className="w-16 h-1 bg-[#011c72] mx-auto rounded-full" />
            <p className="text-gray-500 mt-5 text-base max-w-xl mx-auto">Three simple steps to get your perfect seat covers</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-10 left-[calc(33%+1rem)] right-[calc(33%+1rem)] h-0.5 bg-[#dde6ff] z-0" />
            {[
              { step: '01', title: 'Browse & Book', desc: 'Explore our catalog or book an appointment for a custom order consultation.', href: '#catalog', cta: 'See Catalog' },
              { step: '02', title: 'Get Quoted', desc: 'Our team reviews your request, prepares a quote, and confirms the appointment.', href: '/place-order?tab=appointment', cta: 'Book Now' },
              { step: '03', title: 'Pick Up & Enjoy', desc: 'Come to your chosen branch when your order is ready and drive away in style.', href: '/my-orders', cta: 'Track Orders' },
            ].map((item) => (
              <div key={item.step} className="relative z-10 bg-white rounded-xl shadow-md p-8 text-center flex flex-col items-center border border-gray-100 hover:shadow-lg transition-shadow duration-300">
                <div className="w-16 h-16 rounded-full bg-[#011c72] text-white font-bold text-xl flex items-center justify-center mb-5 shadow-md">
                  {item.step}
                </div>
                <h3 className="font-bold text-gray-900 mb-3 text-lg">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-5">{item.desc}</p>
                <a href={item.href} className="text-sm font-semibold text-[#011c72] hover:text-[#011c72] uppercase tracking-wide mt-auto transition-colors">
                  {item.cta} →
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Catalog ── */}
      <section id="catalog" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-14 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#011c72] mb-3">Portfolio</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Our Catalog</h2>
              <div className="w-16 h-1 bg-[#011c72] rounded-full" />
              <p className="text-gray-500 mt-4 text-base">Browse our available styles and designs.</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-semibold uppercase tracking-wide transition-colors shadow-md self-start sm:self-auto"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Item
              </button>
            )}
          </div>

          {/* Add Item Form */}
          {adding && isAdmin && (
            <div className="mb-10 rounded-xl border border-[#dde6ff] bg-[#eef2ff] p-6">
              <h3 className="text-sm font-bold text-[#011c72] mb-4 uppercase tracking-wide">New Catalog Item</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#011c72]"
                  placeholder="Title *"
                  value={newForm.title}
                  onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                />
                <input
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#011c72]"
                  placeholder="Tag (e.g. New Arrival)"
                  value={newForm.tag}
                  onChange={e => setNewForm(f => ({ ...f, tag: e.target.value }))}
                />
                <textarea
                  className="sm:col-span-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#011c72] resize-none"
                  rows={2}
                  placeholder="Description"
                  value={newForm.description}
                  onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">You can upload a photo after creating the item.</p>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleAddItem}
                  disabled={submitting || !newForm.title.trim()}
                  className="px-5 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Adding…' : 'Add to Catalog'}
                </button>
                <button
                  onClick={() => { setAdding(false); setNewForm({ title: '', description: '', tag: '' }); }}
                  className="px-5 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Carousel */}
          {loading ? (
            <div className="flex gap-6 overflow-hidden">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex-shrink-0 rounded-xl border border-gray-100 bg-white shadow-md overflow-hidden" style={{ width: `calc(${100 / cardsPerView}% - 1.5rem)` }}>
                  <div className="h-52 bg-gray-100 animate-pulse" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-24 text-gray-300">
              <svg className="w-14 h-14 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <p className="text-lg font-medium text-gray-400">No catalog items yet.</p>
              {isAdmin && <p className="text-sm mt-1 text-gray-400">Click &ldquo;Add Item&rdquo; to get started.</p>}
            </div>
          ) : (() => {
            const maxIdx = Math.max(0, items.length - cardsPerView);
            const cardWidthPct = 100 / cardsPerView;
            return (
              <div>
                <div className="relative">
                  <button
                    onClick={() => setCarouselIndex(i => Math.max(0, i - 1))}
                    disabled={carouselIndex === 0}
                    className="absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-600 hover:bg-[#011c72] hover:text-white hover:border-[#011c72] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    aria-label="Previous"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>

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

                  <button
                    onClick={() => setCarouselIndex(i => Math.min(maxIdx, i + 1))}
                    disabled={carouselIndex >= maxIdx}
                    className="absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-600 hover:bg-[#011c72] hover:text-white hover:border-[#011c72] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    aria-label="Next"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>

                {items.length > cardsPerView && (
                  <div className="flex justify-center gap-2 mt-8">
                    {Array.from({ length: maxIdx + 1 }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCarouselIndex(i)}
                        className={`rounded-full transition-all duration-200 ${i === carouselIndex ? 'w-7 h-2.5 bg-[#011c72]' : 'w-2.5 h-2.5 bg-gray-300 hover:bg-[#4a6aff]'}`}
                        aria-label={`Go to slide ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 bg-[#011c72]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to Transform Your Vehicle?</h2>
          <p className="text-white/80 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Choose a design from our catalog and place your order, or book an appointment for a custom consultation.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/place-order?tab=appointment"
              className="inline-flex items-center justify-center px-8 py-4 rounded-md bg-white text-[#011c72] font-bold text-sm uppercase tracking-wide hover:bg-gray-100 transition-colors shadow-lg"
            >
              Book Appointment
            </Link>
            <Link
              href="/place-order?tab=products"
              className="inline-flex items-center justify-center px-8 py-4 rounded-md border-2 border-white/50 hover:border-white text-white font-bold text-sm uppercase tracking-wide transition-colors"
            >
              Purchase Premade Products
            </Link>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#011c72] mb-3">FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <div className="w-16 h-1 bg-[#011c72] mx-auto rounded-full" />
            <p className="text-gray-500 mt-5 text-base max-w-xl mx-auto">Everything you need to know before ordering</p>
          </div>
          <div className="max-w-3xl mx-auto space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
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

      {/* ── Footer ── */}
      <footer id="contact" className="bg-gray-900 text-white">
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
              <p className="text-sm text-gray-400 leading-relaxed">Premium automotive upholstery and custom seat covers. Crafted with care for every vehicle.</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">Quick Links</p>
              <ul className="space-y-3">
                {[
                  { label: 'Browse Catalog', href: '#catalog' },
                  { label: 'Book Appointment', href: '/place-order?tab=appointment' },
                  { label: 'Shop Products', href: '/place-order?tab=products' },
                  { label: 'Track My Order', href: '/my-orders' },
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
                  <svg className="w-4 h-4 flex-shrink-0 text-[#011c72]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  0933 854 0446
                </li>
                <li className="flex items-center gap-3 text-sm text-gray-400">
                  <svg className="w-4 h-4 flex-shrink-0 text-[#011c72]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  seatmakersavenue@yahoo.com
                </li>
                <li className="flex items-center gap-3 text-sm text-gray-400">
                  <svg className="w-4 h-4 flex-shrink-0 text-[#011c72]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  275 Col. Boni Serrano, Cubao, Quezon City, Philippines 1109
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center">
            <p className="text-sm text-gray-500">© 2026 Seatmakers Avenue. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
