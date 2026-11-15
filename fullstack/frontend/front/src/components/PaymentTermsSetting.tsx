'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DEFAULT_TERM_OPTIONS, resetPaymentTermOptions } from '@/components/PaymentTerms';

const MAX_REMINDER_DAYS = 60;

/** "7, 15,30" -> [7, 15, 30], or null when it isn't a valid list */
function parseNetDays(text: string, maxDays: number): number[] | null {
  const parts = text.split(',').map(x => x.trim()).filter(Boolean);
  if (!parts.length || parts.length > 12) return null;
  if (!parts.every(x => /^\d{1,3}$/.test(x) && Number(x) >= 1 && Number(x) <= maxDays)) return null;
  return Array.from(new Set(parts.map(Number))).sort((a, b) => a - b);
}

/**
 * Supplier payment terms used everywhere (suppliers and purchase orders): the Net
 * day choices the forms offer, and how many days before the due date a purchase
 * order counts as "due soon" and its reminder goes out. Saved to the server
 * (system settings `po_term_presets` and `po_due_reminder_days`).
 */
export default function PaymentTermsSetting({ canEdit }: { canEdit: boolean }) {
  const [savedDays, setSavedDays] = useState<number[] | null>(null);
  const [savedLead, setSavedLead] = useState<number | null>(null);
  const [daysInput, setDaysInput] = useState('');
  const [leadInput, setLeadInput] = useState('');
  const [maxDays, setMaxDays] = useState(DEFAULT_TERM_OPTIONS.maxDays);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.purchaseOrders.paymentTermOptions()
      .then(r => {
        const o = r.data || DEFAULT_TERM_OPTIONS;
        setSavedDays(o.netDays); setSavedLead(o.reminderDays); setMaxDays(o.maxDays);
        setDaysInput(o.netDays.join(', ')); setLeadInput(String(o.reminderDays));
      })
      .catch(() => setMessage({ ok: false, text: 'Could not load the payment term settings.' }));
  }, []);

  const parsedDays = parseNetDays(daysInput, maxDays);
  const leadValid = /^\d{1,2}$/.test(leadInput.trim()) && Number(leadInput) <= MAX_REMINDER_DAYS;
  const changed = savedDays !== null && (
    (parsedDays ? parsedDays.join(',') : daysInput) !== savedDays.join(',') || Number(leadInput) !== savedLead);

  const save = async () => {
    if (!parsedDays) { setMessage({ ok: false, text: `List the Net terms as whole days from 1 to ${maxDays}, separated by commas (up to 12).` }); return; }
    if (!leadValid) { setMessage({ ok: false, text: `Enter the reminder lead time as whole days from 0 to ${MAX_REMINDER_DAYS}.` }); return; }
    setSaving(true); setMessage(null);
    try {
      await api.settings.updateSystemSetting('po_term_presets', parsedDays.join(','));
      await api.settings.updateSystemSetting('po_due_reminder_days', String(Number(leadInput)));
      setSavedDays(parsedDays); setSavedLead(Number(leadInput)); setDaysInput(parsedDays.join(', '));
      resetPaymentTermOptions();
      setMessage({ ok: true, text: 'Payment term settings saved.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not save the payment term settings.' });
    } finally {
      setSaving(false);
    }
  };

  const field = 'px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500';
  return (
    <div className="rounded-xl border border-gray-200 p-5">
      <h3 className="text-lg font-semibold text-gray-900">Supplier Payment Terms</h3>
      <p className="text-sm text-gray-500 mt-1">
        Each supplier has its own default term (set under Suppliers), and each purchase order can change it.
        Cash in Advance and COD are always offered; these are the Net options. A custom number of days can still be typed in.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="net-days" className="block text-sm font-medium text-gray-700 mb-2">Net terms offered (days)</label>
          <input id="net-days" type="text" inputMode="numeric" value={daysInput} disabled={!canEdit || savedDays === null}
            onChange={e => { setDaysInput(e.target.value.replace(/[^\d,\s]/g, '')); setMessage(null); }}
            placeholder="7, 15, 30, 60" className={`w-full ${field}`} />
          <p className="mt-1 text-xs text-gray-500">Comma-separated, e.g. 7, 15, 30, 60</p>
        </div>
        <div>
          <label htmlFor="reminder-days" className="block text-sm font-medium text-gray-700 mb-2">Remind before the due date (days)</label>
          <input id="reminder-days" type="text" inputMode="numeric" maxLength={2} value={leadInput} disabled={!canEdit || savedLead === null}
            onChange={e => { setLeadInput(e.target.value.replace(/\D/g, '').slice(0, 2)); setMessage(null); }}
            className={`w-32 ${field}`} />
          <p className="mt-1 text-xs text-gray-500">
            {leadValid ? (Number(leadInput) === 0 ? 'Reminder on the due date itself.' : `Reminder ${leadInput} day${leadInput === '1' ? '' : 's'} before it is due.`) : `0 to ${MAX_REMINDER_DAYS}`}
            {' '}An overdue notice follows if it is still unpaid.
          </p>
        </div>
      </div>
      {canEdit && (
        <button type="button" onClick={save} disabled={saving || !changed}
          className="mt-4 px-5 py-2 rounded-lg bg-[#011c72] hover:bg-[#01268c] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {saving ? 'Saving…' : 'Save payment terms'}
        </button>
      )}
      {!canEdit && <p className="mt-2 text-xs text-gray-400">Only users who can edit system settings can change these.</p>}
      {message && <p className={`mt-3 text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
    </div>
  );
}
