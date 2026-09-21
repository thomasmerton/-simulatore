/**
 * Provenance / confidence system.
 *
 * Every number that reaches the UI must be attributable. A metric is only as
 * trustworthy as the weakest input it depends on, so the engine reports which
 * input paths drove each metric and the UI resolves the weakest provenance.
 *
 * We deliberately do NOT wrap every value in a `{value, provenance}` box: that
 * would pollute the calculation engine with metadata and make the maths harder
 * to read and test. Instead provenance lives in a sidecar map keyed by dotted
 * field path, and calculations declare their dependencies.
 */

export const PROVENANCE_LEVELS = [
  'VERIFIED',
  'USER_INPUT',
  'ESTIMATED',
  'MODEL_ASSUMPTION',
  'MISSING',
] as const;

export type Provenance = (typeof PROVENANCE_LEVELS)[number];

/** Lower rank = stronger. Used to resolve the weakest link in a dependency set. */
const RANK: Record<Provenance, number> = {
  VERIFIED: 0,
  USER_INPUT: 1,
  ESTIMATED: 2,
  MODEL_ASSUMPTION: 3,
  MISSING: 4,
};

export interface ProvenanceMeta {
  label: string;
  /** Short explanation shown in tooltips. */
  description: string;
  /** Tailwind-ish token consumed by the badge component. */
  tone: 'verified' | 'user' | 'estimated' | 'assumption' | 'missing';
}

export const PROVENANCE_META: Record<Provenance, ProvenanceMeta> = {
  VERIFIED: {
    label: 'Verified',
    description: 'Imported from an identified external source with a timestamp and methodology.',
    tone: 'verified',
  },
  USER_INPUT: {
    label: 'User input',
    description: 'Entered directly by you.',
    tone: 'user',
  },
  ESTIMATED: {
    label: 'Estimated',
    description: 'Derived from other data (e.g. market averages) rather than observed for this property.',
    tone: 'estimated',
  },
  MODEL_ASSUMPTION: {
    label: 'Model assumption',
    description: 'A default built into the model. Not evidence. Change it to match your own view.',
    tone: 'assumption',
  },
  MISSING: {
    label: 'Missing',
    description: 'No value available. Nothing has been invented to fill the gap.',
    tone: 'missing',
  },
};

/** A map of dotted field path -> provenance, e.g. `rental.monthlyRent`. */
export type ProvenanceMap = Record<string, Provenance>;

/** Resolve the weakest (least reliable) provenance across the given paths. */
export function weakestProvenance(map: ProvenanceMap, paths: readonly string[]): Provenance {
  let worst: Provenance = 'VERIFIED';
  for (const path of paths) {
    const p = map[path] ?? 'MISSING';
    if (RANK[p] > RANK[worst]) worst = p;
  }
  return worst;
}

/** Paths whose provenance is at or below (weaker than) the given level. */
export function pathsAtOrWeakerThan(
  map: ProvenanceMap,
  paths: readonly string[],
  level: Provenance,
): string[] {
  return paths.filter((p) => RANK[map[p] ?? 'MISSING'] >= RANK[level]);
}

export function isWeaker(a: Provenance, b: Provenance): boolean {
  return RANK[a] > RANK[b];
}
