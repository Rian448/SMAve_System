/**
 * Length stock (fabric, leather, vinyl...) is kept in yards. It is entered and
 * shown in yards, feet and inches (plus centimeters when entering), e.g.
 * 39 yd 2 ft 1 in. Consumables are plain counts (pcs...) and skip all of this.
 */

export const FT_PER_YD = 3;
export const IN_PER_YD = 36;
export const CM_PER_YD = 91.44;

export interface LengthParts { yd: number; ft: number; in: number; cm?: number }

/** Yards from yd + ft + in + cm (any of them may be 0) */
export function toYards({ yd, ft, in: inches, cm = 0 }: LengthParts): number {
  const total = (yd || 0) + (ft || 0) / FT_PER_YD + (inches || 0) / IN_PER_YD + (cm || 0) / CM_PER_YD;
  // 4 decimals, the same as the server stores stock (0.0001 yd is under 0.1 mm), so
  // 1 ft entered here is exactly the 0.3333 yd that was received
  return Math.round(total * 1e4) / 1e4;
}

/** Whole yards, whole feet, and inches (to 0.1) */
export function splitYards(yards: number): { yd: number; ft: number; in: number } {
  let inches = Math.round(Math.abs(yards || 0) * IN_PER_YD * 10) / 10;
  const yd = Math.floor(inches / IN_PER_YD + 1e-9);
  inches = Math.round((inches - yd * IN_PER_YD) * 10) / 10;
  const ft = Math.floor(inches / 12 + 1e-9);
  inches = Math.round((inches - ft * 12) * 10) / 10;
  return { yd, ft, in: inches };
}

/** "39 yd 2 ft 1 in" (parts that are 0 left out; "0 yd" for nothing) */
export function formatLength(yards: number | null | undefined): string {
  const y = Number(yards) || 0;
  const { yd, ft, in: inches } = splitYards(y);
  const parts = [yd && `${yd} yd`, ft && `${ft} ft`, inches && `${inches} in`].filter(Boolean);
  return (y < 0 ? '−' : '') + (parts.length ? parts.join(' ') : '0 yd');
}

/** A material's quantity in its own terms: length for yard stock, "5 pcs" for consumables */
export function formatMaterialQty(
  qty: number | null | undefined,
  material?: { isConsumable?: boolean; unit?: string } | null,
): string {
  if (material?.isConsumable) {
    return `${(Number(qty) || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })} ${material.unit || 'pcs'}`;
  }
  return formatLength(qty);
}
