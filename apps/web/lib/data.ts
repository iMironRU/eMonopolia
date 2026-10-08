// Загрузка data/*.yaml на этапе сборки (только на сервере / при static export).
import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import type { Card, Catalog, Cell, Property, Provider, Utility } from './types';

// apps/web → корень репозитория
export const REPO_ROOT = join(process.cwd(), '..', '..');
const DATA_DIR = join(REPO_ROOT, 'data');

function readYaml<T>(file: string): T {
  return load(readFileSync(join(DATA_DIR, file), 'utf8')) as T;
}

let cached: Catalog | null = null;

export function getCatalog(): Catalog {
  if (cached) return cached;

  const board = readYaml<{ board: Catalog['board']; cells: Cell[] }>('board.yaml');
  const props = readYaml<{ properties: Omit<Property, 'kind'>[] }>('properties.yaml');
  const provs = readYaml<{ providers: Omit<Provider, 'kind'>[]; rent_table: Record<number, number> }>('providers.yaml');
  const utils = readYaml<{ utilities: Omit<Utility, 'kind'>[]; rent_multiplier: Record<number, number> }>('utilities.yaml');
  const chance = readYaml<{ chance: Card[] }>('chance.yaml');
  const chest = readYaml<{ chest: Card[] }>('chest.yaml');

  cached = {
    board: board.board,
    cells: [...board.cells].sort((a, b) => a.position - b.position),
    properties: props.properties.map((p) => ({ kind: 'property', ...p })),
    providers: provs.providers.map((p) => ({ kind: 'provider', ...p })),
    providerRentTable: provs.rent_table,
    utilities: utils.utilities.map((u) => ({ kind: 'utility', ...u })),
    utilityMultiplier: utils.rent_multiplier,
    chance: chance.chance,
    chest: chest.chest,
  };
  return cached;
}
