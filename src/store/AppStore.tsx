/**
 * Application state.
 *
 * Holds raw data and user assumptions only. Every derived figure is computed
 * on render by the calculation engine, so there is exactly one source of
 * truth and a formula fix cannot leave stale numbers behind.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  Market,
  Portfolio,
  PortfolioAsset,
  Property,
  PropertyInputs,
  Scenario,
} from '@/domain/types';
import type { Provenance, ProvenanceMap } from '@/domain/provenance';
import { emptyPortfolio, starterPropertyInputs, starterProvenance } from '@/domain/defaults';
import { defaultScenarios } from '@/calculations/scenario';
import { LocalStorageRepository, newId, type Repository } from './repository';

export type ThemeMode = 'light' | 'dark';

interface AppState {
  properties: Property[];
  markets: Market[];
  scenarios: Scenario[];
  portfolio: Portfolio;
  activePropertyId: string | null;
  loaded: boolean;
}

interface AppActions {
  setActiveProperty(id: string | null): void;
  createProperty(name?: string): Property;
  updatePropertyInputs(id: string, inputs: PropertyInputs, touched: string[]): void;
  renameProperty(id: string, name: string): void;
  deleteProperty(id: string): void;
  setFieldProvenance(id: string, path: string, provenance: Provenance): void;

  upsertMarket(market: Market): void;
  deleteMarket(id: string): void;
  loadExampleMarkets(markets: Market[]): void;

  updateScenario(scenario: Scenario): void;
  addScenario(): void;
  deleteScenario(id: string): void;
  resetScenarios(): void;

  setAvailableCapital(amount: number): void;
  addPortfolioAsset(asset?: Partial<PortfolioAsset>): void;
  updatePortfolioAsset(asset: PortfolioAsset): void;
  removePortfolioAsset(id: string): void;
}

interface AppContextValue extends AppState, AppActions {
  activeProperty: Property | null;
  theme: ThemeMode;
  toggleTheme(): void;
}

const AppContext = createContext<AppContextValue | null>(null);

const THEME_KEY = 'reia.theme.v1';

function initialTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* storage unavailable: fall through to the OS preference */
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function newProperty(name: string): Property {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name,
    marketId: null,
    createdAt: now,
    updatedAt: now,
    inputs: starterPropertyInputs(),
    provenance: starterProvenance(),
  };
}

/**
 * Module-level default so the repository identity is stable across renders.
 * Constructing it inline as a default parameter would hand the provider a NEW
 * instance on every render, re-trigger the hydrate effect (which depends on it),
 * set state, re-render, and spin an infinite loop that locks the main thread.
 */
const defaultRepository = new LocalStorageRepository();

