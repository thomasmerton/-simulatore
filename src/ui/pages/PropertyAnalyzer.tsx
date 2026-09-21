/**
 * Property Analyzer: the input surface plus the resulting economics.
 *
 * Inputs are grouped the way a purchase actually happens — the asset, what it
 * costs to acquire, what it earns, how it is financed, how it is taxed, and
 * how it ends — rather than by which formula consumes them.
 */

import { useMemo } from 'react';
import type { Property, PropertyCondition, PropertyInputs, RateType } from '@/domain/types';
import { runProjection } from '@/calculations/projection';
import { useApp } from '@/store/AppStore';
import {
  FieldGrid,
  NumberField,
  PercentField,
  SelectField,
  TextField,
  ToggleField,
} from '../components/fields';
import { Card, Notice, Stat, Table, Td, Th } from '../components/primitives';
import { BasedOn } from '../components/Assumptions';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatMultiple,
  formatPercent,
  formatYears,
} from '../format';

const CONDITIONS: { value: PropertyCondition; label: string }[] = [
  { value: 'NEW', label: 'New build' },
  { value: 'RENOVATED', label: 'Recently renovated' },
  { value: 'GOOD', label: 'Good condition' },
  { value: 'HABITABLE', label: 'Habitable' },
  { value: 'TO_RENOVATE', label: 'Needs renovation' },
  { value: 'TO_GUT', label: 'Needs gutting' },
];

const RATE_TYPES: { value: RateType; label: string }[] = [
  { value: 'FIXED', label: 'Fixed' },
  { value: 'VARIABLE', label: 'Variable' },
];

