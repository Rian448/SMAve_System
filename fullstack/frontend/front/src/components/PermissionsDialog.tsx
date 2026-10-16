'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, PermissionCatalogue, User, UserPermissions } from '@/lib/api';
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.permissions.catalogue(), api.permissions.getForUser(target.id)])
      .then(([cat, mine]) => {
        if (!cat.data || !mine.data) throw new Error('Could not load permissions');
        setCatalogue(cat.data);
        setCurrent(mine.data);
        setGrants(new Set(mine.data.grants));
        setRevokes(new Set(mine.data.revokes));
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Could not load permissions'));
  }, [target.id]);

  const defaults = useMemo(() => new Set(current?.roleDefaults ?? []), [current]);
  const isOn = (key: string) => (defaults.has(key) && !revokes.has(key)) || grants.has(key);

  const toggle = (key: string) => {
    if (!current?.editable) return;
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

  const resetToRole = async () => {
    const ok = await confirm({
      title: 'Reset to role defaults?',
      message: `All extra and removed permissions for ${target.fullName} will be cleared. Click Save to apply.`,
      confirmLabel: 'Reset',
      variant: 'warning',
    });
    if (!ok) return;
    setGrants(new Set());
    setRevokes(new Set());
  };

  const save = async () => {
    setSaving(true); setSaveError('');
    try {
      const res = await api.permissions.setForUser(target.id, { grants: [...grants], revokes: [...revokes] });
      if (res.data) onSaved(res.data);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save permissions');
    } finally {
      setSaving(false);
    }
  };

  const cell = (key: string, label: string) => {
    const on = isOn(key);
    const granted = grants.has(key);
    const revoked = revokes.has(key);
    const state = granted ? 'Granted (not in role)' : revoked ? 'Removed (role has it)' : on ? 'From role' : 'Off';
    const cls = granted
      ? 'bg-green-600 border-green-600 text-white'
      : revoked
        ? 'bg-red-50 border-red-400 text-red-600'
        : on
          ? 'bg-[#011c72] border-[#011c72] text-white'
          : 'bg-white border-gray-300 text-transparent hover:border-[#011c72]';
    return (
      <button type="button" onClick={() => toggle(key)} disabled={!current?.editable}
        title={`${label}: ${state}`} aria-pressed={on} aria-label={`${label} — ${state}`}
        className={`w-7 h-7 rounded-md border-2 inline-flex items-center justify-center text-xs font-bold transition-colors disabled:cursor-not-allowed ${cls}`}>
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
              Customer accounts use the customer pages only (their orders, cart and profile) and can&apos;t be given staff permissions.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="text-left py-2 pr-3">Module</th>
                  {STANDARD_ACTIONS.map(a => <th key={a} className="py-2 px-2 w-14 text-center capitalize">{a}</th>)}
                  <th className="text-left py-2 pl-3">Other actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {catalogue.modules.map(m => {
                  const byAction = new Map(m.permissions.map(p => [p.action, p]));
                  const extras = m.permissions.filter(p => !(STANDARD_ACTIONS as readonly string[]).includes(p.action));
                  return (
                    <tr key={m.key}>
                      <td className="py-2.5 pr-3 font-medium text-gray-900 whitespace-nowrap">{m.label}</td>
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
          )}
        </div>

        {saveError && (
          <p className="mx-6 mb-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{saveError}</p>
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
            <button type="button" onClick={save} disabled={!dirty || saving || !current?.editable}
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
