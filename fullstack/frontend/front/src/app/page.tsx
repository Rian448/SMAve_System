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
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden flex flex-col">
      {/* Image */}
      <div className="relative h-52 bg-zinc-100 dark:bg-zinc-800">
        {imageUrl ? (
          <Image src={imageUrl} alt={item.title} fill className="object-contain p-2" unoptimized />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm">No image</div>
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

  useEffect(() => {
    fetchCatalog();
  }, []);

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

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 h-80 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-zinc-400 dark:text-zinc-600">
              <p className="text-lg font-medium">No catalog items yet.</p>
              {isAdmin && <p className="text-sm mt-1">Click &ldquo;Add Item&rdquo; to get started.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {items.map(item => (
                <CatalogCard
                  key={item.id}
                  item={item}
                  isAdmin={isAdmin}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  onImageUpload={handleImageUpload}
                />
              ))}
            </div>
          )}
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
      </main>

      <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Seatmakers Avenue</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Premium automotive upholstery and custom seat covers.</p>
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            © 2026 Seatmakers Avenue. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
