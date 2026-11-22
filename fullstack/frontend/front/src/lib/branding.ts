'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { api, type Branding } from '@/lib/api';

/**
 * The logo and custom sidebar icons set in Settings > Appearance, loaded once and
 * shared by every component that shows them. Saving in Settings calls
 * setBranding so the sidebar and browser tab change straight away.
 */
const EMPTY: Branding = { logo: null, navIcons: {} };
let current: Branding = EMPTY;
let requested = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

export function setBranding(next: Branding) {
  current = { logo: next.logo || null, navIcons: next.navIcons || {} };
  emit();
}

export function loadBranding(force = false) {
  if (requested && !force) return;
  requested = true;
  api.settings.getBranding()
    .then((res) => { if (res.data) setBranding(res.data); })
    .catch(() => { requested = false; });  // try again on the next page that asks
}

export function useBranding(): Branding {
  useEffect(() => { loadBranding(); }, []);
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => current,
    () => EMPTY,
  );
}

/**
 * Shrink a picked image file to a square PNG data URL of at most `size` px (SVGs are
 * kept as they are), so it stays small enough to store and load quickly.
 */
export function imageFileToDataUrl(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const src = String(reader.result);
      if (file.type === 'image/svg+xml') { resolve(src); return; }
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image the browser can open.'));
      img.onload = () => {
        const scale = Math.min(1, size / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Could not process the image.')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
