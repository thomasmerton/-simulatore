/**
 * Persistence.
 *
 * The app talks to `Repository`, never to storage directly. The MVP ships a
 * localStorage implementation; swapping in Supabase or a REST API means
 * writing one more class here and changing a single line in the provider.
 *
 * Only RAW DATA and USER ASSUMPTIONS are persisted. Calculated metrics are
 * never stored: they are deterministic functions of the inputs, so storing
 * them would create two sources of truth that drift apart the moment a
 * formula is corrected.
 */

import type { Market, Portfolio, Property, Scenario } from '@/domain/types';

export interface Repository {
  listProperties(): Promise<Property[]>;
  saveProperty(property: Property): Promise<void>;
  deleteProperty(id: string): Promise<void>;

  listMarkets(): Promise<Market[]>;
  saveMarket(market: Market): Promise<void>;
  deleteMarket(id: string): Promise<void>;

  listScenarios(): Promise<Scenario[]>;
  saveScenarios(scenarios: Scenario[]): Promise<void>;

  getPortfolio(): Promise<Portfolio | null>;
  savePortfolio(portfolio: Portfolio): Promise<void>;
}

const KEYS = {
  properties: 'reia.properties.v1',
  markets: 'reia.markets.v1',
  scenarios: 'reia.scenarios.v1',
  portfolio: 'reia.portfolio.v1',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt or unavailable storage must not take the app down.
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled (private browsing). The session
    // continues in memory; nothing is lost that was not already unsaved.
  }
}

export class LocalStorageRepository implements Repository {
  async listProperties(): Promise<Property[]> {
    return read<Property[]>(KEYS.properties, []);
  }

  async saveProperty(property: Property): Promise<void> {
    const all = await this.listProperties();
    const index = all.findIndex((p) => p.id === property.id);
    if (index >= 0) all[index] = property;
    else all.push(property);
    write(KEYS.properties, all);
  }

  async deleteProperty(id: string): Promise<void> {
    write(KEYS.properties, (await this.listProperties()).filter((p) => p.id !== id));
  }

  async listMarkets(): Promise<Market[]> {
    return read<Market[]>(KEYS.markets, []);
  }

  async saveMarket(market: Market): Promise<void> {
    const all = await this.listMarkets();
    const index = all.findIndex((m) => m.id === market.id);
    if (index >= 0) all[index] = market;
    else all.push(market);
    write(KEYS.markets, all);
  }

  async deleteMarket(id: string): Promise<void> {
    write(KEYS.markets, (await this.listMarkets()).filter((m) => m.id !== id));
  }

  async listScenarios(): Promise<Scenario[]> {
    return read<Scenario[]>(KEYS.scenarios, []);
  }

  async saveScenarios(scenarios: Scenario[]): Promise<void> {
    write(KEYS.scenarios, scenarios);
  }

  async getPortfolio(): Promise<Portfolio | null> {
    return read<Portfolio | null>(KEYS.portfolio, null);
  }

  async savePortfolio(portfolio: Portfolio): Promise<void> {
    write(KEYS.portfolio, portfolio);
  }
}

/** Stable id generator that does not require a crypto polyfill in older browsers. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
