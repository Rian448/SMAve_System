'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, PermissionCatalogue, User, UserPermissions } from '@/lib/api';
import { useConfirm } from './ConfirmDialog';

const STANDARD_ACTIONS = ['view', 'add', 'edit', 'delete'] as const;

/**
 * Per-user permission matrix. Each feature starts from the user's role; clicking
 * a cell grants something the role lacks or revokes something it has. Saving
 * replaces the user's overrides, and the server applies them immediately.
 */
export default function PermissionsDialog({ target, onClose, onSaved }: {
  target: User;
  onClose: () => void;
  onSaved: (result: UserPermissions) => void;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const [catalogue, setCatalogue] = useState<PermissionCatalogue | null>(null);
  const [current, setCurrent] = useState<UserPermissions | null>(null);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [revokes, setRevokes] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  // Someone else saved this user's permissions after we loaded them
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);
  // Finding one permission among many: text search and "only what differs from the role"
  const [query, setQuery] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);

  const load = () => {
    setLoadError(''); setSaveError(''); setStale(false);
    return Promise.all([api.permissions.catalogue(), api.permissions.getForUser(target.id)])
      .then(([cat, mine]) => {
        if (!cat.data || !mine.data) throw new Error('Could not load permissions');
        setCatalogue(cat.data);
        setCurrent(mine.data);
        setGrants(new Set(mine.data.grants));
        setRevokes(new Set(mine.data.revokes));
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Could not load permissions'));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id]);

  const defaults = useMemo(() => new Set(current?.roleDefaults ?? []), [current]);
  const locked = useMemo(() => new Set(current?.locked ?? []), [current]);
  const isOn = (key: string) => (defaults.has(key) && !revokes.has(key)) || grants.has(key);

  const toggle = (key: string) => {
    if (!current?.editable || locked.has(key) || stale) return;
    setSaveError('');
    if (defaults.has(key)) {
      setRevokes(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    } else {
      setGrants(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    }
  };

  const sameAs = (a: Set<string>, b: string[]) => a.size === b.length && b.every(x => a.has(x));
  const dirty = !!current && (!sameAs(grants, current.grants) || !sameAs(revokes, current.revokes));
  const overrideCount = grants.size + revokes.size;
  const changesIn = (m: PermissionCatalogue['modules'][number]) =>
    m.permissions.filter(p => grants.has(p.key) || revokes.has(p.key)).length;
  const q = query.trim().toLowerCase();
  // A module shows if its name or any of its actions matches; all its cells stay
  // visible so the row still reads as one feature
  const shownModules = (catalogue?.modules ?? []).filter(m =>
    (!changedOnly || changesIn(m) > 0)
    && (!q || m.label.toLowerCase().includes(q)
      || m.permissions.some(p => p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q))));

  const resetToRole = async () => {
    const ok = await confirm({
      title: 'Reset to role defaults?',
      message: `All extra and removed permissions for ${target.fullName} will be cleared. Click Save to apply.`,
      confirmLabel: 'Reset',
      variant: 'warning',
    });
    if (!ok) return;
    // Changes outside what this user may delegate are kept (the server would refuse removing them)
    setGrants(prev => new Set([...prev].filter(k => locked.has(k))));
    setRevokes(prev => new Set([...prev].filter(k => locked.has(k))));
  };

  const save = async () => {
    if (!current) return;
    setSaving(true); setSaveError('');
    try {
      const res = await api.permissions.setForUser(target.id,
        { grants: [...grants], revokes: [...revokes], version: current.version });
      if (res.data) onSaved(res.data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setStale(true);
      setSaveError(err instanceof Error ? err.message : 'Could not save permissions');
    } finally {
      setSaving(false);
    }
  };

  const cell = (key: string, label: string) => {
    const on = isOn(key);
    const granted = grants.has(key);
    const revoked = revokes.has(key);
    const isLocked = locked.has(key);
    const state = (granted ? 'Granted (not in role)' : revoked ? 'Removed (role has it)' : on ? 'From role' : 'Off')
      + (isLocked ? ' — only an administrator can change this' : '');
    const cls = granted
      ? 'bg-green-600 border-green-600 text-white'
      : revoked
        ? 'bg-red-50 border-red-400 text-red-600'
        : on
          ? 'bg-[#011c72] border-[#011c72] text-white'
          : 'bg-white border-gray-300 text-transparent hover:border-[#011c72]';
    return (
      <button type="button" onClick={() => toggle(key)} disabled={!current?.editable || isLocked || stale}
        title={`${label}: ${state}`} aria-pressed={on} aria-label={`${label} — ${state}`}
        className={`w-7 h-7 rounded-md border-2 inline-flex items-center justify-center text-xs font-bold transition-colors disabled:cursor-not-allowed ${isLocked ? 'opacity-40' : ''} ${cls}`}>
        {revoked ? '✕' : on ? '✓' : ''}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-100">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Permissions</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {target.fullName} · <span className="font-medium">{target.roleName || target.role}</span>
              {overrideCount > 0 && <> · {overrideCount} change{overrideCount !== 1 ? 's' : ''} from role</>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {current?.editable && (
          <div className="px-6 pt-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <input type="search" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search a module or action, e.g. payments, void, export" aria-label="Search permissions"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap">
              <input type="checkbox" checked={changedOnly} onChange={e => setChangedOnly(e.target.checked)}
                className="rounded border-gray-300 text-[#011c72] focus:ring-[#011c72]" />
              Changed from role only
            </label>
          </div>
        )}

        <div className="px-6 pt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded border-2 bg-[#011c72] border-[#011c72]" /> From role</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded border-2 bg-green-600 border-green-600" /> Granted</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded border-2 bg-red-50 border-red-400" /> Removed</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded border-2 bg-white border-gray-300" /> Off</span>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loadError ? (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{loadError}</p>
          ) : !catalogue || !current ? (
            <p className="text-center text-gray-400 text-sm py-10">Loading permissions…</p>
          ) : !current.editable ? (
            <p className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-600">
              {current.readOnlyReason}
            </p>
          ) : shownModules.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-10">
              {changedOnly && !q ? "No changes from the role — this user has exactly the role's permissions."
                : 'No permissions match your search.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="text-left py-2 pr-3">Module</th>
                  {STANDARD_ACTIONS.map(a => <th key={a} className="py-2 px-2 w-14 text-center capitalize">{a}</th>)}
                  <th className="text-left py-2 pl-3">Other actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shownModules.map(m => {
                  const byAction = new Map(m.permissions.map(p => [p.action, p]));
                  const extras = m.permissions.filter(p => !(STANDARD_ACTIONS as readonly string[]).includes(p.action));
                  return (
                    <tr key={m.key}>
                      <td className="py-2.5 pr-3 font-medium text-gray-900 whitespace-nowrap">
                        {m.label}
                        {changesIn(m) > 0 && (
                          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold align-middle">
                            {changesIn(m)} changed
                          </span>
                        )}
                      </td>
                      {STANDARD_ACTIONS.map(a => {
                        const p = byAction.get(a);
                        return (
                          <td key={a} className="py-2.5 px-2 text-center">
                            {p ? cell(p.key, `${m.label}: ${p.label}`) : <span className="text-gray-300">—</span>}
                          </td>
                        );
                      })}
                      <td className="py-2.5 pl-3">
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          {extras.map(p => (
                            <span key={p.key} className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                              {cell(p.key, `${m.label}: ${p.label}`)} {p.label}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {saveError && (
          <div className="mx-6 mb-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{saveError}</span>
            {stale && (
              <button type="button" onClick={load}
                className="shrink-0 px-3 py-1 rounded-md bg-white border border-red-300 text-red-700 font-semibold hover:bg-red-100">
                Reload latest
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 p-6 pt-4 border-t border-gray-100">
          <button type="button" onClick={resetToRole} disabled={!current?.editable || overrideCount === 0 || saving}
            className="text-sm font-medium text-[#011c72] hover:underline disabled:text-gray-300 disabled:no-underline">
            Reset to role defaults
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={!dirty || saving || stale || !current?.editable}
              className="px-5 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
