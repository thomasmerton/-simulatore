# Real Estate Investment Analyzer

A decision-support tool for property investment. It turns **property data +
market data + your assumptions** into **investment economics, scenarios, risk
metrics and comparisons** — and stops there.

It does not tell you what to buy. There are no scores, no rankings, no
"9/10", no "this market is better". It answers:

> *If I have X capital, what are the economic consequences of the property
> strategies I am considering?*

not

> *Tell me where to invest.*

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 190 tests
npm run build      # typecheck + production build
```

No backend or database is required. Data persists in the browser.

---

## What it does

**Property analyzer** — full acquisition and rental economics: €/m², total
acquisition cost, gross and net yield (on both price and total cost), NOI, cash
flow, break-even occupancy, cash-on-cash, payback, IRR, NPV, equity multiple.

**Mortgage** — LTV or explicit loan amount, fixed or variable rate, monthly
amortisation, DSCR, cash flow after debt, equity invested. Rate and LTV are
editable in place.

**Holding period** — 1 / 3 / 5 / 10 / 15 / 20 years side by side, each a full
re-run. Year-by-year capital invested, cumulative cash flow, property value,
debt outstanding, equity, profit, IRR, NPV, equity multiple.

**Exit simulation** — sale price, selling costs, debt repayment, capital gain
and tax, net proceeds, total profit.

**Scenarios** — base / downside / severe downside / upside, every shock
editable, applied to your base inputs rather than stored as copies.

**Sensitivity** — 2-D heatmaps over any two of seven inputs against any of
seven metrics, plus a tornado showing which assumptions actually move the
answer.

**Property comparison** — identical metrics, stable order, no ranking.

**Markets** — individual variables per market, never a composite score.
Comparison table across as many markets as you select.

**Portfolio builder** — allocate capital across real estate, equities, bonds
and cash; see allocation, geographic exposure, liquidity, leverage,
concentration, expected income and a downside. No portfolio score.

---

## The three rules the product is built on

### 1. Missing data is never invented

An empty field is `MISSING`, not `0`. It propagates: a missing rent makes NOI,
net yield, IRR and NPV all report **"Data unavailable"** rather than quietly
producing a confident wrong number.

### 2. Every figure states what it rests on

Each input carries a confidence level — `VERIFIED`, `USER INPUT`, `ESTIMATED`,
`MODEL ASSUMPTION` or `MISSING` — and each headline metric names the weakest
input driving it:

> **Net yield 4.2%**
> `MODEL ASSUMPTION` · Based on model assumption values for vacancy.

### 3. No recommendations

The tool reports consequences and identifies sensitivities:

> With the assumptions entered, the estimated equity IRR over 10 years is 5.7%.
> The result is most sensitive to annual price growth and monthly rent — a 10%
> change in either moves the IRR by up to 3.4%.

It never says whether that is good.

---

## Correctness

Mathematical correctness was the top priority, ahead of data, clarity, UI and
feature count in that order.

- **190 tests** across the engine, including closed-form cross-checks (the
  monthly amortisation is verified against the analytic remaining-balance
  formula) and end-to-end reconciliation of the full projection.
- **Every formula is documented** with the definition it assumes —
  [`docs/FORMULAS.md`](docs/FORMULAS.md).
- **Ambiguous terms are disambiguated and both variants reported** where the
  industry disagrees (gross yield on price *and* on total cost; levered *and*
  unlevered IRR).
- **No magic numbers.** Every constant is named and exported.

Some modelling decisions worth knowing about, each of which a naive
implementation gets wrong:

| Decision | Why |
|----------|-----|
| Market-value shock ≠ purchase-price shock | Otherwise "prices fall 15%" makes the downside scenario print a *better* IRR than the base case. |
| Levered **and** unlevered IRR | A single "IRR" hides the entire effect of leverage. |
| Capex reserve sits *below* NOI | Folding it in flatters net yield and breaks comparability with market yields. |
| Rate shocks hit variable-rate debt only | A fixed-rate borrower is contractually insulated; shocking them overstates downside risk. |
| Vacancy in days, converted to occupancy | Never conflated with a market vacancy *rate*. |
| Stabilisation period (months with no rent) | Ignoring the void during works materially overstates IRR. |
| Management fee on *collected* rent | An agent is not paid on an empty flat. |
| Payback excludes sale proceeds | Otherwise it just restates the exit assumption. |
| Income tax below NOI | It taxes the investor, not the building. |

---

## Project layout

```
src/calculations/   pure financial engine — no React, no I/O, 190 tests
src/domain/         types, provenance system, defaults
src/data/           provider contract, unit normalisation, example dataset
src/store/          Repository interface + localStorage + React context
src/ui/             components, charts, pages
db/schema.sql       PostgreSQL target schema
docs/               architecture, formulas, assumptions
```

Full detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Market data

**No real market feed is connected.** Inventing one would defeat the purpose.
What exists is the architecture to import one:

```
Data source → Normalization → Market Data → Analysis Engine → UI
```

Every external datum must carry source, timestamp, geographic scope, unit,
confidence and methodology — those fields are `NOT NULL` in the schema. Adding
a provider means implementing `MarketDataProvider` in `src/data/source.ts`;
nothing downstream changes.

An **illustrative example dataset** ships for demonstration. It is invented,
loaded only by explicit user action, badged as `EXAMPLE` everywhere it appears,
banner-warned above the comparison table, and deliberately incomplete so the
"Data unavailable" path stays visible.

---

## Limitations

Read [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) before relying on any output.
In short: annual periods, nominal figures, one unit and one loan per property,
no inflation adjustment, no loss carry-forward, no volatility or correlation
model in the portfolio, and tax treated as a user input rather than encoded
law.

**This tool is not financial or tax advice.** It computes the consequences of
the assumptions you give it.
