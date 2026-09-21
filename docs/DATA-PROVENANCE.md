# Data provenance

How a number gets into this tool, what must be known about it, and what the
tool refuses to do to it.

---

## 1. The data classes

Every value belongs to exactly one class. The class says **where the number
came from** — a fact about the number, not a judgement about it.

| Class | Meaning |
|-------|---------|
| `RAW_DATA` | Imported from an identified external source, with its period, unit, methodology and retrieval date recorded. Reported as published. |
| `USER_INPUT` | Entered by you. Taken as given; the tool does not check it. |
| `DERIVED_DATA` | Computed by this tool from other data rather than observed. Carries the uncertainty of everything behind it. |
| `MODEL_ASSUMPTION` | A default built into the tool. Not evidence, not a forecast, not specific to your property. |
| `MISSING` | No value. Nothing substituted, so every dependent metric reports as unavailable. |

**The ordering is for attribution, not quality.** `weakestProvenance` finds the
input a reader should interrogate first. It does *not* claim `RAW_DATA` is
better than `USER_INPUT` — stale, badly-scoped source data can be far worse
than a carefully researched figure you typed yourself. Staleness and
geographic scope are handled separately, by the warning rules in §5.

---

## 2. What every external datum must carry

A `DataPoint` (`src/domain/datapoint.ts`) cannot exist without all of these.
They are required fields, not optional-with-a-default, because a number whose
period or scope is unknown cannot be compared with anything — while looking
exactly as though it can.

| Field | Why it is mandatory |
|-------|---------------------|
| `value` | May be `null` — "the source has no figure" is a real answer. |
| `unit` | Structured, not free text. See §3. |
| `currency` | ISO 4217, or `null` for dimensionless. **No FX conversion is ever performed.** |
| `geography` | Country / region / city / neighbourhood, plus the level it actually resolves to. |
| `period` | The reporting period the figure covers — not when it was fetched. |
| `source` | Publisher name. |
| `sourceUrl` | Where to check it. |
| `retrievedAt` | When this tool fetched it. Distinct from the period. |
| `methodology` | How the publisher produced it. Free text, required. |
| `confidence` | `HIGH` / `MEDIUM` / `LOW`, **as stated by the publisher** — never computed by this tool. |
| `dataClass` | One of the five classes above. |

Every one of these is visible in the UI: click any market figure to open the
provenance panel.

---

## 3. Units, and what will not be converted

Units are structured — a dimension plus the qualifiers that dimension requires
(`src/domain/units.ts`). Conversion is permitted **only** across a scale
qualifier.

**Convertible** (a factor exists):

- monthly rent ↔ annual rent (×12, ÷12)

**Not convertible, at any rate:**

| Pair | Why |
|------|-----|
| asking price ↔ transaction price | The gap varies by market, vendor and moment. There is no constant, and applying an assumed one would bake a guess into "source data". |
| nominal ↔ real | Requires a price index for the right country and period. This tool does not hold one. |
| any change of dimension | €/m² and €/m²/month measure different things. |
| currency ↔ currency | No FX rates are carried. |

**An under-specified unit is rejected, not defaulted.** `EUR/m²` with no stated
period is exactly the ambiguity that produces a yield twelve times too large,
and "probably monthly" is how that ships.

---

## 4. The pipeline

```
Provider  →  Normalizer  →  Validator  →  MarketData  →  Engine  →  UI
```

Each stage can **reject**, and a rejection is always reported with its reason
rather than swallowed.

**Normalizer** (`src/data/pipeline.ts`) converts each observation to the
metric's canonical unit or rejects it. A `null` from the source is recorded as
`MISSING` rather than dropped, so "the source has no figure" stays
distinguishable from "we never asked".

**Validator** asks whether the number is *possible*, not merely the right
shape. It rejects:

- values outside plausible bounds — a `vacancyRate` of `45` is a percentage
  that was labelled a ratio, and it is **rejected, not rescaled**;
- money metrics with no currency;
- inverted reporting periods;
- periods ending in the future.

A market missing a metric shows "Data unavailable", which is usable. A market
showing a silently mis-scaled metric is worse than useless.

---

## 5. Warnings

Deterministic rules, each traceable to a named condition
(`src/domain/quality.ts`). None is a judgement about the investment.

On data: `EXAMPLE_DATA`, `STALE_DATA` (period ends more than 12 months ago),
`COARSE_GEOGRAPHY` (country- or region-level figure used for one property),
`LOW_SOURCE_CONFIDENCE`.

On inputs: `RENT_ESTIMATED`, `VACANCY_ASSUMED`, `EXIT_VALUE_ASSUMED`,
`DISCOUNT_RATE_ASSUMED`, `RENOVATION_INCOMPLETE`, `NO_STABILIZATION`,
`PRE_TAX_ONLY`, `TAX_UNVERIFIED`, `STRATEGY_INCOMPLETE`, `BALLOON_RISK`,
`VALUE_ABOVE_PRICE`.

