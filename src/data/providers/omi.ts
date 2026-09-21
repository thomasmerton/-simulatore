/**
 * OMI — Osservatorio del Mercato Immobiliare, Agenzia delle Entrate.
 *
 * THE BEST SOURCE FOR ITALIAN PROPERTY, AND IT HAS NO PUBLIC API.
 *
 * OMI publishes the figures this tool most needs — prices per m² by
 * micro-zone, and NTN transaction volumes — and they are TRANSACTION-based,
 * derived from registered deeds, not asking prices from portals. That
 * distinction is exactly the one the unit system refuses to fudge.
 *
 * But the data is distributed as periodic downloads and through a consultation
 * service that requires registration. There is no open endpoint to call. So
 * this module deliberately does NOT implement a network provider: it
 * implements an IMPORTER for the files OMI actually publishes.
 *
 * Writing a scraper against the consultation service would be a breach of its
 * terms and would break silently the first time the markup changed — feeding
 * wrong numbers into the model while appearing to work. A file the user
 * downloaded themselves is slower and completely traceable.
 *
 * Download: https://www.agenziaentrate.gov.it/portale/web/guest/schede/
 *           fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari
 */

import type { Geography, Period } from '@/domain/datapoint';
import { UNITS } from '@/domain/units';
import type { RawMarketPayload, RawObservation } from '../pipeline';

/**
 * One row of an OMI quotazioni export.
 *
 * OMI quotes a RANGE (min-max) per m² for each zone and typology, not a single
 * figure. The midpoint is taken and the fact that it IS a midpoint is recorded
 * in the methodology — a range collapsed to a point without saying so is how a
 * spread silently becomes a false precision.
 */
export interface OmiQuotationRow {
  comune: string;
  provincia: string;
  /** OMI micro-zone code, e.g. "B1". */
  zona: string;
  zonaDescrizione: string;
  /** Typology, e.g. "Abitazioni civili". */
  tipologia: string;
  /** Lower bound of the quoted range, EUR/m². */
  compravenditaMin: number | null;
  /** Upper bound of the quoted range, EUR/m². */
  compravenditaMax: number | null;
  /** Lower bound of the quoted monthly rent range, EUR/m²/month. */
  locazioneMin: number | null;
  /** Upper bound of the quoted monthly rent range, EUR/m²/month. */
  locazioneMax: number | null;
  /** The OMI semester this row belongs to, e.g. "2025-1". */
  semestre: string;
}

export const OMI_SOURCE_URL =
  'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari';

/** Convert an OMI semester label into an explicit reporting period. */
export function omiSemesterPeriod(semestre: string): Period | null {
  const match = /^(\d{4})[-/ ]?([12])$/.exec(semestre.trim());
  if (!match) return null;
  const year = match[1] as string;
  const half = match[2] === '1';
  return {
    from: half ? `${year}-01-01` : `${year}-07-01`,
    to: half ? `${year}-06-30` : `${year}-12-31`,
    label: `${year} S${match[2]}`,
  };
}

const midpoint = (min: number | null, max: number | null): number | null => {
  if (min === null && max === null) return null;
  if (min === null) return max;
  if (max === null) return min;
  return (min + max) / 2;
};

/**
 * Turn an OMI row into a payload for the normal pipeline.
 *
 * The result carries `kind: 'IMPORTED'` because it came from the publisher's
 * own file, and the methodology states both the transaction basis and the
 * midpoint-of-range treatment.
 */
