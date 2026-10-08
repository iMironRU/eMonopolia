#!/usr/bin/env node
// Генерация печатных материалов из data/. Результат — print/out/*.pdf (+ исходный HTML).
// Запуск: npm run build          — HTML + PDF
//         npm run build:html     — только HTML (без браузера)
// Переменные: SITE_URL (адрес сайта для QR), CHROMIUM_PATH (свой Chromium вместо playwright-овского)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, SITE_URL } from './lib/data.mjs';
import { renderBoardA2 } from './templates/board.mjs';
import { renderEventCards, renderPropertyCards } from './templates/cards.mjs';
import { tileBoardToA4 } from './lib/tile.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT, { recursive: true });
const htmlOnly = process.argv.includes('--html-only');

const catalog = loadCatalog();
console.log(`Сайт для QR-кодов: ${SITE_URL}`);

const docs = [
  { name: 'board-a2', html: await renderBoardA2(catalog) },
  { name: 'cards-properties', html: await renderPropertyCards(catalog) },
  { name: 'cards-chance', html: renderEventCards(catalog, 'chance') },
  { name: 'cards-chest', html: renderEventCards(catalog, 'chest') },
];

for (const d of docs) writeFileSync(join(OUT, `${d.name}.html`), d.html);
if (htmlOnly) {
  console.log(`HTML записан в ${OUT}`);
  process.exit(0);
}

const { chromium } = await import('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage();
  for (const d of docs) {
    await page.setContent(d.html, { waitUntil: 'load' });
    await page.pdf({ path: join(OUT, `${d.name}.pdf`), preferCSSPageSize: true, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    console.log(`✓ ${d.name}.pdf`);
  }
} finally {
  await browser.close();
}

// Домашняя версия поля: 4 листа A4, нарезанные из A2
const a4 = await tileBoardToA4(readFileSync(join(OUT, 'board-a2.pdf')));
writeFileSync(join(OUT, 'board-a4x4.pdf'), a4);
console.log('✓ board-a4x4.pdf');
