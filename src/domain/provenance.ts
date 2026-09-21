/**
 * Data classification and provenance.
 *
 * Every number the tool shows belongs to exactly one class. The class is not a
 * quality score — it says WHERE THE NUMBER CAME FROM, which is a fact about the
 * number rather than a judgement about it. A user's own carefully researched
 * rent is `USER_INPUT`; so is a wild guess they typed. The class tells the
 * reader which question to ask.
 *
 * A metric is only as attributable as the weakest input behind it, so the
 * engine reports which input paths drove each metric and the UI resolves the
 * weakest class across them.
 *
 * Provenance lives in a sidecar map keyed by dotted field path rather than
 * wrapping every value in `{value, class}`. Wrapping would push metadata
 * through every arithmetic expression in the engine and make the maths harder
 * to read and to test — and the maths is the part that must be obviously right.
 */

export const DATA_CLASSES = [
  'RAW_DATA',
  'DERIVED_DATA',
  'USER_INPUT',
  'MODEL_ASSUMPTION',
  'MISSING',
] as const;

/** The class of a datum. Named `Provenance` throughout the codebase. */
export type Provenance = (typeof DATA_CLASSES)[number];

/**
 * Ordering used only to find the weakest link in a dependency set — i.e. the
 * input a reader should interrogate first. It is NOT a quality ranking:
 * `RAW_DATA` from a stale, badly-scoped source can be worse than a
 * well-researched `USER_INPUT`. The staleness and scope questions are handled
 * separately by the warning rules in `quality.ts`.
 */
const ATTRIBUTION_ORDER: Record<Provenance, number> = {
  RAW_DATA: 0,
  USER_INPUT: 1,
  DERIVED_DATA: 2,
  MODEL_ASSUMPTION: 3,
  MISSING: 4,
};

export interface ProvenanceMeta {
  label: string;
  /** Shown in tooltips and in the assumptions register. */
  description: string;
  tone: 'raw' | 'user' | 'derived' | 'assumption' | 'missing';
  /** True when the value did not come from the outside world or the user. */
  isAssumption: boolean;
}

export const PROVENANCE_META: Record<Provenance, ProvenanceMeta> = {
  RAW_DATA: {
    label: 'Source data',
    description:
      'Imported from an identified external source, with its period, unit, methodology and retrieval date recorded. Reported as published — not adjusted by this tool.',
    tone: 'raw',
    isAssumption: false,
  },
  USER_INPUT: {
    label: 'Your input',
    description: 'Entered by you. The tool takes it as given and does not check it.',
    tone: 'user',
    isAssumption: false,
  },
  DERIVED_DATA: {
    label: 'Derived',
    description:
      'Computed by this tool from other data rather than observed directly. Carries the uncertainty of everything it was computed from.',
    tone: 'derived',
    isAssumption: false,
  },
  MODEL_ASSUMPTION: {
    label: 'Model assumption',
    description:
      'A default built into the tool. Not evidence, not a forecast, and not specific to your property or market. Replace it with your own view.',
    tone: 'assumption',
    isAssumption: true,
  },
  MISSING: {
    label: 'Missing',
    description:
      'No value available. Nothing has been substituted, so every metric that needs it reports as unavailable.',
    tone: 'missing',
    isAssumption: false,
  },
};

/** Map of dotted field path -> class, e.g. `rental.monthlyRent`. */
export type ProvenanceMap = Record<string, Provenance>;

/** The weakest-attributed class across the given paths. */
export function weakestProvenance(map: ProvenanceMap, paths: readonly string[]): Provenance {
  let worst: Provenance = 'RAW_DATA';
  for (const path of paths) {
    const p = map[path] ?? 'MISSING';
    if (ATTRIBUTION_ORDER[p] > ATTRIBUTION_ORDER[worst]) worst = p;
  }
  return worst;
}

/** Every path in `paths` whose class equals `level`. */
export function pathsWithClass(
  map: ProvenanceMap,
  paths: readonly string[],
  level: Provenance,
): string[] {
  return paths.filter((p) => (map[p] ?? 'MISSING') === level);
}

/** Count of each class across the given paths, for the assumptions register. */
export function classCounts(
  map: ProvenanceMap,
  paths: readonly string[],
): Record<Provenance, number> {
  const counts: Record<Provenance, number> = {
    RAW_DATA: 0,
    DERIVED_DATA: 0,
    USER_INPUT: 0,
    MODEL_ASSUMPTION: 0,
    MISSING: 0,
  };
  for (const path of paths) counts[map[path] ?? 'MISSING']++;
  return counts;
}

/** True when nothing in `paths` is an assumption or missing. */
export function isFullyAttributed(map: ProvenanceMap, paths: readonly string[]): boolean {
  return paths.every((p) => {
    const cls = map[p] ?? 'MISSING';
    return cls !== 'MODEL_ASSUMPTION' && cls !== 'MISSING';
  });
}
