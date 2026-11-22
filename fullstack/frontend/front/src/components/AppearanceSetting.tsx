'use client';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useBranding, setBranding, imageFileToDataUrl } from '@/lib/branding';
import { NAV_ICON_SLOTS, DefaultLogo } from '@/components/Navigation';

/**
 * Settings > Appearance: the logo (browser tab icon and sidebar) and the sidebar
 * icons. Each change saves at once and shows for everyone; Reset puts back the
 * built-in one.
 */
export default function AppearanceSetting({ canEdit }: { canEdit: boolean }) {
  const branding = useBranding();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  // What the next picked file is for: 'logo' or a sidebar icon key
  const target = useRef<string>('logo');

  const save = async (what: string, data: { logo?: string | null; navIcons?: Record<string, string | null> }) => {
    setBusy(what); setError(''); setSaved('');
    try {
      const res = await api.settings.updateBranding(data);
      if (res.data) setBranding(res.data);
      setSaved('Saved. Everyone sees the change on their next page load.');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not save the change.');
    } finally {
      setBusy(null);
    }
  };

  const pick = (what: string) => {
    target.current = what;
    if (fileInput.current) { fileInput.current.value = ''; fileInput.current.click(); }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const what = target.current;
    if (!file.type.startsWith('image/')) { setError('Choose an image file (PNG, JPG, SVG...).'); return; }
    try {
      // The logo doubles as the tab icon: 128 px is plenty; sidebar icons show at 20 px
      const url = await imageFileToDataUrl(file, what === 'logo' ? 128 : 64);
      await save(what, what === 'logo' ? { logo: url } : { navIcons: { [what]: url } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that image.');
    }
  };

  const btn = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50';
  const groups = [...new Set(NAV_ICON_SLOTS.map((s) => s.group || ''))];

  return (
    <div className="space-y-8">
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/x-icon"
        className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      <div>
        <h3 className="text-lg font-semibold text-gray-900">Logo</h3>
        <p className="text-sm text-gray-500 mt-1">
          Shown at the top of the sidebar and as the icon on the browser tab. A square image works best.
        </p>
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200">
            {branding.logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={branding.logo} alt="Logo" className="w-12 h-12 rounded-lg object-contain bg-white border border-gray-100" />
              : <div className="scale-150 mx-2"><DefaultLogo /></div>}
            <span className="text-sm text-gray-600">{branding.logo ? 'Custom logo' : 'Built-in logo'}</span>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <button type="button" disabled={!!busy} onClick={() => pick('logo')}
                className={`${btn} bg-[#011c72] text-white hover:bg-[#01268c]`}>
                {busy === 'logo' ? 'Saving…' : 'Upload logo'}
              </button>
              {branding.logo && (
                <button type="button" disabled={!!busy} onClick={() => save('logo', { logo: null })}
                  className={`${btn} border border-gray-200 text-gray-700 hover:bg-gray-50`}>Reset</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900">Sidebar icons</h3>
        <p className="text-sm text-gray-500 mt-1">
          Replace any menu icon with your own image (shown small, about 20 px). Reset puts back the built-in icon.
        </p>
        <div className="mt-4 space-y-5">
          {groups.map((group) => (
            <div key={group || 'top'}>
              {group && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{group}</p>}
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
                {NAV_ICON_SLOTS.filter((s) => (s.group || '') === group).map((slot) => {
                  const custom = branding.navIcons[slot.key];
                  const Icon = slot.Icon;
                  return (
                    <li key={slot.key} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {custom ? <img src={custom} alt="" className="w-5 h-5 object-contain" /> : <Icon />}
                      </span>
                      <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">
                        {slot.label}
                        {custom && <span className="ml-2 text-xs text-[#011c72]">custom</span>}
                      </span>
                      {canEdit && (
                        <span className="flex gap-2 shrink-0">
                          <button type="button" disabled={!!busy} onClick={() => pick(slot.key)}
                            className={`${btn} border border-[#c7d2f5] text-[#011c72] hover:bg-[#eef1fb]`}>
                            {busy === slot.key ? 'Saving…' : 'Change'}
                          </button>
                          {custom && (
                            <button type="button" disabled={!!busy} onClick={() => save(slot.key, { navIcons: { [slot.key]: null } })}
                              className={`${btn} border border-gray-200 text-gray-700 hover:bg-gray-50`}>Reset</button>
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-700">{saved}</p>}
      {!canEdit && <p className="text-sm text-gray-500">You can view these but need permission to edit settings to change them.</p>}
    </div>
  );
}
