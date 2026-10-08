// Игровое поле 400×400 мм на листе A2 (420×594, портрет): сверху доска, снизу памятка.
// Версия для домашней печати (4 листа A4) нарезается из этого PDF в build.mjs.
import { GROUP_META, SITE_URL, findField } from '../lib/data.mjs';
import { document, esc, logoIcon, qrSvg, NAVY, BRAND } from '../lib/html.mjs';

const BOARD = 400; // мм
const CORNER_RATIO = 1.6;
const U = BOARD / (9 + 2 * CORNER_RATIO); // ширина обычной клетки
const C = U * CORNER_RATIO; // сторона угловой клетки

function coords(position) {
  if (position <= 11) return { row: 10, col: 11 - position, side: 'bottom' };
  if (position <= 20) return { row: 10 - (position - 11), col: 0, side: 'left' };
  if (position <= 31) return { row: 0, col: position - 21, side: 'top' };
  return { row: position - 31, col: 10, side: 'right' };
}

const ROT = { bottom: 0, left: 90, top: 180, right: -90 };

function cellHref(cell) {
  if (cell.ref) return `${SITE_URL}/card/${cell.ref}/`;
  if (cell.type === 'card') return `${SITE_URL}/${cell.deck}/`;
  return `${SITE_URL}/`;
}

async function edgeCell(catalog, cell) {
  const { row, col, side } = coords(cell.position);
  const qr = await qrSvg(cellHref(cell));
  let stripe = '#dee2e6';
  let stripeText = NAVY;
  let label = '';
  let name = '';
  let price = '';
  let extra = '';
  let cls = '';

  if (cell.type === 'property') {
    const f = findField(catalog, cell.ref);
    const g = GROUP_META[f.group];
    stripe = g.color;
    stripeText = g.text;
    label = g.label;
    name = f.name;
    price = `${f.price} $NET`;
    const t = f.traffic;
    if (t.role === 'generator') extra = `+${t.rate} трафика / ход`;
    else if (t.role === 'converter') extra = `${t.rate_in} трафика → ${t.rate_out} $NET`;
    else extra = `+${t.rate} / ход · ${t.rate_in} → ${t.rate_out} $NET`;
  } else if (cell.type === 'provider') {
    const f = findField(catalog, cell.ref);
    stripe = NAVY;
    stripeText = '#fff';
    label = 'Провайдер';
    name = f.name;
    price = `${f.price} $NET`;
    extra = 'рента 25 / 50 / 100 / 200';
  } else if (cell.type === 'utility') {
    const f = findField(catalog, cell.ref);
    stripe = '#6c757d';
    stripeText = '#fff';
    label = f.category === 'datacenter' ? 'Датацентр' : 'Регистратор';
    name = f.name;
    price = `${f.price} $NET`;
    extra = 'рента: кубики × 4 (× 10)';
  } else if (cell.type === 'card') {
    const chance = cell.deck === 'chance';
    stripe = chance ? '#e63946' : '#3a86ff';
    stripeText = '#fff';
    label = chance ? 'Шанс' : 'Казна';
    name = chance ? 'ШАНС' : 'КАЗНА';
    extra = chance ? 'риски интернет-бизнеса' : 'возможности';
    cls = 'deck';
  } else if (cell.type === 'tax') {
    stripe = '#adb5bd';
    label = 'Налог';
    name = cell.name;
    price = `−${cell.amount} $NET`;
    extra = 'в банк';
    cls = 'tax';
  }

  return `<div class="cell ${side}" style="grid-row:${row + 1};grid-column:${col + 1}">
    <div class="inner ${cls}" style="transform:translate(-50%,-50%) rotate(${ROT[side]}deg)">
      <div class="stripe" style="background:${stripe};color:${stripeText}">${esc(label)}</div>
      <div class="name">${esc(name)}</div>
      ${price ? `<div class="price">${esc(price)}</div>` : ''}
      <div class="extra">${esc(extra)}</div>
      <div class="qr">${qr}</div>
      <div class="pos">${cell.position}</div>
    </div>
  </div>`;
}

