# Formula reference

Every formula the engine uses, with the definition it assumes. Where a term is
used inconsistently across the industry, the convention chosen here is stated
and the reason given.

Units: rates are decimals (`0.05` = 5%), amounts are in the property's currency,
periods are years unless stated.

**Rule:** a function returns `null` when an input it needs is missing. It never
substitutes a default, a zero, or a market average. `null` propagates, so a
missing rent makes NOI, net yield, IRR and NPV all unavailable rather than
quietly wrong.

---

## 1. Acquisition

### Price per m²
```
pricePerSqm = purchasePrice / sqm
```
`purchasePrice` falls back to `askingPrice` when no negotiated price is set.

### Cost resolved from a rate or an amount
```
cost = amount            if an explicit amount is given
     = base × rate       else, if a rate is given
     = null              otherwise
```
An explicit amount always wins: a real quote beats a rule of thumb. Absence of
both is *unknown*, not zero — which is why a property with no stated purchase
tax reports an unknown total acquisition cost rather than an understated one.

### Total acquisition cost
```
totalTransactionCosts = purchaseTax + notaryFees + agencyCommission
                      + renovation + furniture + otherUpfrontCosts

totalAcquisitionCost  = purchasePrice + totalTransactionCosts
```
This is the denominator for "on total cost" yields and the cost basis for the
capital gain at exit.

---

## 2. Rental operations

### Occupancy
```
occupancy = (365 − vacancyDaysPerYear) / 365      clamped to [0, 1]
```
The input is **days**, not a market vacancy rate. A missing value leaves
occupancy unknown; it is not assumed to be a full year.

### Gross potential rent (year *t*)
```
GPR(t) = monthlyRent × (1 + rentGrowth)^(t−1) × (12 − stabilizationMonths(t))

stabilizationMonths(t) = stabilizationMonths   if t = 1
                       = 0                     otherwise
```
The stabilisation period models months of works or letting-up with no rent.
Omitting it materially overstates IRR on a renovation case.

### Effective gross income
```
vacancyLoss = GPR × (1 − occupancy)
EGI         = GPR − vacancyLoss
```

### Operating expenses (year *t*)
```
fixedCosts(t) = (condoFees + propertyTax + insurance
               + ordinaryMaintenance + otherOperatingCosts)
               × (1 + expenseGrowth)^(t−1)

managementFee(t) = EGI(t) × managementFeeRate

opex(t) = fixedCosts(t) + managementFee(t)
```
The management fee is charged on **collected** rent, not potential rent: an
agent is not paid on an empty flat.

### Net operating income
```
NOI = EGI − opex
```
NOI **excludes** debt service, income tax and the capex reserve.

> **Why the capex reserve sits below NOI.** Folding *manutenzione
> straordinaria* into NOI is common but it makes net yield flatter than reality
> and breaks comparability with any published market yield, which is quoted on
> a pre-capex basis. The reserve is therefore subtracted after NOI:
> ```
> cashFlowBeforeDebt = NOI − capexReserve
> ```

---

## 3. Yields

Both denominators are reported, because the two conventions genuinely differ
and quoting one number called "yield" is how these tools mislead.

```
grossYieldOnPrice     = GPR / purchasePrice
grossYieldOnTotalCost = GPR / totalAcquisitionCost
netYieldOnPrice       = NOI / purchasePrice
netYieldOnTotalCost   = NOI / totalAcquisitionCost
```
Listing portals quote gross yield on the asking price; an investor's actual
return is measured against everything they paid.

Net yield is a **property-level** metric: it excludes debt service, so it does
not move when the investor changes their financing. That is deliberate — a
metric that improved simply by borrowing more would be useless for comparing
buildings.

---

## 4. Financing

### Loan amount
```
loanAmount = explicit loanAmount       when set
           = purchasePrice × LTV       otherwise
```

### Level instalment (French amortisation, "rata costante")
```
i   = annualRate / 12
n   = termYears × 12
PMT = P × i / (1 − (1 + i)^(−n))            for i > 0
PMT = P / n                                 for i = 0
```

### Amortisation
Simulated **month by month**, then aggregated to annual figures:
```
interest_m  = balance × i
principal_m = PMT − interest_m           (trimmed on the final instalment)
balance    ← balance − principal_m
```
Annual approximation would understate total interest, so it is not used. The
implementation is cross-checked in tests against the closed form:
```
B(12) = P(1 + i)^12 − PMT × ((1 + i)^12 − 1) / i
```

