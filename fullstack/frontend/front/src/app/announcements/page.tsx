'use client';
import { useEffect, useState } from 'react';
import { api, type Announcement } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const PRIORITY_STYLES: Record<string, { bar: string; badge: string; label: string }> = {
  urgent: { bar: 'border-l-red-500', badge: 'bg-red-100 text-red-700', label: 'Urgent' },
  warning: { bar: 'border-l-yellow-400', badge: 'bg-yellow-100 text-yellow-700', label: 'Important' },
  info: { bar: 'border-l-[#011c72]', badge: 'bg-blue-100 text-blue-700', label: 'Info' },
};

const BLANK_FORM = { title: '', body: '', priority: 'info', isPinned: false };

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent text-sm';

function PostForm({ f, setF, onSubmit, onCancel, submitLabel, saving, formError }: {
  f: typeof BLANK_FORM;
  setF: (v: typeof BLANK_FORM) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  saving: boolean;
  formError: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
      {formError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm">{formError}</div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Title <span className="text-red-500">*</span></label>
        <input type="text" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}
          placeholder="Announcement title…" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Message <span className="text-red-500">*</span></label>
        <textarea rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })}
          placeholder="Write the announcement here…"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent text-sm resize-none" />
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Priority</label>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {(['info', 'warning', 'urgent'] as const).map((p) => (
              <button key={p} type="button" onClick={() => setF({ ...f, priority: p })}
                className={`px-3 py-1.5 capitalize ${f.priority === p ? 'bg-[#011c72] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {PRIORITY_STYLES[p].label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer mt-4">
          <input type="checkbox" checked={f.isPinned} onChange={(e) => setF({ ...f, isPinned: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-[#011c72] focus:ring-[#011c72]" />
          <span className="text-sm text-gray-700">Pin to top</span>
        </label>
      </div>
      <div className="flex gap-3 pt-1">
        <button onClick={onSubmit} disabled={saving}
          className="px-5 py-2 rounded-xl bg-[#011c72] text-white text-sm font-medium hover:bg-[#022494] transition-colors disabled:opacity-60">
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel}
          className="px-5 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrator' || user?.role === 'supervisor';

  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ ...BLANK_FORM });

  // Delete confirm
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    api.announcements.list()
      .then((res) => setItems(res.data || []))
      .catch(() => setError('Failed to load announcements.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setFormError('');
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (!form.body.trim()) { setFormError('Body is required.'); return; }
    setSaving(true);
    try {
      await api.announcements.create({ title: form.title.trim(), body: form.body.trim(), priority: form.priority, isPinned: form.isPinned });
      setForm({ ...BLANK_FORM });
      setShowCreate(false);
      load();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to post.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (a: Announcement) => {
    setEditingId(a.id);
    setEditForm({ title: a.title, body: a.body, priority: a.priority, isPinned: a.isPinned });
  };

  const handleEdit = async () => {
    if (!editingId) return;
    setFormError('');
    setSaving(true);
    try {
      await api.announcements.update(editingId, { title: editForm.title.trim(), body: editForm.body.trim(), priority: editForm.priority, isPinned: editForm.isPinned });
      setEditingId(null);
      load();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to update.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.announcements.delete(id);
      setDeletingId(null);
      load();
    } catch {
      setError('Failed to delete.');
    }
  };

  const toggleArchive = async (a: Announcement) => {
    await api.announcements.update(a.id, { isActive: !a.isActive });
    load();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bulletin Board</h1>
            <p className="text-sm text-gray-500 mt-1">Staff announcements and notices</p>
          </div>
          {isAdmin && !showCreate && (
            <button onClick={() => { setShowCreate(true); setFormError(''); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#011c72] text-white text-sm font-medium hover:bg-[#022494] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Post Announcement
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {/* Create form */}
        {showCreate && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">New Announcement</h2>
            <PostForm
              f={form} setF={setForm}
              onSubmit={handleCreate}
              onCancel={() => { setShowCreate(false); setForm({ ...BLANK_FORM }); setFormError(''); }}
              submitLabel="Post"
              saving={saving}
              formError={formError}
            />
          </div>
        )}

        {/* Board */}
        {loading ? (
          <div className="text-center py-20 text-gray-400 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <svg className="mx-auto w-12 h-12 text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
            <p className="text-gray-400 text-sm">No announcements yet.</p>
            {isAdmin && (
              <p className="text-gray-400 text-xs mt-1">Click "Post Announcement" to add one.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((a) => {
              const style = PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.info;
              const isEditing = editingId === a.id;
              const isDeleting = deletingId === a.id;

              return (
                <div key={a.id}
                  className={`bg-white rounded-2xl border border-gray-200 border-l-4 ${style.bar} shadow-sm overflow-hidden ${!a.isActive ? 'opacity-50' : ''}`}>

                  {isEditing ? (
                    <div className="p-5">
                      <p className="text-xs font-semibold text-gray-500 mb-3">Editing announcement</p>
                      <PostForm
                        f={editForm} setF={setEditForm}
                        onSubmit={handleEdit}
                        onCancel={() => { setEditingId(null); setFormError(''); }}
                        submitLabel="Save Changes"
                        saving={saving}
                        formError={formError}
                      />
                    </div>
                  ) : (
                    <div className="p-5">
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {a.isPinned && (
                            <svg className="w-4 h-4 text-[#011c72] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M16 3a1 1 0 011 1v1.586l2.707 2.707A1 1 0 0120 9v1a1 1 0 01-1 1h-6v7l-1 3-1-3v-7H5a1 1 0 01-1-1V9a1 1 0 01.293-.707L7 5.586V4a1 1 0 011-1h8z" />
                            </svg>
                          )}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${style.badge}`}>
                            {style.label}
                          </span>
                          {!a.isActive && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Archived</span>
                          )}
                        </div>
                        {isAdmin && !isDeleting && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => startEdit(a)}
                              className="text-xs text-gray-500 hover:text-[#011c72] transition-colors">Edit</button>
                            <button onClick={() => toggleArchive(a)}
                              className="text-xs text-gray-500 hover:text-yellow-600 transition-colors">
                              {a.isActive ? 'Archive' : 'Restore'}
                            </button>
                            <button onClick={() => setDeletingId(a.id)}
                              className="text-xs text-gray-500 hover:text-red-600 transition-colors">Delete</button>
                          </div>
                        )}
                      </div>

                      {/* Delete confirm inline */}
                      {isDeleting && (
                        <div className="mt-3 flex items-center gap-3 bg-red-50 rounded-lg px-4 py-2.5">
                          <span className="text-sm text-red-700 flex-1">Delete this announcement?</span>
                          <button onClick={() => handleDelete(a.id)}
                            className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700">Yes, delete</button>
                          <button onClick={() => setDeletingId(null)}
                            className="px-3 py-1 rounded-lg border border-gray-300 text-xs text-gray-600 hover:bg-gray-100">Cancel</button>
                        </div>
                      )}

                      {/* Content */}
                      <h3 className="mt-3 text-base font-semibold text-gray-900">{a.title}</h3>
                      <p className="mt-1.5 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{a.body}</p>

                      {/* Footer */}
                      <div className="mt-4 flex items-center gap-1 text-xs text-gray-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span>{a.createdByName}</span>
                        <span className="mx-1">·</span>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{a.createdAt}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
