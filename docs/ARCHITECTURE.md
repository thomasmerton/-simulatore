# Architecture

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | The engine deals in `number \| null` everywhere; the compiler has to enforce that a missing value is handled rather than assumed. |
| Build | Vite | Fast, no config, static output. |
| UI | React 19 | Requested, and the analysis screens are genuinely stateful. |
| Styling | Tailwind v4 (`@tailwindcss/vite`) | One plugin, no config file. Theme tokens are plain CSS custom properties so light/dark swaps in one place. |
| Charts | Recharts | Reliable React API for bar/line. The heatmap is hand-built — no library does a diverging sensitivity grid well. |
| Tests | Vitest | Same transform pipeline as the build; no second toolchain. |
| Persistence | `Repository` interface, localStorage in the MVP | No server needed to be useful. `db/schema.sql` is the Postgres target. |

Dependencies were kept to what earns its place: React, Recharts, Tailwind. No
state library (React context is sufficient), no date library, no form library,
no financial library (the maths is the product — see below).

## Layering

```
  data sources ──► normalization ──► MarketData ──┐
                                                  │
                            user assumptions ─────┼──► /calculations ──► UI
                                                  │      (pure)
                           provenance sidecar ────┘
```

The boundary that matters: **`/calculations` imports nothing from React and
nothing from the store.** It is a library of pure functions over plain data.
That is what makes the 392 tests possible and what would let the same engine
run server-side unchanged.

```
src/
├── calculations/     pure financial engine — no React, no I/O
│   ├── finance.ts        npv, irr, payment, compound, safe division
│   ├── acquisition.ts    total acquisition cost, €/m²
│   ├── rental.ts         GPR, vacancy, opex, NOI
│   ├── mortgage.ts       loan sizing, monthly amortisation, DSCR
│   ├── tax.ts            income tax modes, capital gains
│   ├── returns.ts        IRR, NPV, equity multiple, CoC, payback, yields
│   ├── risk.ts           break-even occupancy, headroom, LTV
│   ├── projection.ts     the orchestrator: inputs → timeline → metrics
│   ├── scenario.ts       shocks, built-in scenario set
│   ├── sensitivity.ts    2-D grids, axis and metric catalogues
│   ├── portfolio.ts      allocation, liquidity, leverage, downside
│   └── __tests__/        392 tests
├── domain/           types, provenance, defaults — the shared vocabulary
├── data/             provider contract, unit normalisation, example dataset
├── store/            Repository interface + localStorage impl + React context
└── ui/               components, charts, pages, formatting
```

## Why calculated metrics are never stored

NOI, IRR, NPV, yields and cash flows are deterministic functions of the inputs.
Persisting them would create a second source of truth that goes stale the moment
a formula is corrected — and formulas do get corrected. There is no
`property_metrics` table and no cache. Everything is recomputed on render;
a full projection over 20 years costs well under a millisecond.

The one thing that *is* persisted alongside inputs is the **engine version** on
a saved `simulation`, so a reproduced run can be compared honestly against the
original if a formula has since changed.

## The provenance sidecar

Every result must be traceable to what it rests on. Two designs were possible:

1. Wrap every value in `{ value, provenance }`.
2. Keep provenance in a separate map keyed by field path.

(2) was chosen. Wrapping would push metadata through every arithmetic
expression in the engine, making the maths harder to read and to test — and the
maths is the part that must be obviously correct. Instead:

```ts
type ProvenanceMap = Record<string, Provenance>;   // 'rental.monthlyRent' → 'USER_INPUT'
weakestProvenance(map, paths)                      // resolves the weakest link
```

A metric is only as trustworthy as its weakest input, so the UI names the
weakest driver under each headline figure (`BasedOn`).

Anything the user edits is promoted to `USER_INPUT` automatically, so shipped
defaults visibly stop being assumptions the moment they are overridden.

## The data source layer

No real feed is wired up, because inventing one would defeat the purpose. What
exists is the contract every future provider must satisfy:

```ts
interface MarketDataProvider {
  readonly id: string;
  readonly name: string;
  readonly methodology: string;
  fetchMarket(query: ProviderQuery): Promise<RawMarketPayload | null>;
}
```

`normalizeMarketPayload` converts units to a canonical form and refuses to emit
a metric it cannot convert — recording the rejection rather than hiding it.
Silently mixing €/m²/year with €/m²/month is exactly the error that produces a
yield twelve times too large, so the conversion table is explicit and a missing
entry is a hard stop.

Every stored datum carries source, `observedAt`, `importedAt`, geographic scope,
unit, confidence and methodology. Those columns are `NOT NULL` in the schema.

### The example dataset

`src/data/exampleMarkets.ts` contains invented placeholder figures so the
comparison screens can be exercised. It is:

- loaded **only** by explicit user action, never automatically;
- stamped `kind: 'EXAMPLE'` with provenance `MODEL_ASSUMPTION`;
- badged in the market list and banner-warned above the comparison table;
- deliberately **incomplete**, so the "Data unavailable" path is visible rather
  than papered over.

## Swapping in a real backend

1. Implement `Repository` against Supabase/Postgres using `db/schema.sql`.
2. Pass it to `<AppProvider repository={...}>`.

Nothing in `/calculations` or `/ui` changes. The provider takes the repository
as a prop precisely so this is a one-line swap — and note that the default is a
module-level singleton, not an inline `new`, because an unstable identity there
re-triggers the hydrate effect on every render and spins an infinite loop.

## Performance

The sensitivity grid re-runs the full projection for all 25 cells, and the
tornado runs it twice per axis. That is deliberate — see `FORMULAS.md` §10 —
and it is fast enough to run synchronously on every keystroke. If a future grid
grows past a few hundred cells, the engine's purity makes it trivial to move to
a worker.
