'use client';
import { useEffect, useState } from 'react';
import { api, DEFAULT_VAT_PERCENT, vatBreakdown } from '@/lib/api';

/**
 * The VAT rate included in customer prices. Saved straight to the server
 * (system setting `vat_percent`); new and re-priced orders use it, while
 * existing orders keep the rate they were priced at.
 */
export default function VatRateSetting({ canEdit }: { canEdit: boolean }) {
  const [saved, setSaved] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.settings.getSystemSettings()
      .then(r => {
        const value = r.data?.['vat_percent'];
        const rate = value !== undefined && Number.isFinite(Number(value)) ? Number(value) : DEFAULT_VAT_PERCENT;
        setSaved(rate);
        setInput(String(rate));
      })
      .catch(() => setMessage({ ok: false, text: 'Could not load the VAT rate.' }));
  }, []);

  const valid = /^\d{1,3}(\.\d{1,2})?$/.test(input.trim()) && Number(input) <= 100;
  const example = vatBreakdown(900, valid ? Number(input) : saved ?? DEFAULT_VAT_PERCENT);

  const save = async () => {
    if (!valid) { setMessage({ ok: false, text: 'Enter a rate from 0 to 100, with up to 2 decimals.' }); return; }
    setSaving(true); setMessage(null);
    try {
      await api.settings.updateSystemSetting('vat_percent', input.trim());
      setSaved(Number(input));
      setMessage({ ok: true, text: 'VAT rate saved. New orders will use it.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not save the VAT rate.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 p-5">
      <h3 className="text-lg font-semibold text-gray-900">Tax</h3>
      <p className="text-sm text-gray-500 mt-1">
        Prices entered for orders and products already include VAT. This rate is used to show how much of
        each price is VAT; it is never added on top. Existing orders keep the rate they were priced at.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="vat-rate" className="block text-sm font-medium text-gray-700 mb-2">VAT rate (%)</label>
          <input id="vat-rate" type="text" inputMode="decimal" value={input} disabled={!canEdit || saved === null}
            onChange={e => { setInput(e.target.value); setMessage(null); }}
            className="w-32 px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500" />
        </div>
        {canEdit && (
          <button type="button" onClick={save} disabled={saving || saved === null || !input.trim() || Number(input) === saved}
            className="px-5 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {saving ? 'Saving…' : 'Save rate'}
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Example: a ₱900.00 price includes ₱{example.vat.toFixed(2)} VAT (₱{example.net.toFixed(2)} before VAT).
      </p>
      {!canEdit && <p className="mt-2 text-xs text-gray-400">Only users who can edit system settings can change the rate.</p>}
      {message && (
        <p className={`mt-3 text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}
    </div>
  );
}
