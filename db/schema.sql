-- =====================================================================
-- Real Estate Investment Analyzer — relational schema (PostgreSQL)
--
-- The MVP persists through a Repository interface backed by localStorage
-- (src/store/repository.ts). This schema is the target for the server-side
-- implementation; the domain types in src/domain/types.ts mirror it field
-- for field, so swapping in Supabase means writing one more Repository and
-- changing a single line in the provider.
--
-- THREE RULES THE SCHEMA ENFORCES
--
--   1. RAW DATA and USER ASSUMPTIONS live in separate tables. A property's
--      observable facts (surface, floor, year built) do not belong in the
--      same row as a forward-looking guess about rent growth.
--
--   2. CALCULATED METRICS ARE NEVER STORED. NOI, IRR, NPV, yields and cash
--      flows are deterministic functions of the inputs. Persisting them
--      would create a second source of truth that silently goes stale the
--      moment a formula is corrected. There is deliberately no
--      `property_metrics` table.
--
--   3. EVERY EXTERNAL DATUM CARRIES ITS PROVENANCE. A market figure without
--      a source, a timestamp, a geographic scope, a unit and a methodology
--      cannot be inserted — the columns are NOT NULL.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------

CREATE TYPE provenance_level AS ENUM (
  'VERIFIED',          -- imported from an identified source
  'USER_INPUT',        -- entered by the investor
  'ESTIMATED',         -- derived from other data
  'MODEL_ASSUMPTION',  -- a default built into the model; not evidence
  'MISSING'            -- no value; nothing invented to fill the gap
);

CREATE TYPE property_condition AS ENUM (
  'NEW', 'RENOVATED', 'GOOD', 'HABITABLE', 'TO_RENOVATE', 'TO_GUT'
);

CREATE TYPE rate_type AS ENUM ('FIXED', 'VARIABLE');

CREATE TYPE income_tax_mode AS ENUM ('NONE', 'FLAT_ON_GROSS', 'FLAT_ON_NET');

CREATE TYPE asset_class AS ENUM (
  'REAL_ESTATE', 'EQUITIES', 'BONDS', 'CASH', 'OTHER'
);

CREATE TYPE data_source_kind AS ENUM (
  'IMPORTED',  -- came from a provider through the normalisation layer
  'MANUAL',    -- typed in by the user
  'EXAMPLE'    -- illustrative placeholder; must be flagged in the UI
);

-- ---------------------------------------------------------------------
-- User
-- ---------------------------------------------------------------------

CREATE TABLE app_user (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  display_name text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Market (RAW)
-- ---------------------------------------------------------------------

CREATE TABLE market (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  country    text NOT NULL DEFAULT '',
  district   text,                       -- NULL = the whole city
  -- User-owned qualitative notes. Free text on purpose: regulation and
  -- market risk do not reduce to a number without losing their meaning.
  regulation_notes text,
  risk_notes       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, country, district)
);

-- ---------------------------------------------------------------------
-- Data source registry
--
-- One row per (provider, vintage). Market observations reference it rather
-- than repeating the source text, so a provider's methodology is stated
-- once and cannot drift between metrics.
-- ---------------------------------------------------------------------

