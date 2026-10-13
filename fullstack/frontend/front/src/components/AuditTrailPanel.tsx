'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type AuditLog } from '@/lib/api';
import { formatDateTime, manilaDateString, parseServerTimestamp } from '@/lib/dateUtils';

type RangePreset = 'today' | 'week' | 'month' | 'quarter' | 'year';

const PRESETS: { id: RangePreset; label: string; days: number }[] = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'week', label: 'Last 7 days', days: 7 },
  { id: 'month', label: 'Last 30 days', days: 30 },
  { id: 'quarter', label: 'Last 90 days', days: 90 },
  { id: 'year', label: 'Last year', days: 365 },
];

/** Start/end as Manila calendar days — the server reads them as PHT, not UTC. */
function presetRange(preset: RangePreset): { startDate: string; endDate: string } {
  const days = PRESETS.find(p => p.id === preset)?.days ?? 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { startDate: manilaDateString(start), endDate: manilaDateString(end) };
}

/** Quote a CSV cell, doubling embedded quotes so a comma or quote in the details can't break the row. */
function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

const ACTION_STYLES: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  ARCHIVE: 'bg-yellow-100 text-yellow-700',
  RESTORE: 'bg-teal-100 text-teal-700',
  LOGIN: 'bg-gray-100 text-gray-600',
  LOGOUT: 'bg-gray-100 text-gray-600',
};

/**
 * The system-wide audit log: who did what, when. Administrators only — the
 * server refuses everyone else, so the caller should only render this for them.
 */
export default function AuditTrailPanel() {
  const [preset, setPreset] = useState<RangePreset>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Module and search are applied client-side, so the module list always
  // reflects names that actually appear in the log rather than a fixed guess.
  const [moduleFilter, setModuleFilter] = useState('');
  const [search, setSearch] = useState('');

  const usingCustom = !!(customStart && customEnd);
  const customInvalid = usingCustom && customStart > customEnd;

  const load = useCallback(async () => {
    if (customInvalid) return;
    setLoading(true);
    setError('');
    try {
      const dates = usingCustom ? { startDate: customStart, endDate: customEnd } : presetRange(preset);
      const res = await api.reports.getAuditTrail(dates);
      setLogs(res.data || []);
    } catch (err) {
      setLogs([]);
      setError(err instanceof Error ? err.message : 'Failed to load the audit trail.');
    } finally {
      setLoading(false);
    }
  }, [preset, customStart, customEnd, usingCustom, customInvalid]);

  useEffect(() => { load(); }, [load]);

  const modules = useMemo(
    () => [...new Set(logs.map(l => l.module).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [logs],
  );

  // A module picked for a previous range may not exist in the new one.
  useEffect(() => {
    if (moduleFilter && !modules.includes(moduleFilter)) setModuleFilter('');
  }, [modules, moduleFilter]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter(l => {
      if (moduleFilter && l.module !== moduleFilter) return false;
      if (!q) return true;
      return [l.userName, l.action, l.module, l.details, l.ipAddress]
        .some(v => (v || '').toLowerCase().includes(q));
    });
  }, [logs, moduleFilter, search]);

  const exportCsv = () => {
    if (visible.length === 0) return;
    const header = ['Timestamp (PHT)', 'User', 'Module', 'Action', 'Details', 'IP'].map(csvCell).join(',');
    const rows = visible.map(l => [
      formatDateTime(l.timestamp), l.userName, l.module, l.action, l.details, l.ipAddress,
    ].map(csvCell).join(','));
    // BOM so Excel opens peso signs and accented names correctly.
    const blob = new Blob(['﻿' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${manilaDateString()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking straight after click() can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <button key={p.id}
              onClick={() => { setPreset(p.id); setCustomStart(''); setCustomEnd(''); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                preset === p.id && !usingCustom ? 'bg-[#011c72] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-1.5">
            <input type="date" value={customStart} max={customEnd || undefined}
              onChange={e => setCustomStart(e.target.value)} aria-label="From date"
              className="px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 text-sm" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={customEnd} min={customStart || undefined}
              onChange={e => setCustomEnd(e.target.value)} aria-label="To date"
              className="px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 text-sm" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search user, action, details, IP…"
            className="flex-1 min-w-48 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent" />
          <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} aria-label="Module"
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 text-sm">
            <option value="">All modules ({logs.length})</option>
            {modules.map(m => (
              <option key={m} value={m}>{m} ({logs.filter(l => l.module === m).length})</option>
            ))}
          </select>
          <button onClick={load} disabled={loading || customInvalid}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button onClick={exportCsv} disabled={visible.length === 0}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[#011c72] text-white hover:bg-[#01268c] disabled:opacity-50">
            Export CSV
          </button>
        </div>

        {customInvalid && (
          <p className="text-xs text-red-600">The start date is after the end date.</p>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* Log */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Audit Log</h2>
          <span className="text-xs text-gray-500">
            {visible.length === logs.length ? `${logs.length} entries` : `${visible.length} of ${logs.length} entries`}
          </span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : visible.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-gray-400">
            {logs.length === 0 ? 'No audit entries for this period.' : 'No entries match these filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left">Timestamp</th>
                  <th className="px-5 py-3 text-left">User</th>
                  <th className="px-5 py-3 text-left">Module</th>
                  <th className="px-5 py-3 text-left">Action</th>
                  <th className="px-5 py-3 text-left">Details</th>
                  <th className="px-5 py-3 text-left">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors align-top">
                    <td className="px-5 py-3 whitespace-nowrap text-gray-500">
                      {parseServerTimestamp(log.timestamp) ? formatDateTime(log.timestamp) : (log.timestamp || '—')}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap font-medium text-gray-900">{log.userName || 'System'}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{log.module}</span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLES[(log.action || '').toUpperCase()] || 'bg-gray-100 text-gray-600'}`}>
                        {log.action}
                      </span>
                    </td>
                    {/* Wraps instead of truncating — details are the point of an audit log. */}
                    <td className="px-5 py-3 text-gray-600 min-w-64 break-words">{log.details}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-gray-400 font-mono text-xs">{log.ipAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
