'use client';
import { useEffect } from 'react';
import { useBranding } from '@/lib/branding';

/** Uses the logo from Settings > Appearance as the browser tab icon (else the default favicon). */
export default function BrandingFavicon() {
  const { logo } = useBranding();
  useEffect(() => {
    const id = 'branding-favicon';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!logo) { link?.remove(); return; }
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    // Last in <head>, so browsers take it over the built-in favicon.ico
    document.head.appendChild(link);
    link.href = logo;
  }, [logo]);
  return null;
}
