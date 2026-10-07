#!/usr/bin/env node
// Валидация data/ — единого источника игровых данных.
// Проверки описаны в data/README.md. Запуск: npm run validate:data

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

function load(name) {
  const file = join(DATA, name);
  try {
    return yaml.load(readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`${name}: не удалось прочитать YAML — ${e.message}`);
    return null;
  }
}

const board = load('board.yaml');
const props = load('properties.yaml');
const provs = load('providers.yaml');
const utils = load('utilities.yaml');
const chance = load('chance.yaml');
const chest = load('chest.yaml');

if (errors.length) report();

// --- Уникальность ID ----------------------------------------------------------
function checkUniqueIds(list, label) {
  const seen = new Set();
  for (const item of list) {
    if (!item.id) fail(`${label}: запись без id (${JSON.stringify(item).slice(0, 60)})`);
    else if (!/^[a-z0-9_]+$/.test(item.id)) fail(`${label}: id "${item.id}" должен быть в snake/kebab-case латиницей`);
    else if (seen.has(item.id)) fail(`${label}: дубль id "${item.id}"`);
    seen.add(item.id);
  }
  return seen;
}

const propIds = checkUniqueIds(props.properties, 'properties.yaml');
const provIds = checkUniqueIds(provs.providers, 'providers.yaml');
const utilIds = checkUniqueIds(utils.utilities, 'utilities.yaml');
checkUniqueIds(chance.chance, 'chance.yaml');
checkUniqueIds(chest.chest, 'chest.yaml');

const allFieldIds = new Set([...propIds, ...provIds, ...utilIds]);
for (const id of propIds) {
  if (provIds.has(id) || utilIds.has(id)) fail(`id "${id}" встречается в нескольких файлах`);
}

// --- Доска --------------------------------------------------------------------
const cells = board.cells ?? [];
if (board.board?.size !== 40) fail(`board.yaml: board.size должен быть 40, сейчас ${board.board?.size}`);
if (cells.length !== 40) fail(`board.yaml: на доске ${cells.length} клеток, должно быть 40`);

const positions = new Set();
const referenced = new Set();
for (const cell of cells) {
  if (positions.has(cell.position)) fail(`board.yaml: позиция ${cell.position} встречается дважды`);
  positions.add(cell.position);

  switch (cell.type) {
    case 'property':
      if (!propIds.has(cell.ref)) fail(`board.yaml #${cell.position}: ref "${cell.ref}" нет в properties.yaml`);
      break;
    case 'provider':
      if (!provIds.has(cell.ref)) fail(`board.yaml #${cell.position}: ref "${cell.ref}" нет в providers.yaml`);
      break;
    case 'utility':
      if (!utilIds.has(cell.ref)) fail(`board.yaml #${cell.position}: ref "${cell.ref}" нет в utilities.yaml`);
      break;
    case 'card':
      if (!['chance', 'chest'].includes(cell.deck)) fail(`board.yaml #${cell.position}: неизвестная колода "${cell.deck}"`);
      break;
    case 'tax':
      if (!(cell.amount > 0)) fail(`board.yaml #${cell.position}: налог должен быть положительным`);
      break;
    case 'corner':
      if (!['start', 'jail', 'free_parking', 'go_to_jail'].includes(cell.subtype))
        fail(`board.yaml #${cell.position}: неизвестный subtype "${cell.subtype}"`);
      break;
    default:
      fail(`board.yaml #${cell.position}: неизвестный type "${cell.type}"`);
  }
  if (cell.ref) {
    if (referenced.has(cell.ref)) fail(`board.yaml: поле "${cell.ref}" стоит на доске дважды`);
    referenced.add(cell.ref);
  }
}
for (let p = 1; p <= 40; p++) if (!positions.has(p)) fail(`board.yaml: нет клетки с позицией ${p}`);
for (const id of allFieldIds) if (!referenced.has(id)) fail(`поле "${id}" не стоит ни на одной клетке доски`);

// --- Поля ---------------------------------------------------------------------
const groups = new Map();
for (const p of props.properties) {
  const where = `properties.yaml "${p.id}"`;
  if (!(p.price > 0)) fail(`${where}: цена должна быть положительной`);
  if (p.mortgage !== p.price / 2) warn(`${where}: залог ${p.mortgage} ≠ половине цены ${p.price / 2}`);
  if (!p.group) fail(`${where}: нет группы`);
  groups.set(p.group, (groups.get(p.group) ?? 0) + 1);

  const r = p.rent ?? {};
  const ladder = [r.base, r.with_monopoly, ...(r.with_hosting ?? []), r.with_datacenter];
  if ((r.with_hosting ?? []).length !== 4) fail(`${where}: rent.with_hosting должен содержать 4 уровня`);
  for (let i = 0; i < ladder.length; i++) {
    if (typeof ladder[i] !== 'number' || ladder[i] <= 0) fail(`${where}: рента на ступени ${i} не число > 0`);
    else if (i > 0 && ladder[i] <= ladder[i - 1]) fail(`${where}: рента не возрастает на ступени ${i} (${ladder[i - 1]} → ${ladder[i]})`);
  }
  if (r.with_monopoly !== r.base * 2) warn(`${where}: рента с монополией ${r.with_monopoly} ≠ 2 × базовой ${r.base}`);
  if (!(p.upgrade_cost > 0)) fail(`${where}: upgrade_cost должен быть положительным`);

  const t = p.traffic ?? {};
  if (!['generator', 'converter', 'hybrid'].includes(t.role)) fail(`${where}: traffic.role "${t.role}" неизвестна`);
  if (['generator', 'hybrid'].includes(t.role) && !(t.rate > 0)) fail(`${where}: генератор должен иметь traffic.rate > 0`);
  if (['converter', 'hybrid'].includes(t.role) && !(t.rate_in > 0 && t.rate_out > 0))
    fail(`${where}: конвертер должен иметь traffic.rate_in и rate_out > 0`);
}
for (const [g, n] of groups) if (n < 2 || n > 3) fail(`группа "${g}" содержит ${n} полей, должно быть 2–3`);
if (groups.size !== 8) fail(`должно быть 8 групп, найдено ${groups.size}`);

