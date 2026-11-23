/**
 * Spotting names that are really the same item: different capitalization, spacing
 * or punctuation ("TESLA seat cover" / "tesla  seat-cover"), or a small typo
 * ("Telsa" / "Tesla").
 */

/** Lowercase letters and digits only, words separated by one space */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Edits (insert, delete, change, or swap two neighbours) to turn a into b */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * The closest existing item to a typed name: 'same' when it only differs in case,
 * spaces or punctuation, 'similar' when it is a typo or two away (more allowed for
 * longer names), else null.
 */
export function findSimilarName<T>(typed: string, items: T[], nameOf: (item: T) => string):
  { item: T; kind: 'same' | 'similar' } | null {
  const t = normalizeName(typed);
  if (t.length < 3) return null;
  let best: { item: T; distance: number } | null = null;
  for (const item of items) {
    const n = normalizeName(nameOf(item));
    if (!n) continue;
    if (n === t) return { item, kind: 'same' };
    // Words in another order ("seat cover tesla" / "tesla seat cover")
    if (n.split(' ').sort().join(' ') === t.split(' ').sort().join(' ')) return { item, kind: 'similar' };
    const allowed = Math.max(t.length, n.length) <= 5 ? 1 : Math.max(t.length, n.length) <= 12 ? 2 : 3;
    const distance = editDistance(t, n);
    if (distance <= allowed && (!best || distance < best.distance)) best = { item, distance };
  }
  return best ? { item: best.item, kind: 'similar' } : null;
}