### Variable rates
Rates are supplied as a **per-year path**. At the start of each year the
instalment is recomputed on the outstanding balance over the remaining term at
that year's rate — how an indexed mortgage actually behaves.

A fixed-rate loan is a path of identical rates, so a scenario rate shock
correctly leaves it untouched and the engine emits a `RATE_SHOCK_NOT_APPLIED`
note.

### Debt service coverage ratio
```
DSCR = NOI / annualDebtService          (interest + principal)
```
`null` when there is no debt — the ratio is undefined, not infinite.

---

## 5. Taxation

Income tax sits **below NOI**: it taxes the investor, not the building.
Including it in operating expenses would corrupt NOI and make net yield
incomparable with any market figure.

```
NONE          tax = 0
FLAT_ON_GROSS tax = rate × EGI
FLAT_ON_NET   tax = rate × max(0, NOI − deductibleInterest)
```
`FLAT_ON_GROSS` models a substitute-tax regime such as the Italian *cedolare
secca*, where no costs are deductible. Losses are not carried forward: doing so
requires jurisdiction-specific rules the tool refuses to invent.

### Capital gains
```
gain = netSalePrice − totalAcquisitionCost
tax  = 0                 if holdingPeriod ≥ exemptAfterYears, or gain ≤ 0
     = gain × rate       otherwise
```
The cost basis is the **total** acquisition cost, not the bare purchase price:
transaction costs and capitalised works are part of the investment. Whether a
given tax authority allows the same deductions varies, so the rate and the
exemption period are user inputs.

---

## 6. Cash flow and the projection

### Timing convention

IRR is meaningless without one, so it is stated explicitly:

| Time | Flow |
|------|------|
| `t = 0` | equity paid: deposit, transaction costs, renovation, furniture, loan fees |
| `t = 1..N` | operating cash flow, treated as occurring at **year end** |
| `t = N` | net sale proceeds added to the final year's flow |

Periods are annual. Mortgage interest is still computed monthly (§4) so total
interest is not understated.

### Waterfall
```
NOI
− capexReserve          → cashFlowBeforeDebt
− debtService           → preTaxCashFlow
− incomeTax             → afterTaxCashFlow
```

### Equity invested at t = 0
```
equityInvested = totalAcquisitionCost − loanAmount + financingUpfrontCosts
```

### Property value
```
value(t) = purchasePrice × (1 + priceGrowth)^t × marketValueMultiplier
```
Value grows from the **purchase price**, not the total acquisition cost:
transaction costs are sunk and are not recovered by market appreciation. The
multiplier carries a scenario's market repricing (§9).

### Exit
```
salePrice       = value(N)
sellingCosts    = salePrice × sellingCostsRate
netSalePrice    = salePrice − sellingCosts
netSaleProceeds = netSalePrice − debtRemaining − capitalGainsTax
```

---

## 7. Return metrics

### Cash flow series

Two series are built, and both are reported:

```
Levered (equity-level)    CF₀ = −equityInvested
                          CFₜ = afterTaxCashFlow(t) + netSaleProceeds if t = N

Unlevered (property-level) CF₀ = −totalAcquisitionCost
                           CFₜ = cashFlowBeforeDebt(t) + (netSalePrice − CGT) if t = N
```
Quoting a single number called "IRR" without saying which of these it is hides
the entire effect of leverage.

### Net present value
```
NPV = Σ CFₜ / (1 + r)^t          t = 0..N,  CF₀ undiscounted
```
`r` is the investor's required return. It is a **user input**: it cannot be
derived from the property, so NPV is reported as unavailable when it is unset.

### Internal rate of return
The rate `r` for which `NPV(r) = 0`. Solved by Newton–Raphson with a bisection
fallback over `[−99.99%, +1000%]`; Newton alone diverges on the flat,
near-zero-gradient series a low-leverage property produces.

Returns `null` when the series never changes sign, when no root can be
bracketed, or when the solver fails to converge.

> **Multiple roots.** A series with more than one sign change can satisfy
> several IRRs. The engine flags this (`ambiguous`) rather than hiding it, and
> the UI asks the user to read NPV and equity multiple alongside.