---

## 6. Result confidence — the methodology

Stated before it is used, and deliberately **not** a weighted numeric score.

Confidence is assigned by rules over the classes of the inputs a metric
depends on:

- **LOW** — the metric depends on a `MISSING` input; **or** on a
  `MODEL_ASSUMPTION` for a driver the result is structurally most sensitive to
  (appreciation, discount rate); **or** more than half its inputs are
  `MODEL_ASSUMPTION`.
- **MEDIUM** — every input is present, but at least one is a
  `MODEL_ASSUMPTION` or `DERIVED_DATA`.
- **HIGH** — every input is `USER_INPUT` or `RAW_DATA`. Note what this does
  **not** claim: that the inputs are correct. Only that nothing was invented
  by the tool.

**There is no 0–100 score on purpose.** Any weighting would be arbitrary, and a
numeric confidence would invite exactly the false precision the layer exists to
prevent. `precisionFor()` also caps displayed decimals by confidence: an IRR
shown as "8.17%" claims precision a LOW-confidence result does not have.

---

## 7. Tax

No jurisdiction's rules are encoded as truth. A `TaxProfile` carries country,
property type, investor type, transaction type, the rates, a `source`, a
`sourceUrl`, an `effectiveDate` and a **`verified`** flag.

`verified: false` means everything derived from that profile is a
`MODEL_ASSUMPTION` and is flagged as such, however precise the rates look. The
Italian profile that ships is **unverified** and says so.

**This tool does not provide tax advice.**

---

## 8. The example dataset

`src/data/exampleMarkets.ts` holds invented placeholder figures so the
comparison screens can be exercised before a real feed exists. It is:

- loaded **only** by explicit user action, never automatically;
- stamped `kind: 'EXAMPLE'` with class `MODEL_ASSUMPTION`;
- badged in the market list and banner-warned above the comparison;
- deliberately **incomplete**, so the "Data unavailable" path stays visible.

---

## 9. The sources that are wired up

| Source | Covers | Resolution | Status |
|--------|--------|------------|--------|
| **Eurostat** | House price index, population | Country | Automatic (`npm run fetch-data`) |
| **ECB — MIR** | Mortgage rate (nominal **and** APRC, separately) | Country, euro area only | Automatic |
| **ISTAT** | Population by comune | City | Automatic |
| **OMI** | Prices and rents per m², by micro-zone | Neighbourhood | **File import** — no public API |
| **Banca d'Italia, ISTAT** | Mortgage rate, price growth, population | Country | **Transcribed** — read off reports |
| AirDNA / Transparent | Short-let ADR, occupancy | Neighbourhood | **Not available** — commercial |
| Numbeo and similar | Crowd-sourced prices/rents | City | **Not connected** — see below |
| Tax treatment | Rates, reliefs | Varies | **Not automatable** |

### Why OMI is a file import and not a scraper

OMI is the best source for Italian property — transaction-based, from
registered deeds, by micro-zone — and it has no public API. Scraping the
consultation service would breach its terms, and a scraper breaks silently the
first time the markup changes: it keeps returning numbers, just the wrong ones.
A file the user downloaded is slower and completely traceable.

The importer reads the CSV **by column name**, never by position, because OMI
has changed column order between releases and a positional read would silently
swap price for rent. OMI quotes a *range* per zone; the midpoint is taken and
the fact that it is a midpoint is recorded in the methodology.

### Why Numbeo is deliberately not connected

Crowd-sourced figures have no stated methodology, no sampling frame and no
reporting period. They cannot satisfy the mandatory fields in §2, so importing
them would mean fabricating a period and a method — an assumption wearing the
costume of data.

### The nominal rate versus the APRC

The ECB publishes both, and so does Banca d'Italia. For June 2026 the Italian
figures were roughly **3.50% nominal** and **3.95% TAEG**. The ~45bp gap *is*
the ancillary cost — which this model already carries separately as
`acquisition.financingFees`. Importing the TAEG as the interest rate would
count those fees twice, so they are stored as two different metrics and the
APRC is never applied as the rate.

---

## 10. Connecting a real source

1. Implement `MarketDataProvider` (`src/data/pipeline.ts`): `id`, `name`,
   `methodology`, `sourceUrl`, `fetchMarket(query)`.
2. Return a `RawMarketPayload` whose observations carry **structured units**
   and a real reporting period.
3. Pass it through `runPipeline`. Accepted points arrive fully attributed;
   rejected ones arrive with a reason to surface.

Nothing downstream changes. `fetchMarket` returning `null` means the source has
no data for that query — a legitimate answer, not an error.
