'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Field name → message. Anything that isn't a non-empty string means "no problem". */
export type FieldErrors = Record<string, unknown>;

/**
 * Validation messages shown next to the field they are about, instead of in one
 * banner at the top or bottom of the form.
 *
 *   const fe = useFieldErrors();
 *   if (fe.show({ name: !name && 'Name is required.' })) return;
 *   <div {...fe.field('name')}> <input …/> <FieldError message={fe.errors.name} /> </div>
 *
 * show() displays the messages, scrolls to the first one on the page and puts the
 * cursor in its field. A message clears itself as soon as its field is changed.
 * Use fe.field(name, true) for a group (a list, a set of choices): it shows the
 * message without outlining every box inside it in red.
 */
export function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const scrollPending = useRef(false);

  /** Shows these messages (falsy ones are skipped). True if there were any. */
  const show = useCallback((next: FieldErrors) => {
    const found = Object.fromEntries(
      Object.entries(next).filter((e): e is [string, string] => typeof e[1] === 'string' && !!e[1]));
    const any = Object.keys(found).length > 0;
    scrollPending.current = any;
    setErrors(found);
    return any;
  }, []);

  /** Clears one field's message, or all of them. */
  const clear = useCallback((name?: string) => {
    setErrors(prev => {
      if (name === undefined) return Object.keys(prev).length ? {} : prev;
      if (!(name in prev)) return prev;
      const rest = { ...prev };
      delete rest[name];
      return rest;
    });
  }, []);

  // Bring the first message into view once it has rendered; it may be on a step
  // or in a dialog that was only just opened
  useEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    const first = Object.keys(errors)
      .map(n => document.querySelector<HTMLElement>(`[data-field="${CSS.escape(n)}"]`))
      .filter((el): el is HTMLElement => !!el)
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
    if (!first) return;
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    first.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
    )?.focus({ preventScroll: true });
  }, [errors]);

  // Editing a field (typing, picking, ticking) clears its message. A click only
  // counts on a choice: an option or button, or anywhere in a group (e.g. a service card)
  useEffect(() => {
    const onEdit = (e: Event) => {
      const target = e.target as Element | null;
      const wrapper = target?.closest?.('[data-field]');
      if (!wrapper) return;
      if (e.type === 'click' && wrapper.getAttribute('data-invalid') !== 'group'
        && !target?.closest('button, [role="option"], li')) return;
      clear(wrapper.getAttribute('data-field')!);
    };
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    document.addEventListener('click', onEdit, true);
    return () => {
      document.removeEventListener('input', onEdit, true);
      document.removeEventListener('change', onEdit, true);
      document.removeEventListener('click', onEdit, true);
    };
  }, [clear]);

  /** Attributes for the element wrapping a field (or a group of them). */
  const field = useCallback((name: string, group = false) => ({
    'data-field': name,
    'data-invalid': errors[name] ? (group ? 'group' : 'field') : undefined,
  }), [errors]);

  return { errors, show, clear, field };
}

/** The message for an optional email box: blank is fine, a malformed address is not. */
export function emailProblem(email: string) {
  const v = email.trim();
  return v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Enter a valid email address, e.g. name@example.com.' : '';
}

/** The message under a field. Renders nothing when there is no message. */
export function FieldError({ message, className = '' }: { message?: string; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={`mt-1.5 flex items-start gap-1 text-xs font-medium text-red-600 ${className}`}>
      <svg className="w-3.5 h-3.5 mt-px shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{message}</span>
    </p>
  );
}