function cornerCell(catalog, cell) {
  const { row, col } = coords(cell.position);
  const map = {
    start: { title: 'СТАРТ', sub: `+${catalog.board.pass_start_bonus} $NET за круг`, bg: BRAND, color: '#fff', glyph: '→' },
    jail: { title: 'БАН', sub: 'просто смотришь', bg: '#e9ecef', color: NAVY, glyph: '⊘' },
    free_parking: { title: 'ОФЛАЙН', sub: 'ничего не происходит', bg: '#e9ecef', color: NAVY, glyph: '⏻' },
    go_to_jail: { title: 'ПОД БАН!', sub: 'иди в БАН', bg: '#e63946', color: '#fff', glyph: '⊘' },
  };
  const m = map[cell.subtype];
  return `<div class="cell corner" style="grid-row:${row + 1};grid-column:${col + 1};background:${m.bg};color:${m.color}">
    <div class="glyph">${m.glyph}</div>
    <div class="ctitle">${esc(m.title)}</div>
    <div class="csub">${esc(m.sub)}</div>
    <div class="pos">${cell.position}</div>
  </div>`;
}

async function boardHtml(catalog) {
  const cells = await Promise.all(catalog.cells.map((c) => (c.type === 'corner' ? cornerCell(catalog, c) : edgeCell(catalog, c))));
  const legend = Object.values(GROUP_META)
    .map((g) => `<span class="lg"><i style="background:${g.color}"></i>${esc(g.label)}</span>`)
    .join('');
  return `<div class="board">
    ${cells.join('')}
    <div class="center">
      <div class="deckbox chance" style="grid-area: 1 / 1"><span>ШАНС</span></div>
      <div class="deckbox chest" style="grid-area: 1 / 3"><span>КАЗНА</span></div>
      <div class="brand" style="grid-area: 2 / 1 / 3 / 4">
        ${logoIcon('22mm')}
        <div class="logo">eMonopolia</div>
        <div class="tag">ПОСТРОЙ СВОЙ ИНТЕРНЕТ</div>
        <div class="legend">${legend}</div>
        <div class="site">${esc(SITE_URL.replace(/^https?:\/\//, ''))}</div>
      </div>
    </div>
  </div>`;
}

function cheatSheet(catalog) {
  const conv = catalog.properties
    .filter((p) => p.traffic.role !== 'generator')
    .map((p) => `<tr><td>${esc(p.name)}</td><td>${p.traffic.rate_in} → ${p.traffic.rate_out} $NET</td></tr>`)
    .join('');
  const gen = catalog.properties
    .filter((p) => p.traffic.role !== 'converter')
    .map((p) => `<tr><td>${esc(p.name)}</td><td>+${p.traffic.rate}</td></tr>`)
    .join('');
  return `<div class="cheat">
    <div class="col">
      <h3>Ход</h3>
      <ol>
        <li>Получи трафик со своих полей-генераторов.</li>
        <li>Брось 2 кубика, передвинь фишку. Прошёл СТАРТ — +${catalog.board.pass_start_bonus} $NET.</li>
        <li>Свободное поле — купи или выставь на аукцион. Чужое — заплати ренту.</li>
        <li>В любой момент хода конвертируй трафик в $NET на своих маркетплейсах и стримингах.</li>
        <li>Дубль — ходи ещё раз. Три дубля подряд — в БАН.</li>
      </ol>
      <h3>БАН</h3>
      <p>Выход: дубль (3 попытки), 50 $NET или карточка. В БАНе рента и трафик приходят.</p>
      <h3>Консенсус</h3>
      <p>Покупка, прокачка и передача поля подтверждаются большинством игроков в приложении — как транзакция в блокчейне.</p>
    </div>
    <div class="col">
      <h3>Генераторы трафика (за ход)</h3>
      <table>${gen}</table>
    </div>
    <div class="col">
      <h3>Конвертеры трафика</h3>
      <table>${conv}</table>
      <p class="muted">Экосистема (полная группа генераторов + полная группа конвертеров): курс +25%.</p>
    </div>
    <div class="col">
      <h3>Провайдеры</h3>
      <table>${Object.entries(catalog.providerRentTable).map(([n, v]) => `<tr><td>${n} у владельца</td><td>${v} $NET</td></tr>`).join('')}</table>
      <h3>Коммуналки</h3>
      <table>${Object.entries(catalog.utilityMultiplier).map(([n, v]) => `<tr><td>${n} у владельца</td><td>кубики × ${v}</td></tr>`).join('')}</table>
      <h3>Прокачка хостинга</h3>
      <p>Только при полной группе, равномерно. VPS → выделенный сервер → облачный кластер → мультиоблако → датацентр.</p>
    </div>
  </div>`;
}

