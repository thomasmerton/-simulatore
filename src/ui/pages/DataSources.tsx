/**
 * Data sources — what this tool can pull, what it cannot, and why.
 *
 * The honest inventory. A reader should be able to tell, without reading any
 * code, which figures could arrive automatically, which require a file, and
 * which are simply not available.
 */

import { useState } from 'react';
import { parseOmiCsv, omiRowToPayload, OMI_SOURCE_URL } from '@/data/providers/omi';
import { runPipeline } from '@/data/pipeline';
import { referenceMarkets, isReferenceMarket } from '@/data/referenceData';
import { exampleMarkets } from '@/data/exampleMarkets';
import { newId } from '@/store/repository';
import { useApp } from '@/store/AppStore';
import { Button, Card, Notice, Table, Td, Th } from '../components/primitives';

type Availability = 'AUTOMATIC' | 'FILE_IMPORT' | 'TRANSCRIBED' | 'UNAVAILABLE';

const AVAILABILITY_META: Record<Availability, { label: string; color: string }> = {
  AUTOMATIC: { label: 'Automatic', color: 'var(--positive)' },
  FILE_IMPORT: { label: 'File import', color: 'var(--accent)' },
  TRANSCRIBED: { label: 'Transcribed', color: 'var(--warning)' },
  UNAVAILABLE: { label: 'Not available', color: 'var(--negative)' },
};

interface SourceRow {
  source: string;
  covers: string;
  resolution: string;
  availability: Availability;
  note: string;
  url: string | null;
}

const SOURCES: SourceRow[] = [
  {
    source: 'Eurostat',
    covers: 'House price index, population',
    resolution: 'Country',
    availability: 'AUTOMATIC',
    note: 'Harmonised across member states, which is what makes countries comparable with each other. Country-level only, so it raises a coarse-geography warning when used for one property.',
    url: 'https://ec.europa.eu/eurostat/web/main/data/database',
  },
  {
    source: 'ECB — MIR statistics',
    covers: 'Mortgage rates (nominal and APRC)',
    resolution: 'Country',
    availability: 'AUTOMATIC',
    note: 'Imports the nominal rate and the APRC as separate metrics. The APRC includes fees, which this model carries separately, so it is never applied as the interest rate. Euro area only.',
    url: 'https://data.ecb.europa.eu/data/datasets/MIR',
  },
  {
    source: 'ISTAT',
    covers: 'Population by comune',
    resolution: 'City',
    availability: 'AUTOMATIC',
    note: 'Keyed by official comune code, not by name — Italy has several places sharing a name. Better than Eurostat within Italy, worse across borders.',
    url: 'https://esploradati.istat.it/',
  },
  {
    source: 'OMI — Agenzia delle Entrate',
    covers: 'Prices and rents per m², by micro-zone',
    resolution: 'Neighbourhood',
    availability: 'FILE_IMPORT',
    note: 'The best source for Italian property: transaction-based, from registered deeds, not asking prices. It has no public API, and scraping the consultation service would breach its terms and break silently. Download the quotazioni file and import it below.',
    url: OMI_SOURCE_URL,
  },
  {
    source: "Banca d'Italia, ISTAT (national reference)",
    covers: 'Mortgage rate, house price growth, population',
    resolution: 'Country',
    availability: 'TRANSCRIBED',
    note: 'Read off published reports rather than imported from a data service. Real figures with named sources, but the transcription is unverified — each carries a standing warning to check it.',
    url: 'https://www.bancaditalia.it/pubblicazioni/moneta-banche/',
  },
  {
    source: 'AirDNA / Transparent',
    covers: 'Short-let ADR and occupancy',
    resolution: 'Neighbourhood',
    availability: 'UNAVAILABLE',
    note: 'Commercial and paywalled. No figures are shipped. Short-let assumptions stay your own input until you subscribe and enter them, and the tool reports them as missing rather than guessing.',
    url: null,
  },
  {
    source: 'Numbeo and similar',
    covers: 'Crowd-sourced prices and rents',
    resolution: 'City',
    availability: 'UNAVAILABLE',
    note: 'Deliberately not connected. Crowd-sourced figures have no stated methodology, no sampling frame and no reporting period, so they cannot satisfy this tool’s provenance requirements — they would have to be imported as an assumption wearing the costume of data.',
    url: null,
  },
  {
    source: 'Tax treatment',
    covers: 'Rates, reliefs, exemptions',
    resolution: 'Varies',
    availability: 'UNAVAILABLE',
    note: 'Not automatable and not attempted. Tax depends on the investor, the property and the year. Use a tax profile, mark it verified only once a professional has confirmed it, and treat everything else as an assumption.',
    url: null,
  },
];

