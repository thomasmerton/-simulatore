# Assumptions, limitations and known gaps

Stated plainly, because a decision-support tool that hides its own limits is
worse than no tool.

## Defaults shipped with a new property

Every one of these is flagged `MODEL_ASSUMPTION` in the UI. None is a forecast,
and none is tuned to any particular market. They exist so a new user is not
faced with thirty empty fields.

| Field | Default | Note |
|-------|---------|------|
| Purchase tax | 9% | Italian registration tax on a second home. Wrong for a first home, for new-build (VAT), and for every other country. |
| Notary fees | €2,500 | Order of magnitude only. |
| Agency commission | 3% | Common in Italy; varies widely. |
| Vacancy | 30 days/yr | ≈8% of the year. Not market-derived. |
| Rent growth | 1%/yr | Arbitrary. Not a forecast. |
| Cost inflation | 2%/yr | Arbitrary. Not a forecast. |
| LTV / rate / term | 70% / 3.5% / 25y | Illustrative financing, not a quote. |
| Price growth | 0% | Deliberately zero: the tool will not guess capital appreciation, which is the single most influential input. |
| Selling costs | 3% | |
| Capital gains tax | 26%, exempt after 5 years | Italian *plusvalenza* rules for non-primary residences. |
| Discount rate | 5% | The investor's required return. Genuinely personal. |

Fields that cannot be guessed at all — **price, surface, rent** — default to
`null` and report as `MISSING`.

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

## What the tool will never do

No recommendation, no ranking, no score, no "good/bad" verdict on a property or
a market. It reports the consequences of the assumptions entered and identifies
which assumptions the result is most sensitive to. The decision is the user's.
