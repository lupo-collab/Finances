import { SRC_TAGS, type SrcTag } from '../data/schema';

/** Normalise free-form `src` strings ("sourced: justETF", "rule (…)", "approx, …") to a tag. */
export function srcTag(raw: string | null | undefined): SrcTag {
  const s = (raw ?? '').trim().toLowerCase();
  for (const t of SRC_TAGS) if (s.startsWith(t)) return t;
  if (s.startsWith('rule')) return 'sourced';
  if (s.startsWith('approx') || s.startsWith('assumption') || s.startsWith('typical')) return 'estimate';
  if (s.startsWith('previous session')) return 'judgment';
  if (s.startsWith('computed')) return 'computed';
  return 'stated';
}

export const isSoft = (t: SrcTag) => t === 'estimate' || t === 'judgment';

export const TAG_SHORT: Record<SrcTag, string> = {
  statement: 'stmt',
  sheet: 'sheet',
  stated: 'stated',
  payslip: 'payslip',
  offer: 'offer',
  sourced: 'src',
  computed: 'calc',
  estimate: 'est',
  judgment: 'judg',
};
