'use client';
import { useConfirm } from './ConfirmDialog';
import { blankSlipRow, MAX_SLIP_ROWS, MIN_SLIP_ROWS, ordinal, SlipRow } from '@/lib/slipRows';

/**
 * The Seat Row Descriptions of a Job Order Slip: four rows to start with, more
 * added with "+ Add Row", and any of them removed (down to the last one).
 */
export default function SeatRowsEditor({ rows, onChange, disabled = false }: {
  rows: SlipRow[];
  onChange: (rows: SlipRow[]) => void;
  disabled?: boolean;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const input = 'px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent disabled:bg-gray-50';

  const update = (id: string, field: 'description' | 'hr', value: string) =>
    onChange(rows.map(r => (r.id === id ? { ...r, [field]: value } : r)));

  const add = () => {
    if (rows.length >= MAX_SLIP_ROWS) return;
    onChange([...rows, blankSlipRow()]);
    // Put the cursor in the new row's description
    requestAnimationFrame(() => {
      const fields = document.querySelectorAll<HTMLInputElement>('[data-seat-row-description]');
      fields[fields.length - 1]?.focus();
    });
  };

  const remove = async (row: SlipRow, label: string) => {
    if (row.description.trim() || row.hr.trim()) {
      const ok = await confirm({
        title: `Remove the ${label} row?`,
        message: `Its description${row.hr.trim() ? ' and HR' : ''} will be removed. The other rows stay as they are.`,
        confirmLabel: 'Remove row',
        variant: 'warning',
      });
      if (!ok) return;
    }
    onChange(rows.filter(r => r.id !== row.id));
  };

  return (
    <div>
      <div className="space-y-2">
        {rows.map((row, i) => {
          const label = `${ordinal(i + 1)} ROW`;
          // Any row can go, but the slip always keeps at least one
          const removable = rows.length > MIN_SLIP_ROWS && !disabled;
          return (
            <div key={row.id} className="flex items-center gap-2 sm:gap-3">
              <span className="text-xs font-semibold text-gray-500 w-14 shrink-0">{label}</span>
              <input type="text" value={row.description} disabled={disabled} data-seat-row-description
                aria-label={`${label} description`}
                onChange={e => update(row.id, 'description', e.target.value)}
                placeholder="Description" className={`flex-1 min-w-0 ${input}`} />
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-gray-500">HR</span>
                <input type="text" value={row.hr} disabled={disabled} aria-label={`${label} HR`}
                  onChange={e => update(row.id, 'hr', e.target.value)}
                  placeholder="0" className={`w-16 px-2 text-center ${input}`} />
              </div>
              {/* Same width on every row, so the fields line up */}
              <div className="w-8 shrink-0 flex justify-center">
                {removable && (
                  <button type="button" onClick={() => remove(row, label)} aria-label={`Remove ${label}`} title={`Remove ${label}`}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!disabled && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={add} disabled={rows.length >= MAX_SLIP_ROWS}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[#011c72]/40 text-sm font-medium text-[#011c72] hover:bg-[#eef1fb] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Row
          </button>
          {rows.length >= MAX_SLIP_ROWS && <span className="text-xs text-gray-500">Up to {MAX_SLIP_ROWS} rows.</span>}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