### Equity multiple
```
equityMultiple = (Σ afterTaxCashFlow + netSaleProceeds) / equityInvested
```
`1.0` means the investor got their money back and nothing more.

### Cash-on-cash
```
cashOnCash = afterTaxCashFlow(1) / equityInvested
```
Excludes sale proceeds on purpose: it measures income yield on the money at
risk, not total return.

### Payback period
```
smallest t where Σ afterTaxCashFlow(1..t) ≥ equityInvested,
linearly interpolated within the crossing year
```
Sale proceeds are **excluded**: including them turns payback into a restatement
of the exit assumption rather than a measure of how long the position is under
water on income alone.

---

## 8. Risk metrics

### Break-even occupancy
The occupancy at which cash flow is exactly zero:
```
occupancy* = (fixedOpex + capexReserve + debtService)
           / (GPR × (1 − managementFeeRate))
```
The management fee scales with collected rent, so it is netted off the revenue
side rather than added to costs; adding it would overstate the break-even
point. Other operating costs are assumed fixed with respect to occupancy — the
standard simplification, stated here so the user can judge it.

A result **above 1.0 is returned as-is**, not clamped: it means the property
cannot break even at any occupancy level under these assumptions, which is a
real answer.

```
occupancyHeadroom = assumedOccupancy − occupancy*
LTV(t)            = debtOutstanding(t) / value(t)
```

---

## 9. Scenarios

A scenario is a set of **shocks applied to the base inputs**, not a copy of
them, so editing the base case flows through every scenario.

| Shock | Applied | Direction |
|-------|---------|-----------|
| `purchasePriceDelta` | × on the price **paid** | negative ⇒ cheaper entry ⇒ returns **improve** |
| `marketValueDelta` | × on the asset's **market value** through the hold | negative ⇒ correction ⇒ returns **worsen** |
| `rentDelta` | × on monthly rent | |
| `vacancyDelta` | × on vacancy **days**, capped at 365 | |
| `operatingCostDelta` | × on every recurring cost and the reserve | |
| `interestRateDelta` | **+** on the mortgage rate, variable-rate loans only | |
| `priceGrowthDelta` | **+** on the annual growth rate | |
| `rentGrowthDelta` | **+** on the annual rent growth rate | |

> **The trap this avoids.** "Prices fall 15%" is a *market value* shock. Applying
> it to the purchase price instead would make a crash look like a bargain and
> the downside scenario would print a *better* IRR than the base case. The two
> are separate fields, and the built-in downside scenarios use
> `marketValueDelta`.

---

## 10. Sensitivity

Each cell re-runs the **entire projection** rather than linearising around the
base case. The relationships here — IRR against leverage, break-even against
vacancy — are strongly non-linear, and a gradient approximation would be wrong
exactly where it matters.

The tornado ranks inputs by the swing they produce in the chosen metric when
flexed ±10% (or ±1 point for rates), everything else held. This is a statement
about the arithmetic — where the uncertainty lives — not a judgement about the
investment.

---

## 11. Portfolio

```
totalInvested     = Σ equity
grossAssetValue   = Σ (equity + debt)
leverageRatio     = grossAssetValue / totalInvested        (1.0 = unlevered)
loanToValue       = Σ debt / grossAssetValue
liquidityRatio    = Σ equity(liquid) / totalInvested

expectedIncome    = Σ (equity + debt) × incomeYield
                    — null unless EVERY asset has an assumption
expectedNetCF     = expectedIncome − Σ debt × debtRate

HHI               = Σ (equityᵢ / totalInvested)²
```

`HHI` is a descriptive concentration statistic: `1.0` is everything in one
asset, `1/n` is perfectly even across `n`. It is reported as a measurement, not
a verdict.

### Downside
```
shockedAssetValue = Σ (equity + debt) × (1 + shock)
shockedEquity     = shockedAssetValue − Σ debt
equityChange      = (shockedEquity − totalInvested) / totalInvested
```
Debt does not fall with asset values, which is why a 20% fall in value is a
67% fall in equity at 70% LTV. There is deliberately **no portfolio score**:
allocation, liquidity, leverage and concentration trade off differently for
every investor, and one number would impose a weighting they never chose.
