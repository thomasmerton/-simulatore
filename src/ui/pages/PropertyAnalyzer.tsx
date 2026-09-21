/**
 * Property Analyzer: the input surface plus the resulting economics.
 *
 * Inputs are grouped the way a purchase actually happens — the asset, what it
 * costs to acquire, what it earns, how it is financed, how it is taxed, and
 * how it ends — rather than by which formula consumes them.
 */

import { useMemo } from 'react';
import type {
  Property,
  PropertyCondition,
  PropertyInputs,
  RateType,
  RentalStrategy,
  RoomByRoomAssumptions,
  ShortTermAssumptions,
  StudentAssumptions,
} from '@/domain/types';
import { RENTAL_STRATEGY_LABELS } from '@/domain/types';
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

  /** Location is a nested object, so it gets its own writer. */
  function setLocation(patch: Partial<PropertyInputs['facts']['location']>) {
    const next: PropertyInputs = {
      ...inputs,
      facts: { ...inputs.facts, location: { ...inputs.facts.location, ...patch } },
    };
    updatePropertyInputs(property.id, next, ['facts.location']);
  }

  /** Each strategy's assumptions live in their own nested block. */
  function setShortTerm<K extends keyof ShortTermAssumptions>(
    key: K,
    value: ShortTermAssumptions[K],
  ) {
    const next: PropertyInputs = {
      ...inputs,
      rental: { ...inputs.rental, shortTerm: { ...inputs.rental.shortTerm, [key]: value } },
    };
    updatePropertyInputs(property.id, next, [`rental.shortTerm.${String(key)}`]);
  }

  function setStudent<K extends keyof StudentAssumptions>(key: K, value: StudentAssumptions[K]) {
    const next: PropertyInputs = {
      ...inputs,
      rental: { ...inputs.rental, student: { ...inputs.rental.student, [key]: value } },
    };
    updatePropertyInputs(property.id, next, [`rental.student.${String(key)}`]);
  }

  function setRoomByRoom<K extends keyof RoomByRoomAssumptions>(
    key: K,
    value: RoomByRoomAssumptions[K],
  ) {
    const next: PropertyInputs = {
      ...inputs,
      rental: { ...inputs.rental, roomByRoom: { ...inputs.rental.roomByRoom, [key]: value } },
    };
    updatePropertyInputs(property.id, next, [`rental.roomByRoom.${String(key)}`]);
  }

  const strategy = inputs.rental.strategy;
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
            id="country"
            label="Country"
            value={inputs.facts.location.country}
            onChange={(v) => setLocation({ country: v })}
            provenance={p('facts.location')}
          />
          <TextField
            id="region"
            label="Region"
            value={inputs.facts.location.region ?? ''}
            onChange={(v) => setLocation({ region: v || null })}
          />
          <TextField
            id="city"
            label="City"
            value={inputs.facts.location.city ?? ''}
            onChange={(v) => setLocation({ city: v || null })}
          />
          <TextField
            id="neighborhood"
            label="Neighbourhood"
            value={inputs.facts.location.neighborhood ?? ''}
            onChange={(v) => setLocation({ neighborhood: v || null })}
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
            id="marketValue"
            label="Independent valuation"
            value={inputs.facts.marketValue}
            onChange={(v) => set('facts', 'marketValue', v)}
            suffix="€"
            hint="Leave empty to value the property at what you paid. The tool will not assume it is worth more."
            provenance={p('facts.marketValue')}
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
            id="legalFees"
            label="Legal fees"
            value={inputs.acquisition.legalFees}
            onChange={(v) => set('acquisition', 'legalFees', v)}
            suffix="€"
            hint="Conveyancing or advice, separate from the notary."
            provenance={p('acquisition.legalFees')}
          />
          <NumberField
            id="financingFees"
            label="Financing fees"
            value={inputs.acquisition.financingFees}
            onChange={(v) => set('acquisition', 'financingFees', v)}
            suffix="€"
            hint="Arrangement, survey and mortgage registration."
            provenance={p('acquisition.financingFees')}
          />
          <NumberField
            id="initialReserves"
            label="Initial reserves"
            value={inputs.acquisition.initialReserves}
            onChange={(v) => set('acquisition', 'initialReserves', v)}
            suffix="€"
            hint="Working capital set aside at purchase. Committed as equity, returned at exit."
            provenance={p('acquisition.initialReserves')}
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

      {/* ---------------- Strategy ---------------- */}
      <Card
        title="Letting strategy"
        subtitle="Each strategy has its own assumptions. Nothing is carried across — a short-let occupancy rate is not a long-let one."
        actions={
          <select
            className="rounded-lg border bg-[var(--surface)] px-2.5 py-1.5 text-sm"
            style={{ borderColor: 'var(--border-strong)' }}
            value={strategy}
            onChange={(e) => set('rental', 'strategy', e.target.value as RentalStrategy)}
          >
            {(Object.keys(RENTAL_STRATEGY_LABELS) as RentalStrategy[]).map((k) => (
              <option key={k} value={k}>
                {RENTAL_STRATEGY_LABELS[k]}
              </option>
            ))}
          </select>
        }
      >
        {strategy === 'LONG_TERM' && (
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
          </FieldGrid>
        )}

        {strategy === 'SHORT_TERM' && (
          <FieldGrid>
            <NumberField
              id="st-adr"
              label="Average daily rate"
              value={inputs.rental.shortTerm.averageDailyRate}
              onChange={(v) => setShortTerm('averageDailyRate', v)}
              suffix="€"
              hint="Net of any cleaning fee billed separately to the guest."
              provenance={p('rental.shortTerm.averageDailyRate')}
            />
            <PercentField
              id="st-occ"
              label="Occupancy rate"
              value={inputs.rental.shortTerm.occupancyRate}
              onChange={(v) => setShortTerm('occupancyRate', v)}
              hint="Share of nights sold across the year."
              provenance={p('rental.shortTerm.occupancyRate')}
            />
            <PercentField
              id="st-fee"
              label="Platform commission"
              value={inputs.rental.shortTerm.platformFeeRate}
              onChange={(v) => setShortTerm('platformFeeRate', v)}
              provenance={p('rental.shortTerm.platformFeeRate')}
            />
            <NumberField
              id="st-clean"
              label="Cleaning per stay"
              value={inputs.rental.shortTerm.cleaningCostPerStay}
              onChange={(v) => setShortTerm('cleaningCostPerStay', v)}
              suffix="€"
              provenance={p('rental.shortTerm.cleaningCostPerStay')}
            />
            <NumberField
              id="st-stay"
              label="Average stay"
              value={inputs.rental.shortTerm.averageStayNights}
              onChange={(v) => setShortTerm('averageStayNights', v)}
              suffix="nights"
              hint="Needed to turn nights sold into number of stays. Without it, cleaning cannot be computed."
              provenance={p('rental.shortTerm.averageStayNights')}
            />
            <ToggleField
              id="st-recovered"
              label="Cleaning billed to guest"
              checked={inputs.rental.shortTerm.cleaningRecoveredFromGuest}
              onChange={(v) => setShortTerm('cleaningRecoveredFromGuest', v)}
              hint="When billed to the guest, cleaning is neither revenue nor cost here."
            />
          </FieldGrid>
        )}

        {strategy === 'STUDENT' && (
          <FieldGrid>
            <NumberField
              id="stu-rent"
              label="Monthly rent per room"
              value={inputs.rental.student.monthlyRentPerRoom}
              onChange={(v) => setStudent('monthlyRentPerRoom', v)}
              suffix="€"
              provenance={p('rental.student.monthlyRentPerRoom')}
            />
            <NumberField
              id="stu-rooms"
              label="Rooms let"
              value={inputs.rental.student.rooms}
              onChange={(v) => setStudent('rooms', v)}
              provenance={p('rental.student.rooms')}
            />
            <NumberField
              id="stu-months"
              label="Months let per year"
              value={inputs.rental.student.monthsLetPerYear}
              onChange={(v) => setStudent('monthsLetPerYear', v)}
              suffix="months"
              hint="The academic year. The remaining months are priced out of gross revenue, not counted as a void."
              provenance={p('rental.student.monthsLetPerYear')}
            />
            <PercentField
              id="stu-occ"
              label="Room occupancy"
              value={inputs.rental.student.roomOccupancyRate}
              onChange={(v) => setStudent('roomOccupancyRate', v)}
              hint="Share of rooms filled during the let period."
              provenance={p('rental.student.roomOccupancyRate')}
            />
          </FieldGrid>
        )}

        {strategy === 'ROOM_BY_ROOM' && (
          <FieldGrid>
            <NumberField
              id="rbr-rent"
              label="Monthly rent per room"
              value={inputs.rental.roomByRoom.monthlyRentPerRoom}
              onChange={(v) => setRoomByRoom('monthlyRentPerRoom', v)}
              suffix="€"
              provenance={p('rental.roomByRoom.monthlyRentPerRoom')}
            />
            <NumberField
              id="rbr-rooms"
              label="Rooms let"
              value={inputs.rental.roomByRoom.rooms}
              onChange={(v) => setRoomByRoom('rooms', v)}
              provenance={p('rental.roomByRoom.rooms')}
            />
            <PercentField
              id="rbr-occ"
              label="Room occupancy"
              value={inputs.rental.roomByRoom.roomOccupancyRate}
              onChange={(v) => setRoomByRoom('roomOccupancyRate', v)}
              provenance={p('rental.roomByRoom.roomOccupancyRate')}
            />
          </FieldGrid>
        )}
      </Card>

      {/* ---------------- Operating costs ---------------- */}
      <Card title="Operating assumptions" subtitle="What it costs to run the property, whatever the strategy.">
        <FieldGrid>
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
            id="utilities"
            label="Utilities (owner-paid)"
            value={inputs.rental.utilities}
            onChange={(v) => set('rental', 'utilities', v)}
            suffix="€/yr"
            hint="Usually zero on a long let and material on a short let."
            provenance={p('rental.utilities')}
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
              <SelectField
                id="amortizationType"
                label="Amortisation"
                value={inputs.financing.amortizationType}
                options={[
                  { value: 'AMORTIZING', label: 'Amortising (level instalments)' },
                  { value: 'INTEREST_ONLY', label: 'Interest only' },
                ]}
                onChange={(v) => set('financing', 'amortizationType', v ?? 'AMORTIZING')}
                hint="Interest-only leaves the whole principal outstanding at maturity."
                provenance={p('financing.amortizationType')}
              />
              <NumberField
                id="maturityYears"
                label="Maturity"
                value={inputs.financing.maturityYears}
                onChange={(v) => set('financing', 'maturityYears', v)}
                suffix="years"
                hint="Leave empty when the loan runs to the end of its amortisation. A shorter maturity leaves a balloon."
                provenance={p('financing.maturityYears')}
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
