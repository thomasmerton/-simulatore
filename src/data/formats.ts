/**
 * Parsers for the two statistical interchange formats the public providers use.
 *
 * These are format parsers, not data. They turn a documented wire format into
 * `(period, value)` pairs and fail loudly on anything they do not recognise —
 * a statistical API that changes shape must break the import, not quietly
 * yield a plausible-looking number from the wrong dimension.
 */

/* ------------------------------------------------------------------ *
 * JSON-stat 2.0  — Eurostat dissemination API
 *
 * {
 *   "value":     { "0": 123.4, "1": 125.1 },
 *   "id":        ["freq","unit","geo","time"],
 *   "size":      [1,1,1,2],
 *   "dimension": { "time": { "category": { "index": { "2023": 0, "2024": 1 } } } }
 * }
 *
 * `value` is a sparse map from FLAT INDEX to number. The flat index is the
 * row-major offset across every dimension, so the time position has to be
 * recovered from the dimension sizes rather than assumed to be the last one.
 * ------------------------------------------------------------------ */

export interface JsonStatResponse {
  value?: Record<string, number | null> | (number | null)[];
  id?: string[];
  size?: number[];
  dimension?: Record<string, { category?: { index?: Record<string, number> | string[] } }>;
}

export interface Observation {
  /** The period label exactly as the publisher writes it, e.g. "2024", "2024-Q3". */
  period: string;
  value: number | null;
}

function categoryIndex(
  dimension: JsonStatResponse['dimension'],
  name: string,
): Record<string, number> | null {
  const index = dimension?.[name]?.category?.index;
  if (!index) return null;
  if (Array.isArray(index)) {
    return Object.fromEntries(index.map((key, i) => [key, i]));
  }
  return index;
}

/**
 * Extract the time series from a JSON-stat response.
 *
 * Throws when the payload does not carry the structure it needs, rather than
 * returning an empty series that would read as "the source has no data".
 */
export function parseJsonStat(payload: JsonStatResponse): Observation[] {
  const ids = payload.id;
  const sizes = payload.size;
  if (!ids || !sizes || ids.length !== sizes.length) {
    throw new Error('JSON-stat payload has no usable id/size structure.');
  }

  const timePos = ids.indexOf('time');
  if (timePos < 0) throw new Error('JSON-stat payload has no "time" dimension.');

  const timeIndex = categoryIndex(payload.dimension, 'time');
  if (!timeIndex) throw new Error('JSON-stat payload has no time category index.');

  // Row-major stride for the time dimension.
  let stride = 1;
  for (let i = timePos + 1; i < sizes.length; i++) stride *= sizes[i] as number;

  // Offset contributed by every other dimension, which must be singular for
  // the series to be unambiguous. A multi-valued dimension means the query
  // was too broad and the caller would be picking an arbitrary slice.
  for (let i = 0; i < sizes.length; i++) {
    if (i !== timePos && (sizes[i] as number) !== 1) {
      throw new Error(
        `JSON-stat payload has ${sizes[i]} values on dimension "${ids[i]}". Narrow the query: picking one would be an arbitrary choice.`,
      );
    }
  }

  const read = (flat: number): number | null => {
    const v = payload.value;
    if (!v) return null;
    if (Array.isArray(v)) return v[flat] ?? null;
    const hit = v[String(flat)];
    return hit === undefined ? null : hit;
  };

  return Object.entries(timeIndex)
    .sort((a, b) => a[1] - b[1])
    .map(([period, position]) => ({ period, value: read(position * stride) }));
}

/* ------------------------------------------------------------------ *
 * SDMX-JSON — ECB Data Portal and ISTAT
 *
 * {
 *   "dataSets": [ { "series": { "0:0:0": { "observations": { "0": [3.81] } } } } ],
 *   "structure": {
 *     "dimensions": { "observation": [ { "id": "TIME_PERIOD", "values": [{"id":"2026-07"}] } ] }
 *   }
 * }
 * ------------------------------------------------------------------ */

export interface SdmxResponse {
  dataSets?: {
    series?: Record<string, { observations?: Record<string, (number | null)[]> }>;
    observations?: Record<string, (number | null)[]>;
  }[];
  structure?: {
    dimensions?: {
      observation?: { id: string; values: { id: string; name?: string }[] }[];
    };
  };
}

export function parseSdmx(payload: SdmxResponse): Observation[] {
  const dataSet = payload.dataSets?.[0];
  if (!dataSet) throw new Error('SDMX payload has no dataSets.');

  const timeDim = payload.structure?.dimensions?.observation?.find(
    (d) => d.id === 'TIME_PERIOD' || d.id === 'TIME',
  );
  if (!timeDim) throw new Error('SDMX payload has no TIME_PERIOD dimension.');

  const seriesKeys = Object.keys(dataSet.series ?? {});
  if (seriesKeys.length > 1) {
    throw new Error(
      `SDMX payload contains ${seriesKeys.length} series. Narrow the key: picking one would be an arbitrary choice.`,
    );
  }

  const observations =
    seriesKeys.length === 1
      ? (dataSet.series?.[seriesKeys[0] as string]?.observations ?? {})
      : (dataSet.observations ?? {});

  return Object.entries(observations)
    .map(([position, cell]) => {
      const label = timeDim.values[Number(position)]?.id;
      if (!label) return null;
      const raw = cell?.[0];
      return { period: label, value: raw === undefined ? null : raw };
    })
    .filter((o): o is Observation => o !== null)
    .sort((a, b) => a.period.localeCompare(b.period));
}

/* ------------------------------------------------------------------ *
 * Period labels
 * ------------------------------------------------------------------ */

/**
 * Turn a publisher's period label into an explicit start/end range.
 * Recognises "2024", "2024-Q3", "2024-07". Anything else is rejected rather
 * than guessed, because a wrong period silently misdates every comparison.
 */
export function parsePeriodLabel(
  label: string,
): { from: string; to: string; label: string } | null {
  const year = /^(\d{4})$/.exec(label);
  if (year) return { from: `${year[1]}-01-01`, to: `${year[1]}-12-31`, label };

  const quarter = /^(\d{4})[-]?Q([1-4])$/i.exec(label);
  if (quarter) {
    const q = Number(quarter[2]);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const lastDay = new Date(Number(quarter[1]), endMonth, 0).getDate();
    return {
      from: `${quarter[1]}-${String(startMonth).padStart(2, '0')}-01`,
      to: `${quarter[1]}-${String(endMonth).padStart(2, '0')}-${lastDay}`,
      label: `${quarter[1]} Q${q}`,
    };
  }

  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(label);
  if (month) {
    const lastDay = new Date(Number(month[1]), Number(month[2]), 0).getDate();
    return {
      from: `${month[1]}-${month[2]}-01`,
      to: `${month[1]}-${month[2]}-${lastDay}`,
      label,
    };
  }

  return null;
}
