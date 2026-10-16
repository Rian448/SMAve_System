'use client';
import { useEffect, useState } from 'react';
import { api, DEFAULT_VAT_PERCENT } from '@/lib/api';

/**
 * The VAT rate saved in Settings (system setting `vat_percent`), for showing
 * how much VAT a price includes. The server applies the same saved rate when
 * it prices an order, so this is only for display.
 */
export function useVatRate() {
  const [rate, setRate] = useState<number>(DEFAULT_VAT_PERCENT);
  useEffect(() => {
    api.settings.getSystemSettings()
      .then(r => {
        const saved = Number(r.data?.['vat_percent']);
        if (r.data?.['vat_percent'] !== undefined && Number.isFinite(saved) && saved >= 0) setRate(saved);
      })
      .catch(() => {});
  }, []);
  return rate;
}
