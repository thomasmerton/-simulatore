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
  AllocationStrategy,
  Market,
  Portfolio,
  PortfolioAsset,
  Property,
  PropertyInputs,
  Scenario,
  TaxProfile,
} from '@/domain/types';
import type { Provenance, ProvenanceMap } from '@/domain/provenance';
import {
  blankTaxProfile,
  emptyAllocationStrategy,
  emptyPortfolio,
  italianSecondHomeProfile,
  starterPropertyInputs,
  starterProvenance,
} from '@/domain/defaults';
import { applyTaxProfile, TAX_PROFILE_PATHS } from '@/calculations/tax';
import { exampleProperty, isUntouched } from '@/data/exampleProperty';
import { NO_SHOCKS, defaultScenarios } from '@/calculations/scenario';
import { LocalStorageRepository, newId, type Repository } from './repository';

export { blankTaxProfile };

export type ThemeMode = 'light' | 'dark';

interface AppState {
  properties: Property[];
  markets: Market[];
  scenarios: Scenario[];
  portfolio: Portfolio;
  taxProfiles: TaxProfile[];
  allocationStrategies: AllocationStrategy[];
  activePropertyId: string | null;
  loaded: boolean;
}

interface AppActions {
  setActiveProperty(id: string | null): void;
  createProperty(name?: string): Property;
  /** Load the clearly-labelled illustrative property. Explicit action only. */
  loadExampleProperty(): void;
  /** Create a property from a hand-transcribed listing. */
  importDeal(draft: DealDraft): Property;
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

  upsertTaxProfile(profile: TaxProfile): void;
  deleteTaxProfile(id: string): void;
  applyTaxProfileToProperty(propertyId: string, profileId: string): void;

  addAllocationStrategy(name?: string): void;
  updateAllocationStrategy(strategy: AllocationStrategy): void;
  deleteAllocationStrategy(id: string): void;

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

/** The minimum a listing must give before it can be analysed. */
export interface DealDraft {
  name: string;
  listingUrl: string;
  country: string;
  region: string;
  city: string;
  neighborhood: string;
  address: string;
  propertyType: Property['inputs']['facts']['propertyType'];
  askingPrice: number | null;
  sqm: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  condition: Property['inputs']['facts']['condition'];
  monthlyRent: number | null;
  strategy: Property['inputs']['rental']['strategy'];
}

function newProperty(name: string): Property {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name,
    marketId: null,
    taxProfileId: null,
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
  const [taxProfiles, setTaxProfiles] = useState<TaxProfile[]>([]);
  const [allocationStrategies, setAllocationStrategies] = useState<AllocationStrategy[]>([]);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);