export function PropertyAnalyzer({ property }: { property: Property }) {
  const { updatePropertyInputs, renameProperty } = useApp();
  const { inputs, provenance } = property;
  const currency = inputs.settings.currency;

  const result = useMemo(() => runProjection(inputs), [inputs]);

  /** Write one field and mark it as user-supplied. */
  function set<S extends keyof PropertyInputs>(
    section: S,
    key: keyof PropertyInputs[S],
    value: unknown,
  ) {
    const next: PropertyInputs = {
      ...inputs,
      [section]: { ...inputs[section], [key]: value },
    };
    updatePropertyInputs(property.id, next, [`${String(section)}.${String(key)}`]);
  }

  const p = (path: string) => provenance[path];

  return (
    <div className="space-y-4">
      {/* ---------------- Headline ---------------- */}
      <Card
        title="Investment economics"
        subtitle="Computed from the inputs below. Figures update as you type."
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
          <Stat
            label="Total acquisition cost"
            value={formatCurrency(result.acquisition.totalAcquisitionCost, currency)}
            note={
              <BasedOn
                paths={[
                  'facts.purchasePrice',
                  'acquisition.purchaseTaxRate',
                  'acquisition.notaryFees',
                  'acquisition.agencyCommissionRate',
                ]}
                provenance={provenance}
              />
            }
          />
          <Stat
            label="Price per m²"
            value={formatCurrency(result.acquisition.pricePerSqm, currency)}
            note={`Total cost per m²: ${formatCurrency(result.acquisition.totalCostPerSqm, currency)}`}
          />
          <Stat
            label="NOI (year 1)"
            value={formatCurrency(result.year1.noi, currency)}
            note="Collected rent less operating expenses. Excludes debt service, income tax and the capex reserve."
          />
          <Stat
            label="Net yield on total cost"
            value={formatPercent(result.year1.netYieldOnTotalCost)}
            note={
              <BasedOn
                paths={['rental.monthlyRent', 'rental.vacancyDaysPerYear', 'facts.purchasePrice']}
                provenance={provenance}
                extra={`On purchase price alone it is ${formatPercent(result.year1.netYieldOnPrice)}.`}
              />
            }
          />
        </div>

        <div
          className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-t pt-5 sm:grid-cols-3 lg:grid-cols-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <Stat
            label="Gross yield"
            value={formatPercent(result.year1.grossYieldOnPrice)}
            note={`On total cost: ${formatPercent(result.year1.grossYieldOnTotalCost)}`}
          />
          <Stat
            label="Cash flow (year 1)"
            value={formatCurrency(result.year1.afterTaxCashFlow, currency)}
            tone={(result.year1.afterTaxCashFlow ?? 0) < 0 ? 'negative' : 'neutral'}
            note="After operating costs, capex reserve, debt service and income tax."
          />
          <Stat
            label="Cash-on-cash (year 1)"
            value={formatPercent(result.year1.cashOnCash)}
            note={`On equity of ${formatCurrency(result.equityInvested, currency)}`}
          />
          <Stat
            label="Break-even occupancy"
            value={formatPercent(result.year1.breakEvenOccupancyAfterDebt)}
            note={`Before debt: ${formatPercent(result.year1.breakEvenOccupancyBeforeDebt)}. Assumed occupancy: ${formatPercent(result.years[0]?.rental.occupancy)}.`}
          />
          <Stat
            label={`IRR (equity, ${inputs.exit.holdingPeriodYears}y)`}
            value={formatPercent(result.leveredIRR.value)}
            note={`Unlevered: ${formatPercent(result.unleveredIRR.value)}`}
          />
          <Stat
            label="NPV"
            value={formatCurrency(result.npv, currency)}
            note={
              <BasedOn
                paths={['settings.discountRate', 'exit.priceGrowthRate']}
                provenance={provenance}
              />
            }
          />
          <Stat
            label="Equity multiple"
            value={formatMultiple(result.equityMultiple)}
            note="Total cash returned divided by cash invested."
          />
          <Stat
            label="Payback"
            value={
              result.payback.beyondHorizon
                ? `Beyond ${inputs.exit.holdingPeriodYears}y`
                : formatYears(result.payback.years)
            }
            note="From operating cash flow only, excluding any sale."
          />
        </div>

        {result.notes.length > 0 && (
          <div className="mt-5 space-y-2">
            {result.notes.map((note) => (
              <Notice key={note.code} tone={note.severity === 'WARNING' ? 'warning' : 'info'}>
                {note.message}
              </Notice>
            ))}
          </div>
        )}
      </Card>

      {/* ---------------- The asset ---------------- */}
      <Card title="The property" subtitle="What you are buying.">
        <FieldGrid>
          <TextField
            id="name"
            label="Reference name"
            value={property.name}
            onChange={(v) => renameProperty(property.id, v)}
            placeholder="e.g. Via Roma 12"
          />
          <TextField
            id="city"
            label="City"
            value={inputs.facts.city}
            onChange={(v) => set('facts', 'city', v)}
            provenance={p('facts.city')}
          />
          <TextField
            id="district"
            label="District / zone"
            value={inputs.facts.district}
            onChange={(v) => set('facts', 'district', v)}
            provenance={p('facts.district')}
          />
          <TextField
            id="address"
            label="Address (optional)"
            value={inputs.facts.address ?? ''}
            onChange={(v) => set('facts', 'address', v || null)}
          />
          <NumberField
            id="askingPrice"
            label="Asking price"
            value={inputs.facts.askingPrice}
            onChange={(v) => set('facts', 'askingPrice', v)}
            suffix="€"
            provenance={p('facts.askingPrice')}
          />
          <NumberField
            id="purchasePrice"
            label="Price you assume paying"
            value={inputs.facts.purchasePrice}
            onChange={(v) => set('facts', 'purchasePrice', v)}
            suffix="€"
            hint="Defaults to the asking price if left empty."
            provenance={p('facts.purchasePrice')}
          />
          <NumberField
            id="sqm"
            label="Surface"
            value={inputs.facts.sqm}
            onChange={(v) => set('facts', 'sqm', v)}
            suffix="m²"
            provenance={p('facts.sqm')}
          />
          <NumberField
            id="rooms"
            label="Rooms"
            value={inputs.facts.rooms}
            onChange={(v) => set('facts', 'rooms', v)}
            provenance={p('facts.rooms')}
          />
          <NumberField
            id="bathrooms"
            label="Bathrooms"
            value={inputs.facts.bathrooms}
            onChange={(v) => set('facts', 'bathrooms', v)}
            provenance={p('facts.bathrooms')}
          />
          <NumberField
            id="floor"
            label="Floor"
            value={inputs.facts.floor}
            onChange={(v) => set('facts', 'floor', v)}
            hint="0 = ground floor"
            provenance={p('facts.floor')}
          />
          <NumberField
            id="yearBuilt"
            label="Year built"
            value={inputs.facts.yearBuilt}
            onChange={(v) => set('facts', 'yearBuilt', v)}
            provenance={p('facts.yearBuilt')}
          />
          <SelectField
            id="condition"
            label="Condition"
            value={inputs.facts.condition}
            options={CONDITIONS}
            onChange={(v) => set('facts', 'condition', v)}
            provenance={p('facts.condition')}
          />
          <ToggleField
            id="elevator"
            label="Lift in the building"
            checked={inputs.facts.elevator === true}
            onChange={(v) => set('facts', 'elevator', v)}
          />
          <ToggleField
            id="furnished"
            label="Let furnished"
            checked={inputs.facts.furnished === true}
            onChange={(v) => set('facts', 'furnished', v)}
          />
        </FieldGrid>
      </Card>

      {/* ---------------- Acquisition costs ---------------- */}
      <Card
        title="Acquisition costs"
        subtitle="One-off costs at purchase. An explicit amount overrides the corresponding percentage."
      >
        <FieldGrid>
          <PercentField
            id="purchaseTaxRate"
            label="Purchase tax rate"
            value={inputs.acquisition.purchaseTaxRate}
            onChange={(v) => set('acquisition', 'purchaseTaxRate', v)}
            provenance={p('acquisition.purchaseTaxRate')}
            hint="Registration tax, VAT or equivalent, as a share of the price."
          />
          <NumberField
            id="purchaseTaxAmount"
            label="…or exact tax amount"
            value={inputs.acquisition.purchaseTaxAmount}
            onChange={(v) => set('acquisition', 'purchaseTaxAmount', v)}
            suffix="€"
            provenance={p('acquisition.purchaseTaxAmount')}
          />
          <NumberField
            id="notaryFees"
            label="Notary fees"
            value={inputs.acquisition.notaryFees}
            onChange={(v) => set('acquisition', 'notaryFees', v)}
            suffix="€"
            provenance={p('acquisition.notaryFees')}
          />
          <PercentField
            id="agencyCommissionRate"
            label="Agency commission"
            value={inputs.acquisition.agencyCommissionRate}
            onChange={(v) => set('acquisition', 'agencyCommissionRate', v)}
            provenance={p('acquisition.agencyCommissionRate')}
          />
          <NumberField
            id="agencyCommissionAmount"
            label="…or exact commission"
            value={inputs.acquisition.agencyCommissionAmount}
            onChange={(v) => set('acquisition', 'agencyCommissionAmount', v)}
            suffix="€"
            provenance={p('acquisition.agencyCommissionAmount')}
          />
          <NumberField
            id="renovationCost"
            label="Renovation"
            value={inputs.acquisition.renovationCost}
            onChange={(v) => set('acquisition', 'renovationCost', v)}
            suffix="€"
            provenance={p('acquisition.renovationCost')}
          />
          <NumberField
            id="furnitureCost"
            label="Furniture"
            value={inputs.acquisition.furnitureCost}
            onChange={(v) => set('acquisition', 'furnitureCost', v)}
            suffix="€"
            provenance={p('acquisition.furnitureCost')}
          />
          <NumberField
            id="otherUpfrontCosts"
            label="Other upfront costs"
            value={inputs.acquisition.otherUpfrontCosts}
            onChange={(v) => set('acquisition', 'otherUpfrontCosts', v)}
            suffix="€"
            provenance={p('acquisition.otherUpfrontCosts')}
          />
        </FieldGrid>

        {result.acquisition.breakdown.length > 0 && (
          <div className="mt-4">
            <Table>
              <tbody>
                {result.acquisition.breakdown.map((line) => (
                  <tr key={line.key}>
                    <Td muted>{line.label}</Td>
                    <Td align="right">{formatCurrency(line.amount, currency)}</Td>
                  </tr>
                ))}
                <tr>
                  <Td className="font-semibold">Total acquisition cost</Td>
                  <Td align="right" className="font-semibold">
                    {formatCurrency(result.acquisition.totalAcquisitionCost, currency)}
                  </Td>
                </tr>
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {/* ---------------- Rental ---------------- */}
      <Card title="Rental assumptions" subtitle="What the property earns and what it costs to run.">
        <FieldGrid>
          <NumberField
            id="monthlyRent"
            label="Monthly rent"
            value={inputs.rental.monthlyRent}
            onChange={(v) => set('rental', 'monthlyRent', v)}
            suffix="€"
            provenance={p('rental.monthlyRent')}
          />
          <NumberField
            id="vacancyDays"
            label="Vacancy"
            value={inputs.rental.vacancyDaysPerYear}
            onChange={(v) => set('rental', 'vacancyDaysPerYear', v)}
            suffix="days/yr"
            hint="Empty days per year. 30 days is roughly 8% of the year."
            provenance={p('rental.vacancyDaysPerYear')}
          />
          <NumberField
            id="stabilizationMonths"
            label="Months empty at the start"
            value={inputs.rental.stabilizationMonths}
            onChange={(v) => set('rental', 'stabilizationMonths', v)}
            suffix="months"
            hint="Works or letting-up before the first rent arrives. Applies to year 1 only."
            provenance={p('rental.stabilizationMonths')}
          />
          <PercentField
            id="rentGrowthRate"
            label="Annual rent growth"
            value={inputs.rental.rentGrowthRate}
            onChange={(v) => set('rental', 'rentGrowthRate', v)}
            provenance={p('rental.rentGrowthRate')}
          />
          <NumberField
            id="condoFees"
            label="Condominium fees"
            value={inputs.rental.condoFees}
            onChange={(v) => set('rental', 'condoFees', v)}
            suffix="€/yr"
            provenance={p('rental.condoFees')}
          />
          <NumberField
            id="propertyTax"
            label="Property tax (IMU etc.)"
            value={inputs.rental.propertyTax}
            onChange={(v) => set('rental', 'propertyTax', v)}
            suffix="€/yr"
            provenance={p('rental.propertyTax')}
          />
          <NumberField
            id="insurance"
            label="Insurance"
            value={inputs.rental.insurance}
            onChange={(v) => set('rental', 'insurance', v)}
            suffix="€/yr"
            provenance={p('rental.insurance')}
          />
          <NumberField
            id="ordinaryMaintenance"
            label="Ordinary maintenance"
            value={inputs.rental.ordinaryMaintenance}
            onChange={(v) => set('rental', 'ordinaryMaintenance', v)}
            suffix="€/yr"
            provenance={p('rental.ordinaryMaintenance')}
          />
          <NumberField
            id="capexReserve"
            label="Capex reserve"
            value={inputs.rental.capexReserve}
            onChange={(v) => set('rental', 'capexReserve', v)}
            suffix="€/yr"
            hint="Provision for major works. Deducted below NOI, not within it."
            provenance={p('rental.capexReserve')}
          />
          <PercentField
            id="managementFeeRate"
            label="Property management"
            value={inputs.rental.managementFeeRate}
            onChange={(v) => set('rental', 'managementFeeRate', v)}
            hint="Charged on collected rent, so it falls when the flat is empty."
            provenance={p('rental.managementFeeRate')}
          />
          <NumberField
            id="otherOperatingCosts"
            label="Other operating costs"
            value={inputs.rental.otherOperatingCosts}
            onChange={(v) => set('rental', 'otherOperatingCosts', v)}
            suffix="€/yr"
            provenance={p('rental.otherOperatingCosts')}
          />
          <PercentField
            id="expenseGrowthRate"
            label="Annual cost inflation"
            value={inputs.rental.expenseGrowthRate}
            onChange={(v) => set('rental', 'expenseGrowthRate', v)}
            provenance={p('rental.expenseGrowthRate')}
          />
        </FieldGrid>
      </Card>

      {/* ---------------- Financing ---------------- */}
      <Card
        title="Financing"
        subtitle="Leverage changes your return, not the property's. NOI and net yield are unaffected by design."
        actions={
          <ToggleField
            id="financingEnabled"
            label="Use a mortgage"
            checked={inputs.financing.enabled}
            onChange={(v) => set('financing', 'enabled', v)}
          />
        }
      >
        {inputs.financing.enabled ? (
          <>
            <FieldGrid>
              <PercentField
                id="ltv"
                label="Loan-to-value"
                value={inputs.financing.ltv}
                onChange={(v) => set('financing', 'ltv', v)}
                provenance={p('financing.ltv')}
                step={1}
              />
              <NumberField
                id="loanAmount"
                label="…or exact loan amount"
                value={inputs.financing.loanAmount}
                onChange={(v) => set('financing', 'loanAmount', v)}
                suffix="€"
                hint="Overrides loan-to-value when set."
                provenance={p('financing.loanAmount')}
              />
              <PercentField
                id="annualRate"
                label="Interest rate"
                value={inputs.financing.annualRate}
                onChange={(v) => set('financing', 'annualRate', v)}
                provenance={p('financing.annualRate')}
                step={0.05}
              />
              <NumberField
                id="termYears"
                label="Term"
                value={inputs.financing.termYears}
                onChange={(v) => set('financing', 'termYears', v)}
                suffix="years"
                provenance={p('financing.termYears')}
              />
              <SelectField
                id="rateType"
                label="Rate type"
                value={inputs.financing.rateType}
                options={RATE_TYPES}
                onChange={(v) => set('financing', 'rateType', v ?? 'FIXED')}
                hint="Rate shocks in scenarios apply to variable-rate loans only."
                provenance={p('financing.rateType')}
              />
              <NumberField
                id="financingUpfront"
                label="Arrangement costs"
                value={inputs.financing.upfrontCosts}
                onChange={(v) => set('financing', 'upfrontCosts', v)}
                suffix="€"
                provenance={p('financing.upfrontCosts')}
              />
            </FieldGrid>

            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Loan amount" value={formatCurrency(result.loanAmount, currency)} />
              <Stat
                label="Monthly instalment"
                value={formatCurrency(result.years[0]?.debt?.monthlyPayment ?? null, currency, 2)}
              />
              <Stat
                label="Equity invested"
                value={formatCurrency(result.equityInvested, currency)}
              />
              <Stat
                label="DSCR (year 1)"
                value={
                  result.year1.dscr === null ? 'Not calculable' : result.year1.dscr.toFixed(2)
                }
                tone={(result.year1.dscr ?? 1) < 1 ? 'negative' : 'neutral'}
                note="NOI divided by annual debt service."
              />
              <Stat
                label="Lowest DSCR over the hold"
                value={result.minDSCR === null ? 'Not calculable' : result.minDSCR.toFixed(2)}
              />
            </div>

            <div className="mt-5">
              <Table>
                <thead>
                  <tr>
                    <Th>Year</Th>
                    <Th align="right">Opening debt</Th>
                    <Th align="right">Interest</Th>
                    <Th align="right">Principal</Th>
                    <Th align="right">Debt service</Th>
                    <Th align="right">Closing debt</Th>
                  </tr>
                </thead>
                <tbody>
                  {result.years.map((year) => (
                    <tr key={year.year}>
                      <Td>{year.year}</Td>
                      <Td align="right" muted>
                        {formatCurrencyCompact(year.debt?.openingBalance ?? null, currency)}
                      </Td>
                      <Td align="right">{formatCurrency(year.interestPaid, currency)}</Td>
                      <Td align="right">{formatCurrency(year.principalPaid, currency)}</Td>
                      <Td align="right">{formatCurrency(year.debtService, currency)}</Td>
                      <Td align="right" muted>
                        {formatCurrencyCompact(year.loanBalance, currency)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            The analysis is currently all-equity. Turn on a mortgage to model leverage, DSCR and
            cash-on-cash after debt.
          </p>
        )}
      </Card>

      {/* ---------------- Tax, exit, discounting ---------------- */}
      <Card
        title="Taxation, exit and discounting"
        subtitle="Tax rules vary by jurisdiction and change over time. These are your inputs, not the tool's advice."
      >
        <FieldGrid>
          <SelectField
            id="taxMode"
            label="Rental income tax"
            value={inputs.incomeTax.mode}
            options={[
              { value: 'NONE', label: 'None (pre-tax analysis)' },
              { value: 'FLAT_ON_GROSS', label: 'Flat rate on collected rent' },
              { value: 'FLAT_ON_NET', label: 'Flat rate on net profit' },
            ]}
            onChange={(v) => set('incomeTax', 'mode', v ?? 'NONE')}
            provenance={p('incomeTax.mode')}
          />
          <PercentField
            id="taxRate"
            label="Income tax rate"
            value={inputs.incomeTax.rate}
            onChange={(v) => set('incomeTax', 'rate', v)}
            provenance={p('incomeTax.rate')}
          />
          <ToggleField
            id="interestDeductible"
            label="Interest deductible"
            checked={inputs.incomeTax.interestDeductible}
            onChange={(v) => set('incomeTax', 'interestDeductible', v)}
            hint="Applies to the net-profit mode only."
          />
          <NumberField
            id="holdingPeriod"
            label="Holding period"
            value={inputs.exit.holdingPeriodYears}
            onChange={(v) => set('exit', 'holdingPeriodYears', v ?? 1)}
            suffix="years"
            provenance={p('exit.holdingPeriodYears')}
          />
          <PercentField
            id="priceGrowthRate"
            label="Annual price growth"
            value={inputs.exit.priceGrowthRate}
            onChange={(v) => set('exit', 'priceGrowthRate', v)}
            hint="May be negative. This is the single most influential assumption in the model."
            provenance={p('exit.priceGrowthRate')}
          />
          <PercentField
            id="sellingCostsRate"
            label="Selling costs"
            value={inputs.exit.sellingCostsRate}
            onChange={(v) => set('exit', 'sellingCostsRate', v)}
            provenance={p('exit.sellingCostsRate')}
          />
          <PercentField
            id="capitalGainsTaxRate"
            label="Capital gains tax"
            value={inputs.exit.capitalGainsTaxRate}
            onChange={(v) => set('exit', 'capitalGainsTaxRate', v)}
            provenance={p('exit.capitalGainsTaxRate')}
          />
          <NumberField
            id="cgtExempt"
            label="Gain exempt after"
            value={inputs.exit.capitalGainsExemptAfterYears}
            onChange={(v) => set('exit', 'capitalGainsExemptAfterYears', v)}
            suffix="years"
            hint="Leave empty for no exemption."
            provenance={p('exit.capitalGainsExemptAfterYears')}
          />
          <PercentField
            id="discountRate"
            label="Discount rate"
            value={inputs.settings.discountRate}
            onChange={(v) => set('settings', 'discountRate', v)}
            hint="Your required annual return. NPV cannot be computed without it."
            provenance={p('settings.discountRate')}
          />
        </FieldGrid>
      </Card>
    </div>
  );
}