// --- Провайдеры и коммуналки --------------------------------------------------
for (const p of provs.providers) if (!(p.price > 0)) fail(`providers.yaml "${p.id}": цена должна быть положительной`);
if (provs.providers.length !== 4) fail(`providers.yaml: провайдеров ${provs.providers.length}, должно быть 4`);
for (const n of [1, 2, 3, 4]) if (!(provs.rent_table?.[n] > 0)) fail(`providers.yaml: нет ренты для ${n} провайдеров`);
for (const u of utils.utilities) if (!(u.price > 0)) fail(`utilities.yaml "${u.id}": цена должна быть положительной`);
if (utils.utilities.length !== 2) fail(`utilities.yaml: коммуналок ${utils.utilities.length}, должно быть 2`);
for (const n of [1, 2]) if (!(utils.rent_multiplier?.[n] > 0)) fail(`utilities.yaml: нет множителя для ${n} коммуналок`);

// --- Карточки -----------------------------------------------------------------
const KNOWN_ACTIONS = new Set([
  'pay_bank', 'receive_bank', 'go_to_jail', 'lose_traffic', 'gain_traffic', 'pay_per_hosting',
  'move_to', 'move_to_nearest', 'collect_from_each', 'skip_turn', 'double_next_rent',
]);
function checkDeck(list, label) {
  if (list.length !== 16) fail(`${label}: карточек ${list.length}, должно быть 16`);
  for (const c of list) {
    if (!c.title || !c.text) fail(`${label} "${c.id}": нужны title и text`);
    if (!KNOWN_ACTIONS.has(c.action?.type)) fail(`${label} "${c.id}": неизвестный action.type "${c.action?.type}"`);
    if (['pay_bank', 'receive_bank', 'lose_traffic', 'gain_traffic', 'pay_per_hosting', 'collect_from_each'].includes(c.action?.type) && !(c.action.amount > 0))
      fail(`${label} "${c.id}": action.amount должен быть > 0`);
  }
}
checkDeck(chance.chance, 'chance.yaml');
checkDeck(chest.chest, 'chest.yaml');

// --- Редакции -----------------------------------------------------------------
const editionsDir = join(DATA, 'editions');
let defaults = 0;
for (const f of readdirSync(editionsDir).filter((f) => f.endsWith('.yaml'))) {
  const ed = load(`editions/${f}`);
  if (!ed) continue;
  if (ed.edition?.id !== f.replace('.yaml', '')) fail(`editions/${f}: edition.id должен совпадать с именем файла`);
  if (ed.edition?.default) defaults++;
  const checkList = (key, ids) => {
    const v = ed[key];
    if (v === 'all' || v === undefined) return;
    if (!Array.isArray(v)) return fail(`editions/${f}: ${key} должен быть "all" или списком`);
    for (const item of v) {
      const id = typeof item === 'string' ? item : item.id;
      if (!ids.has(id)) fail(`editions/${f}: ${key} ссылается на несуществующее поле "${id}"`);
    }
  };
  checkList('properties_used', propIds);
  checkList('providers_used', provIds);
  checkList('utilities_used', utilIds);
}
if (defaults !== 1) fail(`ровно одна редакция должна быть default: true, сейчас ${defaults}`);

// --- Контент ------------------------------------------------------------------
const contentDir = join(ROOT, 'content', 'ru', 'properties');
if (existsSync(contentDir)) {
  const have = new Set(readdirSync(contentDir).filter((f) => f.endsWith('.md')).map((f) => f.replace('.md', '')));
  for (const id of allFieldIds) if (!have.has(id)) warn(`content/ru/properties/${id}.md отсутствует — у поля не будет обучающего текста`);
  for (const id of have) if (!allFieldIds.has(id)) warn(`content/ru/properties/${id}.md не соответствует ни одному полю`);
}

report();

function report() {
  for (const w of warnings) console.log(`⚠️  ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`❌ ${e}`);
    console.error(`\nОшибок: ${errors.length}, предупреждений: ${warnings.length}`);
    process.exit(1);
  }
  console.log(`✅ data/ валиден: 40 клеток, ${propIds?.size ?? 0} полей, ${provIds?.size ?? 0} провайдера, ${utilIds?.size ?? 0} коммуналки, 16+16 карточек. Предупреждений: ${warnings.length}`);
  process.exit(0);
}
