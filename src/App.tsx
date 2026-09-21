/**
 * App shell.
 *
 * The navigation encodes the three levels the product is organised around:
 *
 *   OVERVIEW     "what is the picture?"        — the headline numbers.
 *   ANALYSIS     "why are they what they are?" — the waterfall, scenarios,
 *                                                sensitivity, comparison.
 *   ASSUMPTIONS  "where do they come from?"    — inputs, provenance, tax,
 *                                                data-quality warnings.
 *
 * A reader can always get from a number to the assumption behind it.
 */

import { useState } from 'react';
import { AppProvider, useApp } from '@/store/AppStore';
import { Dashboard } from '@/ui/pages/Dashboard';
import { PropertyAnalyzer } from '@/ui/pages/PropertyAnalyzer';
import { Underwriting } from '@/ui/pages/Underwriting';
import { Scenarios } from '@/ui/pages/Scenarios';
import { Sensitivity } from '@/ui/pages/Sensitivity';
import { Deals } from '@/ui/pages/Deals';
import { Markets } from '@/ui/pages/Markets';
import { DataSources } from '@/ui/pages/DataSources';
import { PortfolioBuilder } from '@/ui/pages/PortfolioBuilder';
import { Allocation } from '@/ui/pages/Allocation';
import { AssumptionsRegister } from '@/ui/pages/AssumptionsRegister';
import { Button, Card, EmptyState } from '@/ui/components/primitives';

type Tab =
  | 'overview'
  | 'underwriting'
  | 'scenarios'
  | 'sensitivity'
  | 'deals'
  | 'markets'
  | 'sources'
  | 'portfolio'
  | 'allocation'
  | 'inputs'
  | 'assumptions';

type Level = 'OVERVIEW' | 'ANALYSIS' | 'ASSUMPTIONS';

const TABS: { id: Tab; label: string; level: Level; needsProperty: boolean }[] = [
  { id: 'overview', label: 'Overview', level: 'OVERVIEW', needsProperty: true },
  { id: 'underwriting', label: 'Underwriting', level: 'ANALYSIS', needsProperty: true },
  { id: 'scenarios', label: 'Scenarios', level: 'ANALYSIS', needsProperty: true },
  { id: 'sensitivity', label: 'Sensitivity', level: 'ANALYSIS', needsProperty: true },
  { id: 'deals', label: 'Deals', level: 'ANALYSIS', needsProperty: false },
  { id: 'markets', label: 'Markets', level: 'ANALYSIS', needsProperty: false },
  { id: 'sources', label: 'Data sources', level: 'ASSUMPTIONS', needsProperty: false },
  { id: 'portfolio', label: 'Portfolio', level: 'ANALYSIS', needsProperty: false },
  { id: 'allocation', label: 'Capital allocation', level: 'ANALYSIS', needsProperty: false },
  { id: 'inputs', label: 'Inputs', level: 'ASSUMPTIONS', needsProperty: true },
  { id: 'assumptions', label: 'Assumptions & tax', level: 'ASSUMPTIONS', needsProperty: true },
];

const LEVEL_LABELS: Record<Level, string> = {
  OVERVIEW: 'Overview',
  ANALYSIS: 'Analysis',
  ASSUMPTIONS: 'Assumptions',
};

const LEVEL_ORDER: Level[] = ['OVERVIEW', 'ANALYSIS', 'ASSUMPTIONS'];

function Shell() {
  const {
    properties,
    activeProperty,
    activePropertyId,
    setActiveProperty,
    createProperty,
    deleteProperty,
    theme,
    toggleTheme,
    loaded,
  } = useApp();
  const [tab, setTabState] = useState<Tab>('overview');

  /* Switching tab is a change of view, so it starts at the top. */
  const setTab = (next: Tab) => {
    setTabState(next);
    window.scrollTo({ top: 0 });
  };

  if (!loaded) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <header
        className="sticky z-30 border-b backdrop-blur"
        style={{
          top: 'env(safe-area-inset-top, 0px)',
          background: 'color-mix(in oklab, var(--bg) 88%, transparent)',
        }}
      >
        <div className="mx-auto max-w-[115rem] px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="whitespace-nowrap text-sm font-semibold tracking-tight">
                Real Estate Analyzer
              </span>
              <span
                className="hidden whitespace-nowrap text-xs sm:inline"
                style={{ color: 'var(--text-subtle)' }}
              >
                Decision support, not advice
              </span>
            </div>

            <div className="flex items-center gap-2">
              {properties.length > 0 && (
                <select
                  className="max-w-[10rem] truncate rounded-lg border bg-[var(--surface)] px-2 py-1 text-xs sm:max-w-none"
                  style={{ borderColor: 'var(--border-strong)' }}
                  value={activePropertyId ?? ''}
                  onChange={(e) => setActiveProperty(e.target.value)}
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <Button size="sm" onClick={() => createProperty()}>
                New
              </Button>
              {activeProperty && properties.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Delete this property"
                  onClick={() => {
                    if (window.confirm(`Delete "${activeProperty.name}"? This cannot be undone.`)) {
                      deleteProperty(activeProperty.id);
                    }
                  }}
                >
                  ✕
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={toggleTheme}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? '☀' : '☾'}
              </Button>
            </div>
          </div>

          <nav className="-mx-1 flex items-center gap-3 overflow-x-auto pb-2">
            {LEVEL_ORDER.map((level) => (
              <div key={level} className="flex shrink-0 items-center gap-1">
                <span
                  className="whitespace-nowrap px-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-subtle)' }}
                >
                  {LEVEL_LABELS[level]}
                </span>
                {TABS.filter((t) => t.level === level).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      background: tab === t.id ? 'var(--accent-soft)' : 'transparent',
                      color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[115rem] px-4 py-5 sm:px-6">
        {(() => {
          const spec = TABS.find((t) => t.id === tab);
          if (spec?.needsProperty && !activeProperty) {
            return (
              <Card>
                <EmptyState title="No property selected">
                  Create a property to start an analysis.
                </EmptyState>
              </Card>
            );
          }
          switch (tab) {
            case 'overview':
              return <Dashboard property={activeProperty!} />;
            case 'underwriting':
              return <Underwriting property={activeProperty!} />;
            case 'scenarios':
              return <Scenarios property={activeProperty!} />;
            case 'sensitivity':
              return <Sensitivity property={activeProperty!} />;
            case 'deals':
              return <Deals />;
            case 'markets':
              return <Markets />;
            case 'sources':
              return <DataSources />;
            case 'portfolio':
              return <PortfolioBuilder />;
            case 'allocation':
              return <Allocation />;
            case 'inputs':
              return <PropertyAnalyzer property={activeProperty!} />;
            case 'assumptions':
              return <AssumptionsRegister property={activeProperty!} />;
          }
        })()}

        <footer
          className="mt-8 border-t pt-4 text-xs leading-relaxed"
          style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}
        >
          <p className="max-w-3xl">
            This tool computes the consequences of the assumptions you enter. It does not rank
            properties or markets, does not score investments, and does not tell you what to buy.
            Where an input is missing it reports the result as unavailable rather than substituting
            a plausible number. Tax treatment is an editable input, not encoded law. Figures are
            not financial or tax advice.
          </p>
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