export function omiRowToPayload(row: OmiQuotationRow): RawMarketPayload | null {
  const period = omiSemesterPeriod(row.semestre);
  if (!period) return null;

  const geography: Geography = {
    country: 'Italy',
    region: null,
    city: row.comune,
    neighborhood: `${row.zona} — ${row.zonaDescrizione}`,
    level: 'NEIGHBORHOOD',
  };

  const price = midpoint(row.compravenditaMin, row.compravenditaMax);
  const rent = midpoint(row.locazioneMin, row.locazioneMax);

  const spread = (min: number | null, max: number | null): string =>
    min !== null && max !== null ? ` Quoted range ${min}–${max}; midpoint taken.` : '';

  const observations: RawObservation[] = [
    {
      metric: 'avgPricePerSqm',
      value: price,
      // OMI quotes TRANSACTION values from registered deeds, not asking prices.
      unit: UNITS.pricePerSqmTransaction,
      currency: 'EUR',
      period,
      confidence: 'HIGH',
      methodology: `OMI quotazioni immobiliari, ${row.tipologia}, zone ${row.zona}. Transaction-based, from registered deeds — not asking prices.${spread(row.compravenditaMin, row.compravenditaMax)}`,
    },
    {
      metric: 'avgRentPerSqmMonth',
      value: rent,
      // OMI quotes rent per m² per MONTH. Stated explicitly so the
      // annual/monthly ambiguity cannot arise.
      unit: UNITS.rentPerSqmMonth,
      currency: 'EUR',
      period,
      confidence: 'MEDIUM',
      methodology: `OMI quotazioni di locazione, ${row.tipologia}, zone ${row.zona}. EUR per m² per MONTH.${spread(row.locazioneMin, row.locazioneMax)}`,
    },
  ];

  return {
    marketName: `${row.comune} — ${row.zona}`,
    geography,
    source: 'OMI — Agenzia delle Entrate',
    sourceUrl: OMI_SOURCE_URL,
    methodology:
      'Osservatorio del Mercato Immobiliare: semi-annual quotations by micro-zone, derived from registered transaction deeds. The authoritative source for Italian transaction prices.',
    observations,
  };
}

/**
 * Parse an OMI CSV export.
 *
 * OMI files are semicolon-separated with comma decimals. Header names are
 * matched case-insensitively against the documented column names; a file whose
 * header does not carry the required columns is REJECTED with the missing
 * names, rather than read positionally — column order has changed between
 * releases and a positional read would silently swap price for rent.
 */
export function parseOmiCsv(
  text: string,
  semestre: string,
): { rows: OmiQuotationRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return { rows: [], errors: ['File is empty or has no data rows.'] };

  const header = (lines[0] as string).split(';').map((h) => h.trim().toLowerCase());
  const need = (name: string): number => header.indexOf(name.toLowerCase());

  const required = ['comune_descrizione', 'zona', 'zona_descr', 'descr_tipologia'];
  const missing = required.filter((c) => need(c) < 0);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        `Missing required column(s): ${missing.join(', ')}. The file is read by column NAME, never by position — OMI has changed column order between releases, and a positional read would silently swap price for rent.`,
      ],
    };
  }

  const num = (raw: string | undefined): number | null => {
    if (!raw || raw.trim() === '') return null;
    const value = Number(raw.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  };

  const idx = {
    comune: need('comune_descrizione'),
    provincia: need('prov'),
    zona: need('zona'),
    zonaDescr: need('zona_descr'),
    tipologia: need('descr_tipologia'),
    comprMin: need('compr_min'),
    comprMax: need('compr_max'),
    locMin: need('loc_min'),
    locMax: need('loc_max'),
  };

  const rows: OmiQuotationRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = (lines[i] as string).split(';');
    const comune = cells[idx.comune]?.trim();
    if (!comune) {
      errors.push(`Row ${i + 1}: no comune.`);
      continue;
    }
    rows.push({
      comune,
      provincia: idx.provincia >= 0 ? (cells[idx.provincia]?.trim() ?? '') : '',
      zona: cells[idx.zona]?.trim() ?? '',
      zonaDescrizione: cells[idx.zonaDescr]?.trim() ?? '',
      tipologia: cells[idx.tipologia]?.trim() ?? '',
      compravenditaMin: idx.comprMin >= 0 ? num(cells[idx.comprMin]) : null,
      compravenditaMax: idx.comprMax >= 0 ? num(cells[idx.comprMax]) : null,
      locazioneMin: idx.locMin >= 0 ? num(cells[idx.locMin]) : null,
      locazioneMax: idx.locMax >= 0 ? num(cells[idx.locMax]) : null,
      semestre,
    });
  }

  return { rows, errors };
}