  /* --- Hydrate ------------------------------------------------------ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [
        storedProperties,
        storedMarkets,
        storedScenarios,
        storedPortfolio,
        storedTaxProfiles,
        storedAllocations,
      ] = await Promise.all([
        repository.listProperties(),
        repository.listMarkets(),
        repository.listScenarios(),
        repository.getPortfolio(),
        repository.listTaxProfiles(),
        repository.listAllocationStrategies(),
      ]);
      if (cancelled) return;

      const initialProperties =
        storedProperties.length > 0 ? storedProperties : [newProperty('New property')];
      setProperties(initialProperties);
      setActivePropertyId(initialProperties[0]?.id ?? null);
      setMarkets(storedMarkets);
      setScenarios(storedScenarios.length > 0 ? storedScenarios : defaultScenarios());
      setPortfolio(storedPortfolio ?? emptyPortfolio(newId()));
      // One unverified starting profile, so the tax layer is discoverable.
      // It is explicitly marked unverified; nothing is applied automatically.
      setTaxProfiles(
        storedTaxProfiles.length > 0 ? storedTaxProfiles : [italianSecondHomeProfile(newId())],
      );
      setAllocationStrategies(storedAllocations);
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

  const loadExampleProperty = useCallback(() => {
    const example = exampleProperty(newId());
    // Drop any empty starter shells rather than leaving them in the switcher;
    // anything the user has actually filled in is kept.
    setProperties((prev) => [...prev.filter((p) => !isUntouched(p)), example]);
    setActivePropertyId(example.id);
    persistProperty(example);
  }, [persistProperty]);

  /**
   * Import a hand-transcribed listing.
   *
   * Everything the user typed is USER_INPUT — they are the source, having read
   * it off the listing. Anything they left blank stays MISSING rather than
   * being filled from the structural defaults, so the gaps stay visible.
   */
  const importDeal = useCallback(
    (draft: DealDraft) => {
      const base = newProperty(draft.name || 'Imported deal');
      const provenance: ProvenanceMap = { ...base.provenance };
      const mark = (path: string, present: boolean) => {
        provenance[path] = present ? 'USER_INPUT' : 'MISSING';
      };
      mark('facts.location', Boolean(draft.country || draft.city));
      mark('facts.purchasePrice', draft.askingPrice !== null);
      mark('facts.sqm', draft.sqm !== null);
      mark('rental.monthlyRent', draft.monthlyRent !== null);
      mark('facts.condition', draft.condition !== null);
      mark('facts.propertyType', draft.propertyType !== null);

      const property: Property = {
        ...base,
        inputs: {
          ...base.inputs,
          facts: {
            ...base.inputs.facts,
            location: {
              country: draft.country,
              region: draft.region || null,
              city: draft.city || null,
              neighborhood: draft.neighborhood || null,
              level: draft.neighborhood ? 'NEIGHBORHOOD' : 'CITY',
            },
            address: draft.address || null,
            listingUrl: draft.listingUrl || null,
            propertyType: draft.propertyType,
            askingPrice: draft.askingPrice,
            // The asking price is the starting assumption for what is paid,
            // until the user records a negotiated figure.
            purchasePrice: draft.askingPrice,
            sqm: draft.sqm,
            rooms: draft.rooms,
            bathrooms: draft.bathrooms,
            floor: draft.floor,
            condition: draft.condition,
          },
          rental: {
            ...base.inputs.rental,
            strategy: draft.strategy,
            monthlyRent: draft.monthlyRent,
          },
        },
        provenance,
      };

      setProperties((prev) => [...prev.filter((p) => !isUntouched(p)), property]);
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
          shocks: { ...NO_SHOCKS },
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

  /* --- Tax profile actions -------------------------------------------- */
  const upsertTaxProfile = useCallback(
    (profile: TaxProfile) => {
      setTaxProfiles((prev) => {
        const next = prev.some((p) => p.id === profile.id)
          ? prev.map((p) => (p.id === profile.id ? profile : p))
          : [...prev, profile];
        void repository.saveTaxProfiles(next);
        return next;
      });
    },
    [repository],
  );

  const deleteTaxProfile = useCallback(
    (id: string) => {
      setTaxProfiles((prev) => {
        const next = prev.filter((p) => p.id !== id);
        void repository.saveTaxProfiles(next);
        return next;
      });
    },
    [repository],
  );

  /**
   * Applying a profile overwrites the property's tax inputs and marks them
   * according to whether the profile has been verified. An unverified profile
   * yields MODEL_ASSUMPTION, however precise its rates look.
   */
  const applyTaxProfileToProperty = useCallback(
    (propertyId: string, profileId: string) => {
      setTaxProfiles((profiles) => {
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) return profiles;
        setProperties((prev) =>
          prev.map((property) => {
            if (property.id !== propertyId) return property;
            const provenance = { ...property.provenance };
            for (const path of TAX_PROFILE_PATHS) {
              provenance[path] = profile.verified ? 'RAW_DATA' : 'MODEL_ASSUMPTION';
            }
            const next: Property = {
              ...property,
              taxProfileId: profile.id,
              inputs: applyTaxProfile(property.inputs, profile),
              provenance,
              updatedAt: new Date().toISOString(),
            };
            persistProperty(next);
            return next;
          }),
        );
        return profiles;
      });
    },
    [persistProperty],
  );

  /* --- Allocation strategy actions ------------------------------------- */
  const persistAllocations = useCallback(
    (next: AllocationStrategy[]) => {
      void repository.saveAllocationStrategies(next);
      return next;
    },
    [repository],
  );

  const addAllocationStrategy = useCallback(
    (name?: string) => {
      setAllocationStrategies((prev) =>
        persistAllocations([
          ...prev,
          emptyAllocationStrategy(newId(), name ?? `Strategy ${String.fromCharCode(65 + prev.length)}`),
        ]),
      );
    },
    [persistAllocations],
  );

  const updateAllocationStrategy = useCallback(
    (strategy: AllocationStrategy) => {
      setAllocationStrategies((prev) =>
        persistAllocations(prev.map((s) => (s.id === strategy.id ? strategy : s))),
      );
    },
    [persistAllocations],
  );

  const deleteAllocationStrategy = useCallback(
    (id: string) => {
      setAllocationStrategies((prev) => persistAllocations(prev.filter((s) => s.id !== id)));
    },
    [persistAllocations],
  );

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
            location: null,
            strategy: null,
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
    taxProfiles,
    allocationStrategies,
    activePropertyId,
    activeProperty,
    loaded,
    theme,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    setActiveProperty: setActivePropertyId,
    createProperty,
    loadExampleProperty,
    importDeal,
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
    upsertTaxProfile,
    deleteTaxProfile,
    applyTaxProfileToProperty,
    addAllocationStrategy,
    updateAllocationStrategy,
    deleteAllocationStrategy,
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
