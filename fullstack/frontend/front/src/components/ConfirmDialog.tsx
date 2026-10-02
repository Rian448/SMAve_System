'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

export interface ConfirmOptions {
  title: string;
  /** Main explanation of what is about to happen. */
  message: ReactNode;
  /** Extra consequence spelled out in a tinted callout — use for irreversible actions. */
  warning?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /**
   * When set, the user must type this exact text before confirming.
   * Reserve it for permanent deletions that cannot be undone.
   */
  requireText?: string;
}

const VARIANTS: Record<ConfirmVariant, {
  icon: ReactNode;
  iconWrap: string;
  confirmBtn: string;
  callout: string;
}> = {
  danger: {
    iconWrap: 'bg-red-100 text-red-600',
    confirmBtn: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    callout: 'bg-red-50 border-red-200 text-red-800',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    ),
  },
  warning: {
    iconWrap: 'bg-yellow-100 text-yellow-600',
    confirmBtn: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
    callout: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    ),
  },
  info: {
    iconWrap: 'bg-blue-100 text-[#011c72]',
    confirmBtn: 'bg-[#011c72] hover:bg-[#022494] focus:ring-[#011c72]',
    callout: 'bg-blue-50 border-blue-200 text-[#011c72]',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
};

function ConfirmDialog({ options, onResolve }: {
  options: ConfirmOptions;
  onResolve: (confirmed: boolean) => void;
}) {
  const [typed, setTyped] = useState('');
  const variant = VARIANTS[options.variant || 'danger'];
  const needsText = !!options.requireText;
  const canConfirm = !needsText || typed.trim() === options.requireText;

  // Escape always cancels; Enter confirms only when the action is unlocked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onResolve(false);
      if (e.key === 'Enter' && canConfirm) onResolve(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canConfirm, onResolve]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onResolve(false)}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${variant.iconWrap}`}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {variant.icon}
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-base font-semibold text-gray-900">
              {options.title}
            </h2>
            <div className="mt-1.5 text-sm leading-relaxed text-gray-600">{options.message}</div>
          </div>
        </div>

        {options.warning && (
          <div className={`mt-4 rounded-xl border px-4 py-2.5 text-sm ${variant.callout}`}>
            {options.warning}
          </div>
        )}

        {needsText && (
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Type <span className="font-semibold text-gray-900">{options.requireText}</span> to confirm
            </label>
            <input
              type="text"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-[#011c72]"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            {options.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            autoFocus={!needsText}
            onClick={() => onResolve(true)}
            disabled={!canConfirm}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${variant.confirmBtn}`}
          >
            {options.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Promise-based confirmation modal, used in place of window.confirm().
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (!(await confirm({ title: '…', message: '…' }))) return;
 *   …render {confirmDialog} once inside the component…
 */
export function useConfirm() {
  const [pending, setPending] = useState<{
    options: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  );

  const handleResolve = useCallback((confirmed: boolean) => {
    setPending((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  const confirmDialog = pending ? (
    <ConfirmDialog options={pending.options} onResolve={handleResolve} />
  ) : null;

  return { confirm, confirmDialog };
}

export default ConfirmDialog;
