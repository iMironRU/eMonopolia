// Чистые функции игровых правил. Все числа берутся из каталога (data/),
// здесь только формулы из docs/mechanics.md.
import type { Catalog, Field, Group, Property } from './types';

export const GROUP_META: Record<Group, { label: string; color: string; text: string; emoji: string }> = {
  brown: { label: 'Почта', color: '#8d5524', text: '#fff', emoji: '📧' },
  light_blue: { label: 'Фотохостинги', color: '#7cc6ee', text: '#0d1b2a', emoji: '📷' },
  pink: { label: 'Видеохостинги', color: '#d63384', text: '#fff', emoji: '🎬' },
  orange: { label: 'Маркетплейсы', color: '#fd7e14', text: '#0d1b2a', emoji: '🛒' },
  red: { label: 'Стриминг', color: '#e63946', text: '#fff', emoji: '📺' },
  yellow: { label: 'Соцсети', color: '#ffc107', text: '#0d1b2a', emoji: '💬' },
  green: { label: 'Поисковики', color: '#00b86b', text: '#fff', emoji: '🔍' },
  dark_blue: { label: 'Видеогиганты', color: '#3a86ff', text: '#fff', emoji: '🚀' },
};

export const GROUP_ORDER: Group[] = ['brown', 'light_blue', 'pink', 'orange', 'red', 'yellow', 'green', 'dark_blue'];

/** Уровни прокачки хостинга: 0 — без прокачки, 1–4 — хостинг, 5 — датацентр (аналог отеля). */
export const HOSTING_LEVELS = [
  'Самохостинг',
  'VPS',
  'Выделенный сервер',
  'Облачный кластер',
  'Мультиоблако',
  'Собственный датацентр',
] as const;
export const MAX_LEVEL = HOSTING_LEVELS.length - 1;

/** Бонус к курсу конвертации за экосистему (генераторы + конвертеры). */
export const ECOSYSTEM_BONUS = 0.25;

/** Конвертация на сумму больше этого порога требует консенсуса. */
export const CONSENSUS_CONVERT_THRESHOLD = 200;

export const SYNERGY_BONUS_PERCENT = ECOSYSTEM_BONUS * 100;

export function findField(catalog: Catalog, id: string): Field | undefined {
  return (
    catalog.properties.find((p) => p.id === id) ??
    catalog.providers.find((p) => p.id === id) ??
    catalog.utilities.find((u) => u.id === id)
  );
}

export function allFields(catalog: Catalog): Field[] {
  return [...catalog.properties, ...catalog.providers, ...catalog.utilities];
}

export function fieldPosition(catalog: Catalog, id: string): number | undefined {
  const cell = catalog.cells.find((c) => 'ref' in c && c.ref === id);
  return cell?.position;
}

export function groupMembers(catalog: Catalog, group: Group): Property[] {
  return catalog.properties.filter((p) => p.group === group);
}

/** Рента за обычное поле при заданной ситуации. */
export function propertyRent(
  prop: Property,
  opts: { monopoly: boolean; level: number; mortgaged?: boolean },
): number {
  if (opts.mortgaged) return 0;
  const level = Math.max(0, Math.min(MAX_LEVEL, opts.level));
  if (level === 0) return opts.monopoly ? prop.rent.with_monopoly : prop.rent.base;
  if (level === MAX_LEVEL) return prop.rent.with_datacenter;
  return prop.rent.with_hosting[level - 1];
}

/** Полная лестница ренты для таблицы на карточке. */
export function rentLadder(prop: Property): { label: string; value: number }[] {
  return [
    { label: 'Базовая', value: prop.rent.base },
    { label: 'С монополией', value: prop.rent.with_monopoly },
    ...prop.rent.with_hosting.map((v, i) => ({ label: HOSTING_LEVELS[i + 1], value: v })),
    { label: HOSTING_LEVELS[MAX_LEVEL], value: prop.rent.with_datacenter },
  ];
}

export function providerRent(catalog: Catalog, ownedCount: number): number {
  return catalog.providerRentTable[Math.max(1, Math.min(4, ownedCount))] ?? 0;
}

export function utilityRent(catalog: Catalog, ownedCount: number, dice: number): number {
  const mult = catalog.utilityMultiplier[Math.max(1, Math.min(2, ownedCount))] ?? 0;
  return mult * dice;
}

export function isGenerator(p: Property): boolean {
  return p.traffic.role === 'generator' || p.traffic.role === 'hybrid';
}

export function isConverter(p: Property): boolean {
  return p.traffic.role === 'converter' || p.traffic.role === 'hybrid';
}

/** Сколько трафика игрок получает в начале хода со своих полей. */
export function trafficIncome(catalog: Catalog, ownedIds: string[], mortgagedIds: string[] = []): number {
  const m = new Set(mortgagedIds);
  return catalog.properties
    .filter((p) => ownedIds.includes(p.id) && !m.has(p.id) && isGenerator(p))
    .reduce((sum, p) => sum + (p.traffic.rate ?? 0), 0);
}

/** Владеет ли игрок всей группой. */
export function ownsGroup(catalog: Catalog, ownedIds: string[], group: Group): boolean {
  const members = groupMembers(catalog, group);
  return members.length > 0 && members.every((p) => ownedIds.includes(p.id));
}

/**
 * Синергия экосистемы: у игрока есть и полная группа генераторов,
 * и полная группа конвертеров → +25% к курсу на всех конвертерах.
 */
export function hasEcosystemSynergy(catalog: Catalog, ownedIds: string[]): boolean {
  const fullGroups = GROUP_ORDER.filter((g) => ownsGroup(catalog, ownedIds, g));
  const gen = fullGroups.some((g) => groupMembers(catalog, g).every((p) => p.traffic.role === 'generator'));
  const conv = fullGroups.some((g) => groupMembers(catalog, g).every((p) => p.traffic.role === 'converter'));
  return gen && conv;
}

/** Результат конвертации трафика на одном конвертере. */
export function convertTraffic(
  prop: Property,
  traffic: number,
  synergy: boolean,
): { trafficSpent: number; moneyOut: number; batches: number } {
  if (!isConverter(prop) || !prop.traffic.rate_in || !prop.traffic.rate_out) {
    return { trafficSpent: 0, moneyOut: 0, batches: 0 };
  }
  const batches = Math.floor(traffic / prop.traffic.rate_in);
  const rate = prop.traffic.rate_out * (synergy ? 1 + ECOSYSTEM_BONUS : 1);
  return {
    batches,
    trafficSpent: batches * prop.traffic.rate_in,
    moneyOut: Math.round(batches * rate),
  };
}

export function fmtNet(n: number): string {
  return `${n.toLocaleString('ru-RU')} $NET`;
}
