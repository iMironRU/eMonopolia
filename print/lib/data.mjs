// Загрузка data/*.yaml и content/ для печати. Та же форма, что в apps/web/lib/types.ts.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import matter from 'gray-matter';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(REPO_ROOT, 'data');

const read = (f) => yaml.load(readFileSync(join(DATA, f), 'utf8'));

export function loadCatalog() {
  const board = read('board.yaml');
  const props = read('properties.yaml');
  const provs = read('providers.yaml');
  const utils = read('utilities.yaml');
  return {
    board: board.board,
    cells: [...board.cells].sort((a, b) => a.position - b.position),
    properties: props.properties.map((p) => ({ kind: 'property', ...p })),
    providers: provs.providers.map((p) => ({ kind: 'provider', ...p })),
    providerRentTable: provs.rent_table,
    utilities: utils.utilities.map((u) => ({ kind: 'utility', ...u })),
    utilityMultiplier: utils.rent_multiplier,
    chance: read('chance.yaml').chance,
    chest: read('chest.yaml').chest,
  };
}

export function findField(catalog, id) {
  return (
    catalog.properties.find((p) => p.id === id) ??
    catalog.providers.find((p) => p.id === id) ??
    catalog.utilities.find((u) => u.id === id)
  );
}

/** Строка «Реальные аналоги: …» из content/ru/properties/{id}.md, если есть. */
export function realAnalogs(id, lang = 'ru') {
  const file = join(REPO_ROOT, 'content', lang, 'properties', `${id}.md`);
  if (!existsSync(file)) return null;
  const { content } = matter(readFileSync(file, 'utf8'));
  const m = content.match(/\*\*Реальные аналоги:\*\*\s*(.+)/);
  return m ? m[1].trim() : null;
}

export const GROUP_META = {
  brown: { label: 'Почта', color: '#8d5524', text: '#fff' },
  light_blue: { label: 'Фотохостинги', color: '#7cc6ee', text: '#0d1b2a' },
  pink: { label: 'Видеохостинги', color: '#d63384', text: '#fff' },
  orange: { label: 'Маркетплейсы', color: '#fd7e14', text: '#0d1b2a' },
  red: { label: 'Стриминг', color: '#e63946', text: '#fff' },
  yellow: { label: 'Соцсети', color: '#ffc107', text: '#0d1b2a' },
  green: { label: 'Поисковики', color: '#00b86b', text: '#fff' },
  dark_blue: { label: 'Видеогиганты', color: '#3a86ff', text: '#fff' },
};

export const HOSTING_LEVELS = ['VPS', 'Выделенный сервер', 'Облачный кластер', 'Мультиоблако', 'Собственный датацентр'];

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? 'https://imiron.ru/eMonopolia').replace(/\/$/, '');