CREATE TABLE data_source (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source           text NOT NULL,          -- publisher, e.g. "OMI"
  methodology      text NOT NULL,          -- how the figure was produced
  url              text,
  geographic_scope text NOT NULL,          -- city | district | province | country
  kind             data_source_kind NOT NULL,
  observed_at      timestamptz NOT NULL,   -- when the world was measured
  imported_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Market data (RAW)
--
-- Tall rather than wide: a new metric is a new row, not a schema migration,
-- and a market that lacks a metric simply has no row — which is how
-- "Data unavailable" stays distinguishable from zero.
-- ---------------------------------------------------------------------

CREATE TABLE market_data (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id   uuid NOT NULL REFERENCES market(id) ON DELETE CASCADE,
  metric_key  text NOT NULL,              -- e.g. 'avgPricePerSqm'
  value       numeric,                    -- NULL = source has no figure
  unit        text NOT NULL,              -- canonical unit; see data/source.ts
  provenance  provenance_level NOT NULL,
  confidence  text CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  source_id   uuid REFERENCES data_source(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- One current value per metric per market. History lives in the
  -- observed_at of successive data_source vintages.
  UNIQUE (market_id, metric_key, source_id)
);

CREATE INDEX market_data_market_metric_idx ON market_data (market_id, metric_key);

-- ---------------------------------------------------------------------
-- Property (RAW facts only)
-- ---------------------------------------------------------------------

CREATE TABLE property (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  market_id     uuid REFERENCES market(id) ON DELETE SET NULL,
  name          text NOT NULL,

  city          text NOT NULL DEFAULT '',
  district      text NOT NULL DEFAULT '',
  address       text,
  asking_price  numeric CHECK (asking_price   >= 0),
  purchase_price numeric CHECK (purchase_price >= 0),
  sqm           numeric CHECK (sqm > 0),
  rooms         integer CHECK (rooms     >= 0),
  bathrooms     integer CHECK (bathrooms >= 0),
  floor         integer,
  elevator      boolean,
  condition     property_condition,
  year_built    integer CHECK (year_built BETWEEN 1000 AND 2200),
  furnished     boolean,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX property_user_idx ON property (user_id);

-- ---------------------------------------------------------------------
-- Provenance sidecar
--
-- Field-level confidence for property inputs, keyed by the same dotted path
-- the application uses ('rental.monthlyRent'). Kept out of the property row
-- so adding a field never requires a paired provenance column.
-- ---------------------------------------------------------------------

CREATE TABLE property_field_provenance (
  property_id uuid NOT NULL REFERENCES property(id) ON DELETE CASCADE,
  field_path  text NOT NULL,
  provenance  provenance_level NOT NULL,
  PRIMARY KEY (property_id, field_path)
);

-- ---------------------------------------------------------------------
-- Acquisition costs (USER ASSUMPTIONS)
--
-- Percentage and absolute variants coexist by design: an absolute amount is
-- a real quote and overrides the corresponding rule-of-thumb rate.
-- ---------------------------------------------------------------------

CREATE TABLE property_expense (
  property_id             uuid PRIMARY KEY REFERENCES property(id) ON DELETE CASCADE,
  purchase_tax_rate       numeric CHECK (purchase_tax_rate BETWEEN 0 AND 1),
  purchase_tax_amount     numeric CHECK (purchase_tax_amount >= 0),
  notary_fees             numeric CHECK (notary_fees >= 0),
  agency_commission_rate  numeric CHECK (agency_commission_rate BETWEEN 0 AND 1),
  agency_commission_amount numeric CHECK (agency_commission_amount >= 0),
  renovation_cost         numeric CHECK (renovation_cost >= 0),
  furniture_cost          numeric CHECK (furniture_cost  >= 0),
  other_upfront_costs     numeric CHECK (other_upfront_costs >= 0)
);

-- ---------------------------------------------------------------------
-- Rental assumptions (USER ASSUMPTIONS)
-- ---------------------------------------------------------------------

CREATE TABLE property_rental_assumption (
  property_id           uuid PRIMARY KEY REFERENCES property(id) ON DELETE CASCADE,
  monthly_rent          numeric CHECK (monthly_rent >= 0),
  -- Days, not a rate. Converted to occupancy as (365 - days) / 365.
  vacancy_days_per_year numeric CHECK (vacancy_days_per_year BETWEEN 0 AND 365),
  rent_growth_rate      numeric,          -- may be negative
  stabilization_months  numeric CHECK (stabilization_months BETWEEN 0 AND 12),

  condo_fees            numeric CHECK (condo_fees           >= 0),
  property_tax          numeric CHECK (property_tax         >= 0),
  insurance             numeric CHECK (insurance            >= 0),
  ordinary_maintenance  numeric CHECK (ordinary_maintenance >= 0),
  -- Provision for major works. Deducted BELOW NOI, never within it.
  capex_reserve         numeric CHECK (capex_reserve        >= 0),
  -- Share of COLLECTED rent, so it falls when the property is empty.
  management_fee_rate   numeric CHECK (management_fee_rate BETWEEN 0 AND 1),
  other_operating_costs numeric CHECK (other_operating_costs >= 0),
  expense_growth_rate   numeric
);

-- ---------------------------------------------------------------------
-- Financing (USER ASSUMPTIONS)
-- ---------------------------------------------------------------------

CREATE TABLE financing (
  property_id   uuid PRIMARY KEY REFERENCES property(id) ON DELETE CASCADE,
  enabled       boolean NOT NULL DEFAULT false,
  ltv           numeric CHECK (ltv BETWEEN 0 AND 1),
  loan_amount   numeric CHECK (loan_amount >= 0),   -- overrides ltv when set
  annual_rate   numeric CHECK (annual_rate >= 0),
  term_years    integer CHECK (term_years > 0),
  -- A rate shock in a scenario applies to VARIABLE loans only: a fixed-rate
  -- borrower is contractually insulated from a repricing.
  rate_type     rate_type NOT NULL DEFAULT 'FIXED',
  upfront_costs numeric CHECK (upfront_costs >= 0)
);

-- ---------------------------------------------------------------------
-- Tax, exit and discounting (USER ASSUMPTIONS)
--
-- No jurisdiction's rules are encoded. Rates and exemption periods are
-- inputs, because tax law varies by country, contract type and year.
-- ---------------------------------------------------------------------

CREATE TABLE property_assumption (
  property_id                 uuid PRIMARY KEY REFERENCES property(id) ON DELETE CASCADE,
  income_tax_mode             income_tax_mode NOT NULL DEFAULT 'NONE',
  income_tax_rate             numeric CHECK (income_tax_rate BETWEEN 0 AND 1),
  interest_deductible         boolean NOT NULL DEFAULT false,

  holding_period_years        integer NOT NULL DEFAULT 10 CHECK (holding_period_years > 0),
  price_growth_rate           numeric,   -- may be negative
  selling_costs_rate          numeric CHECK (selling_costs_rate BETWEEN 0 AND 1),
  capital_gains_tax_rate      numeric CHECK (capital_gains_tax_rate BETWEEN 0 AND 1),
  capital_gains_exempt_after_years integer CHECK (capital_gains_exempt_after_years >= 0),

  -- The investor's required return. NPV is undefined without it, so the
  -- application reports NPV as unavailable rather than picking a default.
  discount_rate               numeric,
  currency                    char(3) NOT NULL DEFAULT 'EUR'
);

-- ---------------------------------------------------------------------
-- Scenarios (USER ASSUMPTIONS)
--
-- Stored as SHOCKS, not as copies of the inputs, so editing the base case
-- flows through every scenario automatically.
-- ---------------------------------------------------------------------

CREATE TABLE scenario (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  built_in    boolean NOT NULL DEFAULT false,

  -- Multiplicative on the price PAID. Negative = a better entry price,
  -- which IMPROVES returns.
  purchase_price_delta  numeric NOT NULL DEFAULT 0,
  -- Multiplicative on the asset's market VALUE. Negative = a correction,
  -- which WORSENS returns. Keeping these two apart is what stops a market
  -- crash from being modelled as a bargain.
  market_value_delta    numeric NOT NULL DEFAULT 0,
  rent_delta            numeric NOT NULL DEFAULT 0,
  vacancy_delta         numeric NOT NULL DEFAULT 0,
  operating_cost_delta  numeric NOT NULL DEFAULT 0,
  interest_rate_delta   numeric NOT NULL DEFAULT 0,  -- additive, in decimal
  price_growth_delta    numeric NOT NULL DEFAULT 0,  -- additive
  rent_growth_delta     numeric NOT NULL DEFAULT 0,  -- additive

  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scenario_user_idx ON scenario (user_id);

-- ---------------------------------------------------------------------
-- Simulation
--
-- A NAMED SET OF INPUTS, not a set of results. It records which property
-- and scenario were paired and over what horizon, so a past analysis can be
-- reproduced exactly — by RE-RUNNING the engine, never by reading back
-- stored numbers.
-- ---------------------------------------------------------------------

CREATE TABLE simulation (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  property_id          uuid NOT NULL REFERENCES property(id)  ON DELETE CASCADE,
  scenario_id          uuid REFERENCES scenario(id) ON DELETE SET NULL,
  label                text NOT NULL,
  holding_period_years integer NOT NULL CHECK (holding_period_years > 0),
  -- Version of the calculation engine used, so a reproduced run can be
  -- compared honestly against the original if a formula has since changed.
  engine_version       text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX simulation_property_idx ON simulation (property_id);

-- ---------------------------------------------------------------------
-- Portfolio (USER ASSUMPTIONS)
-- ---------------------------------------------------------------------

CREATE TABLE portfolio (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name              text NOT NULL,
  available_capital numeric NOT NULL DEFAULT 0 CHECK (available_capital >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE portfolio_asset (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id   uuid NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
  -- Optional link to an analysed property. ON DELETE SET NULL so removing a
  -- property does not silently delete the allocation that referenced it.
  property_id    uuid REFERENCES property(id) ON DELETE SET NULL,
  label          text NOT NULL,
  asset_class    asset_class NOT NULL,
  amount         numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),  -- equity
  debt           numeric NOT NULL DEFAULT 0 CHECK (debt   >= 0),
  income_yield   numeric,
  growth_rate    numeric,
  liquid         boolean NOT NULL DEFAULT true,
  geography      text NOT NULL DEFAULT '',
  downside_shock numeric,
  position       integer NOT NULL DEFAULT 0
);

CREATE INDEX portfolio_asset_portfolio_idx ON portfolio_asset (portfolio_id);

-- ---------------------------------------------------------------------
-- Deliberately absent
--
--   property_metrics, cached_irr, computed_yields, market_score, ...
--
-- Every one of those is a function of the rows above. Storing them would
-- mean a formula fix leaves stale numbers in the database, and a "score"
-- would encode a weighting the investor never chose.
-- ---------------------------------------------------------------------
