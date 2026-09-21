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
npm run dev
```

Then open <http://localhost:5173>.

| Command | What it does |
|---------|--------------|
| `npm run dev` | Dev server with hot reload |
| `npm test` | The full test suite (392 tests) |
| `npm run build` | Typecheck, then a production build |
| `npm run fetch-data` | Pull live market data and write a dated snapshot |

No backend or database is required. Data persists in the browser.

> Commands are listed without trailing `#` comments on purpose: interactive
> zsh — the default shell on macOS — does not treat `#` as a comment, so a
> pasted line like `npm run dev  # http://localhost:5173` passes the comment
> to the command as arguments and fails.

---

## What it does

**Underwriting** — the full cash-flow waterfall, every step inspectable:

```
Gross scheduled rent → Vacancy → EGI → Operating expenses → NOI
  → CapEx → Unlevered CF → Debt service → Levered CF → Tax
  → Sale proceeds → Net investor cash flow
```

Deductions are signed, expandable into their parts, and the tests assert that
each subtotal equals the sum of the rows above it — so the displayed arithmetic
is verified, not just the final number.

**Rental strategies** — long-term, short-term, student and room-by-room, each
with its own assumptions. They share nothing: a strategy missing its own inputs
names them and reports "Data unavailable" rather than borrowing another
strategy's figures.

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

**Markets** — individual variables per market, never a composite score. Click
any figure to see its source, reporting period, geography, unit, methodology
and confidence.

**Deals** — import a listing by hand (no scraping), then compare saved
properties on identical metrics including a shared downside stress.

**Capital allocation** — build several ways of deploying the same capital and
compare the consequences: income, liquidity, leverage, concentration, downside.
No ranking, no recommended strategy.

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

Each input carries a data class — `RAW_DATA`, `USER_INPUT`, `DERIVED_DATA`,
`MODEL_ASSUMPTION` or `MISSING` — and each headline metric names the weakest
input driving it:

> **Net yield 4.2%**
> `MODEL ASSUMPTION` · Based on model assumption values for vacancy.

Results carry a **confidence level assigned by stated rules**, not a weighted
score — because any weighting would be arbitrary and would invite exactly the
false precision it exists to prevent. The methodology is in
[`docs/DATA-PROVENANCE.md`](docs/DATA-PROVENANCE.md) §6 and on the Assumptions
tab in the app.

### 3. No recommendations

The tool reports consequences and identifies sensitivities:

> With the assumptions entered, the estimated equity IRR over 10 years is 5.7%.
> The result is most sensitive to annual price growth and monthly rent — a 10%
> change in either moves the IRR by up to 3.4%.

It never says whether that is good.

---

## Units, and what will not be converted

Units are structured, not free text, and conversion is permitted **only** across
a scale qualifier:

| | |
|---|---|
| monthly ↔ annual rent | **converted** (×12) |
| asking ↔ transaction price | **refused** — the gap varies by market and moment |
| nominal ↔ real | **refused** — needs a price index this tool does not hold |
| currency ↔ currency | **refused** — no FX rates are carried |

An under-specified unit is **rejected, not defaulted**: `EUR/m²` with no period
is the ambiguity that produces a yield twelve times too large.

The pipeline is `Provider → Normalizer → Validator → MarketData`, and each
stage reports its rejections rather than swallowing them. A vacancy rate of
`45` is a percentage that was mislabelled a ratio — it is rejected, not
divided by 100.

## Correctness

Mathematical correctness was the top priority, ahead of data, clarity, UI and
feature count in that order.

- **392 tests** across the engine, including closed-form cross-checks (the
  monthly amortisation is verified against the analytic remaining-balance
  formula), waterfall arithmetic reconciliation, and a probe that walks the
  entire result for `NaN`/`Infinity` across 30 degenerate inputs.
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
| Loan schedule not truncated at maturity | Truncating showed zero debt afterwards, erasing a six-figure liability. Maturity is reported as a refinancing requirement instead. |
| Out-of-range data rejected, not rescaled | A ratio of 45 is a mislabelled percentage. Guessing which corrupts every comparison built on it. |
| Strategies never infer from each other | A short-let model that fell back to the long-let rent would be inventing data. |
| Value grows from the price paid | Assuming a property is worth more than was paid manufactures equity at t=0. |

---

## Project layout

```
src/calculations/   pure financial engine — no React, no I/O, 392 tests
src/domain/         types, units, data points, provenance, quality rules
src/data/           provider contract, pipeline, metric catalogue, examples
src/store/          Repository interface + localStorage + React context
src/ui/             components, charts, pages
db/schema.sql       PostgreSQL target schema
docs/               architecture, formulas, assumptions, data provenance
```

The UI is organised in three levels, so a reader can always get from a number
to the assumption behind it:

| Level | Question | Pages |
|-------|----------|-------|
| **Overview** | What is the picture? | Overview |
| **Analysis** | Why are the numbers what they are? | Underwriting, Scenarios, Sensitivity, Deals, Markets, Portfolio, Capital allocation |
| **Assumptions** | Where do they come from? | Inputs, Assumptions & tax |

Full detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/DATA-PROVENANCE.md`](docs/DATA-PROVENANCE.md).

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

Tax is an editable input with a country, a source, an effective date and a
`verified` flag — never encoded law. The Italian profile that ships is
**unverified** and says so.

**This tool is not financial or tax advice.** It computes the consequences of
the assumptions you give it.
