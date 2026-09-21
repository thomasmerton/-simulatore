# Assumptions, limitations and known gaps

Stated plainly, because a decision-support tool that hides its own limits is
worse than no tool.

## Defaults shipped with a new property

Every one of these is flagged `MODEL_ASSUMPTION` in the UI. None is a forecast,
and none is tuned to any particular market. They exist so a new user is not
faced with thirty empty fields.

| Field | Default | Note |
|-------|---------|------|
| Notary fees | €2,500 | Order of magnitude only. |
| Vacancy | 30 days/yr | ≈8% of the year. Not market-derived. |
| Rent growth | 1%/yr | Arbitrary. Not a forecast. |
| Cost inflation | 2%/yr | Arbitrary. Not a forecast. |
| LTV / rate / term | 70% / 3.5% / 25y | Illustrative financing, not a quote. |
| Price growth | 0% | Deliberately zero: the tool will not guess capital appreciation, which is the single most influential input. |
| Discount rate | 5% | The investor's required return. Genuinely personal. |

Purchase tax, agency commission, selling costs and capital gains tax are **no
longer silent defaults**. They come from a `TaxProfile`, so they carry a
country, an investor type, a transaction type, a source, an effective date and
a `verified` flag. The profile that ships (Italy, second home, private
individual) is **unverified** and everything derived from it is flagged as a
model assumption.

Fields that cannot be guessed at all — **price, surface, rent** — default to
`null` and report as `MISSING`.

## Limitations

Read this section before relying on any output.

### Structural

- **Annual periods, year-end convention.** Mortgage interest accrues monthly,
  but cash flows are discounted annually. Rent seasonality, mid-year purchases
  and monthly discounting are not modelled.
- **Nominal only.** All figures are money of the day. IRR and NPV are nominal;
  compare them against a nominal required return. The unit system *knows* about
  real vs nominal and refuses to convert between them, but the projection does
  not produce a real-terms view.
- **One unit, one loan, one currency per property.** No multi-unit rent rolls,
  no second charge, no refinancing mid-hold (a maturity before the end of the
  amortisation is modelled as a refinance **on the same terms**, which is
  stated as a warning, not hidden).
- **Capex is a smooth annual reserve**, not lumpy real works. Real capex lands
  in a single year and hurts IRR more than a level provision suggests.
- **Renovation is paid entirely at t=0** and capitalised in full. No staged
  payments, no interest on a works facility.

### Data

- **No real market feed is connected.** Everything on the Markets tab is user
  entry or the clearly-badged example dataset.
- **No FX.** A comparison spanning currencies warns and does not convert.
- **No price index**, so nominal figures cannot be restated in real terms.
- **Derived gross yield** is a ratio of two averages, which is not the average
  of the ratio. It is flagged `DERIVED_DATA` for that reason.

### Tax

- **Tax is an input, not encoded law.** Rates, modes and exemption periods are
  user-editable and carry a `verified` flag. Loss carry-forward is not
  modelled. Depreciation and amortisation of works are not modelled.
- **This tool is not tax advice.**

### Portfolio

- **Non-property assets are modelled by yield and growth assumptions only.**
  There is no volatility model and no correlation between assets, so the
  portfolio downside is a simultaneous-shock scenario, not a risk model.
- **Expected income is left blank** unless every asset carries an assumption —
  a partial total would understate it while looking complete.

## What the model does *not* do

These are real limitations, not oversights to be discovered later:

- **Annual periods.** Cash flows are discounted annually with a year-end
  convention. Mortgage interest is computed monthly, but rent seasonality,
  mid-year purchases and monthly discounting are not modelled.
- **No inflation adjustment.** All figures are nominal. IRR and NPV are nominal
  returns; compare them against a nominal required return.
- **One rental unit, one tenant.** No multi-unit buildings, no rent rolls, no
  per-tenant lease terms, no short-let seasonality.
- **No loss carry-forward.** In `FLAT_ON_NET` mode a loss year pays zero tax and
  the loss is not carried forward — the rules vary too much by jurisdiction.
- **No depreciation or amortisation of works.** Some regimes allow this; it is
  not modelled.
- **No refinancing, no second charge, no interest-only, no balloon.** One
  amortising loan per property.
- **Capex reserve is a smooth annual provision,** not lumpy real works. Real
  capex arrives in a single year and hurts IRR more than a level reserve
  suggests.
- **Renovation is paid entirely at t=0** and capitalised in full into the cost
  basis. No staged payments.
- **Portfolio assets other than real estate are modelled by yield and growth
  assumptions only.** There is no volatility model and no correlation between
  assets, so the portfolio downside is a simultaneous-shock scenario, not a
  risk model.
- **No currency risk.** A single currency per analysis.
- **No transaction timing.** Buying costs and selling costs are rates, not
  jurisdiction-specific tax rules.

## Tax is an input, not a rule

No jurisdiction's tax code is encoded as truth. Rates, modes and exemption
periods are user-editable inputs, because tax law varies by country, by
contract type and by year. The Italian defaults are starting points and are
labelled as assumptions everywhere they appear.

**This tool is not tax advice.**

## The scenario levels are stress tests, not forecasts

`−15%`, `−30%`, `+20%` are round numbers chosen to be recognisable stress
levels. They are not predictions for any market and are fully editable. The
Scenarios page says so on screen.

## Known modelling traps this tool avoids

Worth naming, because they are common in ROI calculators:

1. **"Price −15%" applied to the purchase price.** That makes a crash look like
   a bargain and prints a *better* downside IRR. Market value and purchase
   price are separate shocks here (`FORMULAS.md` §9).
2. **A single "IRR".** Levered and unlevered IRR answer different questions;
   both are reported.
3. **Capex inside NOI.** Flatters net yield and breaks comparability with
   market yields. The reserve sits below NOI.
4. **Rate shocks applied to fixed-rate debt.** Overstates downside risk. Shocks
   apply to variable-rate loans only.
5. **Ignoring the void during renovation.** Overstates year-1 income and IRR. A
   stabilisation period is modelled.
6. **Blank meaning zero.** An empty field is `MISSING` and propagates as
   unavailable, not as `0`.
7. **Management fee on potential rent.** An agent is not paid on an empty flat;
   the fee is charged on collected rent.
8. **Payback including sale proceeds.** Turns payback into a restatement of the
   exit assumption. Operating cash flow only.
9. **Truncating a loan schedule at maturity.** Shows zero debt from that year
   on, silently erasing a six-figure liability. The schedule runs to the end of
   the amortisation and maturity is reported as a refinancing requirement.
10. **Rescaling an out-of-range figure.** A vacancy rate of `45` is a
    percentage that was labelled a ratio; the validator **rejects** it rather
    than dividing by 100 and hoping.
11. **Defaulting an ambiguous unit.** `EUR/m²` with no period is rejected, not
    assumed to be monthly.
12. **A composite score.** No market rating, no portfolio score, no risk
    number. Each dimension is reported on its own terms.
13. **Cross-strategy inference.** A short-let model never falls back to the
    long-let rent; it names what it is missing.
14. **Booking equity at purchase.** Value grows from the price paid unless the
    investor supplies an independent valuation, and doing so raises a warning.

## What the tool will never do

No recommendation, no ranking, no score, no "good/bad" verdict on a property or
a market. It reports the consequences of the assumptions entered and identifies
which assumptions the result is most sensitive to. The decision is the user's.
