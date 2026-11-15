'use client';
import { PASSWORD_RULES } from '@/lib/password';

/** The password rules, each ticked off as the typed password meets it. */
export default function PasswordChecklist({ password, id }: { password: string; id?: string }) {
  return (
    <ul id={id} aria-label="Password requirements" className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {PASSWORD_RULES.map(rule => {
        const met = rule.test(password);
        return (
          <li key={rule.label} className={`flex items-center gap-1.5 ${met ? 'text-green-700' : 'text-gray-500'}`}>
            <span aria-hidden="true" className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
              met ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
              {met ? '✓' : '•'}
            </span>
            {rule.label}
            <span className="sr-only">{met ? ' (met)' : ' (not yet)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