export function DataSources() {
  const { markets, loadExampleMarkets, upsertMarket } = useApp();
  const [omiText, setOmiText] = useState('');
  const [semestre, setSemestre] = useState('2025-1');
  const [importReport, setImportReport] = useState<string[] | null>(null);

  const hasReference = markets.some(isReferenceMarket);

  const importOmi = () => {
    const { rows, errors } = parseOmiCsv(omiText, semestre);
    const report: string[] = [...errors];

    let imported = 0;
    for (const row of rows) {
      const payload = omiRowToPayload(row);
      if (!payload) {
        report.push(`${row.comune} ${row.zona}: unrecognised semester "${row.semestre}".`);
        continue;
      }
      const result = runPipeline(payload);
      for (const rejection of result.rejected) {
        report.push(`${row.comune} ${row.zona} — ${rejection.metricLabel}: ${rejection.reason}`);
      }
      if (Object.keys(result.accepted).length === 0) continue;

      upsertMarket({
        id: newId(),
        name: `${row.comune} — ${row.zona}`,
        geography: payload.geography,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metrics: result.accepted,
        regulationNotes: null,
        riskNotes: null,
      });
      imported++;
    }

    report.unshift(
      imported === 0
        ? 'Nothing was imported.'
        : `Imported ${imported} zone${imported === 1 ? '' : 's'}.`,
    );
    setImportReport(report);
  };

  return (
    <div className="space-y-4">
      <Card
        title="Data sources"
        subtitle="What can arrive automatically, what needs a file, and what is simply not available."
      >
        <Table>
          <thead>
            <tr>
              <Th sticky>Source</Th>
              <Th>Covers</Th>
              <Th>Resolution</Th>
              <Th>Availability</Th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((row) => (
              <tr key={row.source}>
                <Td sticky>
                  {row.url ? (
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      {row.source}
                    </a>
                  ) : (
                    row.source
                  )}
                  <p className="mt-1 max-w-md text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                    {row.note}
                  </p>
                </Td>
                <Td muted>{row.covers}</Td>
                <Td muted>{row.resolution}</Td>
                <Td>
                  <span
                    className="whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                    style={{
                      color: AVAILABILITY_META[row.availability].color,
                      borderColor: AVAILABILITY_META[row.availability].color,
                    }}
                  >
                    {AVAILABILITY_META[row.availability].label}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <div className="mt-4">
          <Notice>
            Automatic sources are fetched by <code>npm run fetch-data</code>, which writes a dated
            snapshot and prints every rejection. It exits non-zero if nothing was fetched, rather
            than leaving stale figures in place while reporting success.
          </Notice>
        </div>
      </Card>

      <Card
        title="Load reference data"
        subtitle="National-level figures with named sources, for the two assumptions the result is most sensitive to."
        actions={
          <>
            {!hasReference && (
              <Button size="sm" variant="primary" onClick={() => loadExampleMarkets(referenceMarkets())}>
                Load Italian reference data
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => loadExampleMarkets(exampleMarkets())}>
              Load illustrative examples
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Notice tone="warning" title="Transcribed, not machine-imported.">
            These figures were read off published reports by hand. The figures and their sources are
            real, but nothing verified the transcription, so each carries a standing warning. They
            are also <strong>national</strong>, while your analysis is about one property in one
            street — the coarse-geography warning will fire, and it is right to.
          </Notice>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            The mortgage pair is the point of this set: Banca d&apos;Italia publishes a nominal rate
            and a TAEG for the same month, and the gap between them is exactly the ancillary cost
            this model already carries as financing fees. Using the TAEG as the interest rate would
            count those fees twice, which is why they are stored as separate metrics.
          </p>
        </div>
      </Card>

      <Card
        title="Import OMI quotations"
        subtitle="The authoritative Italian source. Download the file, paste it here."
      >
        <Notice>
          Nothing is scraped. OMI has no public API, and the consultation service&apos;s terms do
          not permit automated access — a scraper would also break silently the first time the
          markup changed, feeding wrong numbers in while appearing to work.{' '}
          <a
            href={OMI_SOURCE_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="underline"
            style={{ color: 'var(--accent)' }}
          >
            Download the quotazioni file
          </a>{' '}
          and paste its contents below. Columns are matched by name, so the order does not matter.
        </Notice>

        <div className="mt-4 grid gap-3 sm:grid-cols-[10rem_1fr]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Semester
            </span>
            <input
              className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-1.5 text-sm"
              style={{ borderColor: 'var(--border-strong)' }}
              value={semestre}
              placeholder="2025-1"
              onChange={(e) => setSemestre(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              CSV contents
            </span>
            <textarea
              rows={6}
              className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs"
              style={{ borderColor: 'var(--border-strong)' }}
              value={omiText}
              placeholder="Comune_descrizione;Prov;Zona;Zona_Descr;Descr_Tipologia;Compr_min;Compr_max;Loc_min;Loc_max"
              onChange={(e) => setOmiText(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" disabled={omiText.trim() === ''} onClick={importOmi}>
            Import
          </Button>
          {omiText.trim() === '' && (
            <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
              Paste a file to import.
            </span>
          )}
        </div>

        {importReport && (
          <div className="mt-4 space-y-1.5">
            {importReport.map((line, i) => (
              <p
                key={i}
                className="text-xs"
                style={{ color: i === 0 ? 'var(--text)' : 'var(--warning)' }}
              >
                {line}
              </p>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
