/**
 * App shell: navigation, property switcher and theme toggle.
 */

import { useState } from 'react';
import { AppProvider, useApp } from '@/store/AppStore';
import { Dashboard } from '@/ui/pages/Dashboard';
import { PropertyAnalyzer } from '@/ui/pages/PropertyAnalyzer';
import { HoldingPeriod } from '@/ui/pages/HoldingPeriod';
import { Scenarios } from '@/ui/pages/Scenarios';
import { Sensitivity } from '@/ui/pages/Sensitivity';
import { Compare } from '@/ui/pages/Compare';
import { Markets } from '@/ui/pages/Markets';
import { PortfolioBuilder } from '@/ui/pages/PortfolioBuilder';
import { Button, Card, EmptyState } from '@/ui/components/primitives';

type Tab =
  | 'dashboard'
  | 'property'
  | 'holding'
  | 'scenarios'
  | 'sensitivity'
  | 'compare'
  | 'markets'
  | 'portfolio';

const TABS: { id: Tab; label: string; needsProperty: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', needsProperty: true },
  { id: 'property', label: 'Property', needsProperty: true },
  { id: 'holding', label: 'Holding & exit', needsProperty: true },
  { id: 'scenarios', label: 'Scenarios', needsProperty: true },
  { id: 'sensitivity', label: 'Sensitivity', needsProperty: true },
  { id: 'compare', label: 'Compare', needsProperty: false },
  { id: 'markets', label: 'Markets', needsProperty: false },
  { id: 'portfolio', label: 'Portfolio', needsProperty: false },
];

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
  const [tab, setTabState] = useState<Tab>('dashboard');

  /* Switching tab is a change of view, so it starts at the top rather than
     inheriting the previous tab's scroll position. */
  const setTab = (next: Tab) => {
    setTabState(next);
    window.scrollTo({ top: 0 });
  };

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{ background: 'color-mix(in oklab, var(--bg) 88%, transparent)' }}
      >
        <div className="mx-auto max-w-[110rem] px-4 sm:px-6">
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

          <nav className="-mx-1 flex gap-1 overflow-x-auto pb-2">
            {TABS.map((t) => (
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
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[110rem] px-4 py-5 sm:px-6">
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
            case 'dashboard':
              return <Dashboard property={activeProperty!} />;
            case 'property':
              return <PropertyAnalyzer property={activeProperty!} />;
            case 'holding':
              return <HoldingPeriod property={activeProperty!} />;
            case 'scenarios':
              return <Scenarios property={activeProperty!} />;
            case 'sensitivity':
              return <Sensitivity property={activeProperty!} />;
            case 'compare':
              return <Compare />;
            case 'markets':
              return <Markets />;
            case 'portfolio':
              return <PortfolioBuilder />;
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
            a plausible number. Figures are not financial advice.
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