const CSS = `
  .board { position: relative; width: ${BOARD}mm; height: ${BOARD}mm; display: grid;
    grid-template-columns: ${C}mm repeat(9, ${U}mm) ${C}mm; grid-template-rows: ${C}mm repeat(9, ${U}mm) ${C}mm;
    background: #fff; border: 0.6mm solid ${NAVY}; }
  .cell { position: relative; border: 0.25mm solid ${NAVY}; overflow: hidden; }
  /* Контент клетки рисуется вертикально (полоска сверху) и поворачивается вокруг центра клетки, чтобы читаться со своей стороны стола */
  .inner { position: absolute; left: 50%; top: 50%; width: ${U}mm; height: ${C}mm; transform-origin: center; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .stripe { width: 100%; height: 8mm; font-size: 2.4mm; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; display: grid; place-items: center; border-bottom: 0.25mm solid ${NAVY}; }
  .name { margin-top: 1.6mm; font-size: 3.6mm; font-weight: 800; line-height: 1.05; padding: 0 1mm; }
  .price { margin-top: 0.8mm; font-size: 3.2mm; font-weight: 600; }
  .extra { margin-top: 0.6mm; font-size: 2.1mm; color: #6c757d; padding: 0 1mm; line-height: 1.15; }
  .qr { position: absolute; bottom: 2mm; width: 15mm; height: 15mm; }
  .pos { position: absolute; bottom: 1mm; right: 1.2mm; font-size: 2mm; color: #adb5bd; font-weight: 700; }
  .inner.deck .name { font-size: 5mm; margin-top: 4mm; letter-spacing: 0.08em; }
  .inner.tax .name { font-size: 3mm; }
  .corner { text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; }
  .corner .glyph { font-size: 14mm; line-height: 1; font-weight: 900; }
  .corner .ctitle { font-size: 6mm; font-weight: 900; margin-top: 2mm; letter-spacing: 0.04em; }
  .corner .csub { font-size: 2.6mm; opacity: 0.8; margin-top: 1mm; }
  .center { grid-row: 2 / 11; grid-column: 2 / 11; display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1.4fr; padding: 14mm; gap: 6mm; background: #f8f9fa; }
  .deckbox { border: 0.6mm dashed ${NAVY}; border-radius: 4mm; display: grid; place-items: center; font-size: 8mm; font-weight: 900; letter-spacing: 0.1em; }
  .deckbox.chance { color: #e63946; border-color: #e63946; }
  .deckbox.chest { color: #3a86ff; border-color: #3a86ff; }
  .brand { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .brand .logo { font-size: 22mm; line-height: 1; margin-top: 4mm; }
  .brand .tag { font-size: 4.5mm; letter-spacing: 0.4em; margin-top: 3mm; color: #6c757d; }
  .legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 2mm 5mm; margin-top: 10mm; font-size: 3.4mm; }
  .legend .lg { display: inline-flex; align-items: center; gap: 1.5mm; }
  .legend i { display: inline-block; width: 5mm; height: 5mm; border-radius: 1mm; border: 0.25mm solid ${NAVY}; }
  .site { margin-top: 8mm; font-size: 3.6mm; color: #6c757d; }

  .page.a2 { width: 420mm; height: 594mm; padding: 10mm; }
  .cheat { margin-top: 8mm; display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 8mm; font-size: 3.4mm; line-height: 1.35; }
  .cheat h3 { margin: 0 0 1.5mm; font-size: 4mm; text-transform: uppercase; letter-spacing: 0.08em; color: ${BRAND}; }
  .cheat h3:not(:first-child) { margin-top: 4mm; }
  .cheat ol, .cheat p { margin: 0 0 1mm; padding-left: 5mm; }
  .cheat p { padding-left: 0; }
  .cheat table { border-collapse: collapse; width: 100%; }
  .cheat td { padding: 0.6mm 0; border-bottom: 0.2mm solid #dee2e6; }
  .cheat td:last-child { text-align: right; font-weight: 600; white-space: nowrap; }

`;

export async function renderBoardA2(catalog) {
  const board = await boardHtml(catalog);
  return document('eMonopolia — игровое поле A2', `@page { size: 420mm 594mm; margin: 0; } ${CSS}`,
    `<div class="page a2">${board}${cheatSheet(catalog)}</div>`);
}
