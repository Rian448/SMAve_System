'use client';
import { useState } from 'react';

/** Common reasons a customer turns down a quotation; "Other" lets them type their own. */
export const QUOTATION_REJECT_REASONS = [
  'The price is higher than I expected',
  'I found a better offer elsewhere',
  'The completion date is too late',
  'I want different materials or a different design',
  'I no longer need the service',
] as const;

const OTHER = 'other';

interface DialogProps {
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Asks why a quotation is being rejected. The reason is required: pick one of
 * the common reasons, or choose Other and type it.
 */
export default function RejectQuotationDialog({ open, ...props }: DialogProps & { open: boolean }) {
  // Mounted only while open, so the choices start fresh every time
  return open ? <RejectQuotationForm {...props} /> : null;
}

function RejectQuotationForm({ busy, error, onCancel, onConfirm }: DialogProps) {
  const [choice, setChoice] = useState('');
  const [otherText, setOtherText] = useState('');

  const reason = choice === OTHER ? otherText.trim() : choice;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !busy && onCancel()}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
        role="dialog" aria-modal="true" aria-labelledby="reject-quote-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="reject-quote-title" className="text-xl font-bold text-gray-900">Reject Quotation?</h3>
        <p className="text-sm text-gray-600 mt-1 mb-4">Please tell us why, so we can prepare a better offer.</p>

        <fieldset className="space-y-2">
          <legend className="sr-only">Reason for rejecting</legend>
          {[...QUOTATION_REJECT_REASONS, OTHER].map((r) => (
            <label key={r}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${choice === r ? 'border-[#011c72] bg-[#eef1fb]' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input type="radio" name="reject-reason" value={r} checked={choice === r}
                onChange={() => setChoice(r)} className="mt-0.5 text-[#011c72] focus:ring-[#011c72]" />
              <span className="text-sm text-gray-800">{r === OTHER ? 'Other' : r}</span>
            </label>
          ))}
        </fieldset>

        {choice === OTHER && (
          <textarea value={otherText} onChange={(e) => setOtherText(e.target.value)} rows={3} maxLength={500} autoFocus
            placeholder="Tell us your reason"
            className="mt-3 w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent resize-none" />
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onCancel} disabled={busy}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(reason)} disabled={busy || !reason}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? 'Rejecting…' : 'Reject Quotation'}
          </button>
        </div>
      </div>
    </div>
  );
}
