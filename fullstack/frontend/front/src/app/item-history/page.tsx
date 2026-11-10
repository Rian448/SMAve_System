'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, type ItemHistory, type ItemHistoryEvent, type ItemHistoryItem, type ItemHistoryKind } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime, manilaDateString } from '@/lib/dateUtils';
import Paginated from '@/components/Paginated';

const peso = (n?: number) =>
  n == null ? '—' : `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qtyText = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-PH', { maximumFractionDigits: 4 })}`;
const statusText = (s?: string | null) => (s ? s.replace(/_/g, ' ') : '—');

/** Where a row's reference opens */
const linkFor = (e: ItemHistoryEvent) => {
  if (!e.link) return null;
  switch (e.link.kind) {
    case 'job_order': return `/sales/${e.link.id}`;
    case 'product_order': return `/product-orders/${e.link.id}`;
    case 'purchase_order': return `/purchase-orders/${e.link.id}`;
    case 'premade': return `/item-history?kind=premade&item=${e.link.id}`;
  }
};

export default function ItemHistoryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full" />
    </div>}>
      <ItemHistoryContent />
    </Suspense>
  );
}

function ItemHistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useAuth();
  const canMaterials = can('inventory.view');
  const canPremade = can('inventory.view', 'premade.view');

  const kindParam = searchParams.get('kind') === 'premade' ? 'premade' : 'material';
  const kind: ItemHistoryKind = kindParam === 'material' && !canMaterials ? 'premade' : kindParam;
  const itemId = Number(searchParams.get('item')) || null;
  const go = (k: ItemHistoryKind, id: number | null) => {
    // A different item starts with its filters cleared
    setTypeFilter('all'); setUsageFilter('all'); setSearch('');
    router.replace(`/item-history?kind=${k}${id ? `&item=${id}` : ''}`, { scroll: false });
  };

  // ── Item list
  // Results are kept with the kind they were loaded for, so a switch shows "Loading…" until its own arrive
  const [itemsResult, setItemsResult] = useState<{ kind: ItemHistoryKind; items: ItemHistoryItem[]; error: string } | null>(null);
  const itemsLoading = itemsResult?.kind !== kind;
  const items = useMemo(() => (itemsLoading ? [] : itemsResult!.items), [itemsLoading, itemsResult]);
  const itemsError = itemsLoading ? '' : itemsResult!.error;
  const [itemQuery, setItemQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    api.itemHistory.items(kind)
      .then((r) => { if (live) setItemsResult({ kind, items: r.data || [], error: '' }); })
      .catch((e) => { if (live) setItemsResult({ kind, items: [], error: e instanceof Error ? e.message : 'Failed to load items.' }); });
    return () => { live = false; };
  }, [kind]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const branches = useMemo(() => [...new Set(items.map((i) => i.branchName).filter(Boolean))] as string[], [items]);
  const pickable = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    return items.filter((i) => (showArchived || !i.isArchived)
      && (branchFilter === 'all' || i.branchName === branchFilter)
      && (!q || [i.name, i.detail, i.code].some((v) => (v || '').toLowerCase().includes(q))));
  }, [items, itemQuery, branchFilter, showArchived]);

  // ── History of the chosen item
  const historyKey = itemId ? `${kind}-${itemId}` : '';
  const [historyResult, setHistoryResult] = useState<{ key: string; data: ItemHistory | null; error: string } | null>(null);
  const historyLoading = !!historyKey && historyResult?.key !== historyKey;
  const history = !historyLoading && historyKey ? historyResult!.data : null;
  const historyError = !historyLoading && historyKey ? historyResult!.error : '';
  useEffect(() => {
    if (!itemId) return;
    let live = true;
    const key = `${kind}-${itemId}`;
    api.itemHistory.get(kind, itemId)
      .then((r) => { if (live) setHistoryResult({ key, data: r.data || null, error: '' }); })
      .catch((e) => { if (live) setHistoryResult({ key, data: null, error: e instanceof Error ? e.message : 'Failed to load the history.' }); });
    return () => { live = false; };
  }, [kind, itemId]);

  // ── Filters on the history (all applied here: one item's history is small)
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [usageFilter, setUsageFilter] = useState<'all' | 'custom' | 'premade'>('all');
  const [dateMode, setDateMode] = useState<'all' | 'day' | 'range'>('all');
  const [day, setDay] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<'latest' | 'oldest'>('latest');
  const events = useMemo(() => history?.events || [], [history]);
  const typeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    events.forEach((e) => { if (!seen.has(e.type)) seen.set(e.type, e.label.replace(/ \(.*\)$/, '')); });
    return [...seen.entries()];
  }, [events]);

  const rangeInvalid = dateMode === 'range' && !!from && !!to && from > to;
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = events.filter((e) => {
      const d = e.at ? manilaDateString(new Date(e.at)) : '';
      if (dateMode === 'day' && day && d !== day) return false;
      if (dateMode === 'range' && !rangeInvalid && ((from && d < from) || (to && d > to))) return false;
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (usageFilter !== 'all' && e.usage !== usageFilter) return false;
      if (q && ![e.label, e.reference, e.customerName, e.notes, e.by, e.worker, e.branchName, e.status]
        .some((v) => (v || '').toLowerCase().includes(q))) return false;
      return true;
    });
    return list.sort((a, b) => ((a.at || '') < (b.at || '') ? -1 : 1) * (sort === 'latest' ? -1 : 1));
  }, [events, search, typeFilter, usageFilter, dateMode, day, from, to, rangeInvalid, sort]);

  // Totals over what is shown
  const totals = useMemo(() => {
    const inQty = shown.reduce((s, e) => s + (e.quantity > 0 && e.type !== 'starting_stock' ? e.quantity : 0), 0);
    const outQty = shown.reduce((s, e) => s + (e.quantity < 0 ? -e.quantity : 0), 0);
    const sales = shown.filter((e) => e.type === 'sale' && e.status !== 'cancelled');
    const jobOrders = new Set(shown.filter((e) => e.usage === 'custom' && e.reference).map((e) => e.reference));
    return {
      inQty, outQty,
      timesSold: sales.length,
      qtySold: sales.reduce((s, e) => s + (e.soldQuantity || 0), 0),
      salesTotal: sales.reduce((s, e) => s + (e.total || 0), 0),
      jobOrders: jobOrders.size,
      customUse: shown.reduce((s, e) => s + (e.usage === 'custom' && e.quantity < 0 ? -e.quantity : 0), 0),
      premadeUse: shown.reduce((s, e) => s + (e.usage === 'premade' && e.quantity < 0 ? -e.quantity : 0), 0),
    };
  }, [shown]);

  const selected = items.find((i) => i.id === itemId);
  const tab = (k: ItemHistoryKind, label: string, allowed: boolean) => allowed && (
    <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => { setItemQuery(''); go(k, null); }}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${kind === k ? 'bg-white text-[#011c72] shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
      {label}
    </button>
  );
  const inputCls = 'px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent';

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Item History</h1>
            <p className="text-gray-500 mt-1 text-sm">Every recorded movement of an inventory item: where it went, when, and for whom</p>
          </div>
          <div role="tablist" aria-label="Item type" className="inline-flex p-1 bg-gray-100 rounded-xl self-start sm:self-auto">
            {tab('material', 'Raw Materials', canMaterials)}
            {tab('premade', 'Premade Items', canPremade)}
          </div>
        </div>

        {/* Item picker */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-col lg:flex-row gap-3">
          <div ref={pickerRef} className="relative flex-1">
            <input type="text" role="combobox" aria-expanded={pickerOpen} aria-controls="item-history-list"
              value={pickerOpen ? itemQuery : (selected ? `${selected.name}${selected.detail ? ` · ${selected.detail}` : ''}${selected.branchName ? ` — ${selected.branchName}` : ''}` : itemQuery)}
              onFocus={() => { setItemQuery(''); setPickerOpen(true); }}
              onChange={(e) => { setItemQuery(e.target.value); setPickerOpen(true); }}
              placeholder={kind === 'material' ? 'Search a raw material by name, color, item ID…' : 'Search a premade item by name, SKU, category…'}
              className={`w-full ${inputCls}`} />
            {pickerOpen && (
              <ul id="item-history-list" role="listbox" className="absolute z-30 left-0 right-0 top-full mt-1 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
                {itemsLoading ? <li className="px-3 py-2 text-gray-400">Loading…</li>
                  : itemsError ? <li className="px-3 py-2 text-red-600">{itemsError}</li>
                  : pickable.length === 0 ? <li className="px-3 py-2 text-gray-400">No items match.</li>
                  : pickable.slice(0, 100).map((i) => (
                    <li key={i.id} role="option" aria-selected={i.id === itemId}
                      onMouseDown={(e) => { e.preventDefault(); setPickerOpen(false); setItemQuery(''); go(kind, i.id); }}
                      className={`px-3 py-2 cursor-pointer hover:bg-[#eef1fb] ${i.id === itemId ? 'bg-[#eef1fb]' : ''}`}>
                      <p className="font-medium text-gray-900 break-words">
                        {i.name}{i.detail && <span className="font-normal text-gray-500"> · {i.detail}</span>}
                        {i.isArchived && <span className="ml-1 text-xs text-gray-400">(archived)</span>}
                      </p>
                      <p className="text-xs text-gray-500">{[i.code, i.branchName, `${i.stock.toLocaleString('en-PH')} in stock`].filter(Boolean).join(' · ')}</p>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          {branches.length > 1 && (
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} aria-label="Branch" className={inputCls}>
              <option value="all">All branches</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Include archived
          </label>
        </div>

        {!itemId ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
            Choose an item above to see its history.
          </div>
        ) : historyLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 flex justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-[#011c72] border-t-transparent rounded-full" />
          </div>
        ) : historyError || !history ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-red-600 text-sm">{historyError || 'Item not found.'}</div>
        ) : (<>
          {/* Item card + totals */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div className="bg-white rounded-xl border border-gray-200 p-5 min-w-0">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{kind === 'material' ? 'Raw material' : 'Premade item'}</p>
              <p className="text-lg font-bold text-gray-900 mt-1 break-words">{history.item.name}
                {history.item.isArchived && <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 align-middle">Archived</span>}
              </p>
              <p className="text-sm text-gray-500">{[history.item.code, history.item.branchName].filter(Boolean).join(' · ') || '—'}</p>
              <div className="mt-3 flex gap-6 text-sm">
                <div><p className="text-gray-500">Current stock</p><p className="text-xl font-bold text-[#011c72]">{history.item.stock.toLocaleString('en-PH')}</p></div>
                <div><p className="text-gray-500">{kind === 'material' ? 'Unit price' : 'Price'}</p><p className="text-xl font-bold text-gray-900">{peso(history.item.price)}</p></div>
              </div>
            </div>
            <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Stock in (shown)" value={qtyText(totals.inQty).replace(/^\+?/, '+')} tone="green" />
              <Stat label="Stock out (shown)" value={totals.outQty ? `−${totals.outQty.toLocaleString('en-PH', { maximumFractionDigits: 4 })}` : '0'} tone="red" />
              {kind === 'premade' ? (<>
                <Stat label="Times sold" value={String(totals.timesSold)} hint={`${totals.qtySold.toLocaleString('en-PH')} pcs`} />
                <Stat label="Sales amount" value={peso(totals.salesTotal)} hint="not counting cancelled" />
              </>) : (<>
                <Stat label="Custom job orders" value={String(totals.jobOrders)} hint={`${totals.customUse.toLocaleString('en-PH', { maximumFractionDigits: 4 })} used`} />
                <Stat label="Used for premade" value={totals.premadeUse.toLocaleString('en-PH', { maximumFractionDigits: 4 })} />
              </>)}
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reference, customer, notes, who…" className={`flex-1 ${inputCls}`} />
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Transaction type" className={inputCls}>
                <option value="all">All transaction types</option>
                {typeOptions.map(([t, label]) => <option key={t} value={t}>{label}</option>)}
              </select>
              {kind === 'material' && (
                <select value={usageFilter} onChange={(e) => setUsageFilter(e.target.value as typeof usageFilter)} aria-label="Used for" className={inputCls}>
                  <option value="all">Custom and premade</option>
                  <option value="custom">Custom job orders only</option>
                  <option value="premade">Premade only</option>
                </select>
              )}
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort" className={inputCls}>
                <option value="latest">Latest to Oldest</option>
                <option value="oldest">Oldest to Latest</option>
              </select>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="inline-flex p-1 bg-gray-100 rounded-lg text-sm self-start" role="tablist" aria-label="Date filter">
                {([['all', 'All dates'], ['day', 'Specific date'], ['range', 'Date range']] as const).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={dateMode === id} onClick={() => setDateMode(id)}
                    className={`px-3 py-1.5 rounded-md font-medium ${dateMode === id ? 'bg-white shadow-sm text-[#011c72]' : 'text-gray-600'}`}>{label}</button>
                ))}
              </div>
              {dateMode === 'day' && <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date" className={inputCls} />}
              {dateMode === 'range' && (
                <div className="flex flex-wrap items-center gap-2">
                  <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From" className={inputCls} />
                  <span className="text-sm text-gray-500">to</span>
                  <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To" className={inputCls} />
                </div>
              )}
              {rangeInvalid && <p className="text-sm text-red-600">The start date must be on or before the end date.</p>}
            </div>
          </div>

          {/* History */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 text-sm text-gray-500">{shown.length} of {events.length} records</div>
            {shown.length === 0 ? (
              <p className="p-10 text-center text-sm text-gray-400">{events.length ? 'No records match these filters.' : 'No recorded movements for this item.'}</p>
            ) : (
              <Paginated items={shown} resetKey={[kind, itemId, search, typeFilter, usageFilter, dateMode, day, from, to, sort]} label="records">{(rows) => (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Date &amp; time</th>
                        <th className="px-4 py-3 text-left font-medium">Transaction</th>
                        <th className="px-4 py-3 text-right font-medium">Stock change</th>
                        <th className="px-4 py-3 text-left font-medium">Reference</th>
                        <th className="px-4 py-3 text-left font-medium">{kind === 'premade' ? 'Customer' : 'Customer / used by'}</th>
                        {kind === 'premade' && <th className="px-4 py-3 text-right font-medium">Unit price · Total</th>}
                        <th className="px-4 py-3 text-left font-medium">Branch</th>
                        <th className="px-4 py-3 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((e) => {
                        const href = linkFor(e);
                        return (
                          <tr key={e.key} onClick={href ? () => router.push(href) : undefined}
                            title={href ? 'Open the related record' : undefined}
                            className={`align-top ${href ? 'cursor-pointer hover:bg-[#eef1fb]' : ''}`}>
                            <td className="px-4 py-3 whitespace-nowrap text-gray-600">{e.at ? formatDateTime(e.at) : '—'}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{e.label}</p>
                              {e.usage && (
                                <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[11px] font-semibold ${e.usage === 'custom' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                                  {e.usage === 'custom' ? 'Custom job order' : 'Premade'}
                                </span>
                              )}
                              {e.notes && <p className="text-xs text-gray-500 mt-1 break-words max-w-sm">{e.notes}</p>}
                            </td>
                            <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${e.quantity > 0 ? 'text-green-700' : e.quantity < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                              {e.type === 'sale' && e.quantity === 0 ? <span title="No stock change">{(e.soldQuantity || 0).toLocaleString('en-PH')} pcs</span>
                                : e.quantity === 0 ? '—' : e.type === 'starting_stock' ? e.quantity.toLocaleString('en-PH') : qtyText(e.quantity)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {e.reference ? <span className={href ? 'font-medium text-[#011c72]' : 'text-gray-700'}>{e.reference}</span> : '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              <p>{e.customerName || (kind === 'material' ? '' : '—')}</p>
                              {kind === 'material' && (e.worker || e.by) && (
                                <p className="text-xs text-gray-500">{[e.worker && `Worker: ${e.worker}`, e.by && `By ${e.by}`].filter(Boolean).join(' · ')}</p>
                              )}
                              {kind === 'material' && !e.customerName && !e.worker && !e.by && '—'}
                            </td>
                            {kind === 'premade' && (
                              <td className="px-4 py-3 text-right whitespace-nowrap text-gray-700">
                                {e.type === 'sale' ? <>{peso(e.unitPrice)} · <span className="font-semibold">{peso(e.total)}</span></> : '—'}
                              </td>
                            )}
                            <td className="px-4 py-3 text-gray-600">{e.branchName || '—'}</td>
                            <td className="px-4 py-3 capitalize text-gray-600">
                              {statusText(e.status)}
                              {e.paymentStatus && <p className="text-xs text-gray-400">{statusText(e.paymentStatus)}</p>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}</Paginated>
            )}
          </div>

          {history.limitations.length > 0 && (
            <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">About this history</p>
              {history.limitations.map((l) => <p key={l}>• {l}</p>)}
            </div>
          )}
        </>)}
      </main>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'green' | 'red' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 min-w-0">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-1 [overflow-wrap:anywhere] ${tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