export function AppProvider({
  children,
  repository = defaultRepository,
}: {
  children: ReactNode;
  repository?: Repository;
}) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>(defaultScenarios());
  const [portfolio, setPortfolio] = useState<Portfolio>(() => emptyPortfolio(newId()));
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);

  /* --- Hydrate ------------------------------------------------------ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedProperties, storedMarkets, storedScenarios, storedPortfolio] =
        await Promise.all([
          repository.listProperties(),
          repository.listMarkets(),
          repository.listScenarios(),
          repository.getPortfolio(),
        ]);
      if (cancelled) return;

      const initialProperties =
        storedProperties.length > 0 ? storedProperties : [newProperty('New property')];
      setProperties(initialProperties);
      setActivePropertyId(initialProperties[0]?.id ?? null);
      setMarkets(storedMarkets);
      setScenarios(storedScenarios.length > 0 ? storedScenarios : defaultScenarios());
      setPortfolio(storedPortfolio ?? emptyPortfolio(newId()));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  /* --- Theme -------------------------------------------------------- */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* non-fatal */
    }
  }, [theme]);

  /* --- Property actions --------------------------------------------- */
  const persistProperty = useCallback(
    (property: Property) => {
      void repository.saveProperty(property);
    },
    [repository],
  );

  const createProperty = useCallback(
    (name = 'New property') => {
      const property = newProperty(name);
      setProperties((prev) => [...prev, property]);
      setActivePropertyId(property.id);
      persistProperty(property);
      return property;
    },
    [persistProperty],
  );

  const updatePropertyInputs = useCallback(
    (id: string, inputs: PropertyInputs, touched: string[]) => {
      setProperties((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          // Anything the user edits becomes USER_INPUT, overriding whatever
          // default assumption previously occupied the field.
          const provenance: ProvenanceMap = { ...p.provenance };
          for (const path of touched) provenance[path] = 'USER_INPUT';
          const next: Property = {
            ...p,
            inputs,
            provenance,
            updatedAt: new Date().toISOString(),
          };
          persistProperty(next);
          return next;
        }),
      );
    },
    [persistProperty],
  );

  const renameProperty = useCallback(
    (id: string, name: string) => {
      setProperties((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          const next = { ...p, name, updatedAt: new Date().toISOString() };
          persistProperty(next);
          return next;
        }),
      );
    },
    [persistProperty],
  );

  const deleteProperty = useCallback(
    (id: string) => {
      setProperties((prev) => {
        const next = prev.filter((p) => p.id !== id);
        void repository.deleteProperty(id);
        setActivePropertyId((current) => (current === id ? (next[0]?.id ?? null) : current));
        return next;
      });
    },
    [repository],
  );

  const setFieldProvenance = useCallback(
    (id: string, path: string, provenance: Provenance) => {
      setProperties((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          const next = { ...p, provenance: { ...p.provenance, [path]: provenance } };
          persistProperty(next);
          return next;
        }),
      );
    },
    [persistProperty],
  );

  /* --- Market actions ------------------------------------------------ */
  const upsertMarket = useCallback(
    (market: Market) => {
      setMarkets((prev) => {
        const index = prev.findIndex((m) => m.id === market.id);
        const next = index >= 0 ? prev.map((m) => (m.id === market.id ? market : m)) : [...prev, market];
        void repository.saveMarket(market);
        return next;
      });
    },
    [repository],
  );

  const deleteMarket = useCallback(
    (id: string) => {
      setMarkets((prev) => prev.filter((m) => m.id !== id));
      void repository.deleteMarket(id);
    },
    [repository],
  );

  const loadExampleMarkets = useCallback(
    (examples: Market[]) => {
      setMarkets((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const added = examples.filter((m) => !existing.has(m.id));
        for (const market of added) void repository.saveMarket(market);
        return [...prev, ...added];
      });
    },
    [repository],
  );

  /* --- Scenario actions ---------------------------------------------- */
  const persistScenarios = useCallback(
    (next: Scenario[]) => {
      void repository.saveScenarios(next);
      return next;
    },
    [repository],
  );

  const updateScenario = useCallback(
    (scenario: Scenario) => {
      setScenarios((prev) =>
        persistScenarios(prev.map((s) => (s.id === scenario.id ? scenario : s))),
      );
    },
    [persistScenarios],
  );

  const addScenario = useCallback(() => {
    setScenarios((prev) =>
      persistScenarios([
        ...prev,
        {
          id: newId(),
          name: `Scenario ${prev.length + 1}`,
          builtIn: false,
          description: '',
          shocks: {
            purchasePriceDelta: 0,
            marketValueDelta: 0,
            rentDelta: 0,
            vacancyDelta: 0,
            operatingCostDelta: 0,
            interestRateDelta: 0,
            priceGrowthDelta: 0,
            rentGrowthDelta: 0,
          },
        },
      ]),
    );
  }, [persistScenarios]);

  const deleteScenario = useCallback(
    (id: string) => {
      setScenarios((prev) => persistScenarios(prev.filter((s) => s.id !== id || s.builtIn)));
    },
    [persistScenarios],
  );

  const resetScenarios = useCallback(() => {
    setScenarios(persistScenarios(defaultScenarios()));
  }, [persistScenarios]);

  /* --- Portfolio actions --------------------------------------------- */
  const mutatePortfolio = useCallback(
    (mutator: (p: Portfolio) => Portfolio) => {
      setPortfolio((prev) => {
        const next = { ...mutator(prev), updatedAt: new Date().toISOString() };
        void repository.savePortfolio(next);
        return next;
      });
    },
    [repository],
  );

  const setAvailableCapital = useCallback(
    (amount: number) => mutatePortfolio((p) => ({ ...p, availableCapital: amount })),
    [mutatePortfolio],
  );

  const addPortfolioAsset = useCallback(
    (asset: Partial<PortfolioAsset> = {}) =>
      mutatePortfolio((p) => ({
        ...p,
        assets: [
          ...p.assets,
          {
            id: newId(),
            label: 'New allocation',
            assetClass: 'CASH',
            amount: 0,
            debt: 0,
            incomeYield: null,
            growthRate: null,
            liquid: true,
            geography: '',
            propertyId: null,
            downsideShock: null,
            ...asset,
          },
        ],
      })),
    [mutatePortfolio],
  );

  const updatePortfolioAsset = useCallback(
    (asset: PortfolioAsset) =>
      mutatePortfolio((p) => ({
        ...p,
        assets: p.assets.map((a) => (a.id === asset.id ? asset : a)),
      })),
    [mutatePortfolio],
  );

  const removePortfolioAsset = useCallback(
    (id: string) =>
      mutatePortfolio((p) => ({ ...p, assets: p.assets.filter((a) => a.id !== id) })),
    [mutatePortfolio],
  );

  const activeProperty = useMemo(
    () => properties.find((p) => p.id === activePropertyId) ?? null,
    [properties, activePropertyId],
  );

  const value: AppContextValue = {
    properties,
    markets,
    scenarios,
    portfolio,
    activePropertyId,
    activeProperty,
    loaded,
    theme,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    setActiveProperty: setActivePropertyId,
    createProperty,
    updatePropertyInputs,
    renameProperty,
    deleteProperty,
    setFieldProvenance,
    upsertMarket,
    deleteMarket,
    loadExampleMarkets,
    updateScenario,
    addScenario,
    deleteScenario,
    resetScenarios,
    setAvailableCapital,
    addPortfolioAsset,
    updatePortfolioAsset,
    removePortfolioAsset,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
