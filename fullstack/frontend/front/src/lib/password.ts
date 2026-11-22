// What every new or changed password needs. The server checks the same list
// (password_error in app.py), so the rules can't be skipped with a direct request.
// Spaces and any language's letters (Ñ, é, …) are allowed.

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;

export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: `At least ${MIN_PASSWORD_LENGTH} characters`, test: p => [...p].length >= MIN_PASSWORD_LENGTH },
  { label: 'One uppercase letter', test: p => /\p{Lu}/u.test(p) },
  { label: 'One lowercase letter', test: p => /\p{Ll}/u.test(p) },
  { label: 'One number', test: p => /[0-9]/.test(p) },
  { label: 'One symbol (such as @ # $ % & !)', test: p => /[^\p{L}\p{N}\s]/u.test(p) },
];

/** Why this password can't be used, or '' when it meets every rule. */
export function passwordProblem(password: string): string {
  if (!password) return 'Enter a password.';
  if ([...password].length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  const missing = PASSWORD_RULES.filter(r => !r.test(password)).map(r => r.label.toLowerCase());
  if (missing.length === 0) return '';
  const listed = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  return `Password needs ${listed}.`;
}
