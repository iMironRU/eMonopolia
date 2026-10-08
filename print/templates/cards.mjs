// Карточки 65×90 мм, 9 штук на листе A4 с метками реза.
import { GROUP_META, HOSTING_LEVELS, SITE_URL, realAnalogs } from '../lib/data.mjs';
import { document, esc, logoIcon, qrSvg, NAVY, BRAND } from '../lib/html.mjs';

const W = 65;
const H = 90;
const PER_PAGE = 9;

const CSS = `
  @page { size: A4 portrait; margin: 0; }
  .page { width: 210mm; height: 297mm; padding: 13.5mm 7.5mm; display: grid; grid-template-columns: repeat(3, ${W}mm); grid-template-rows: repeat(3, ${H}mm); }
  .card { width: ${W}mm; height: ${H}mm; border: 0.2mm solid #adb5bd; position: relative; overflow: hidden; background: #fff; display: flex; flex-direction: column; }
  .head { padding: 2.5mm 3mm 2mm; }
  .head .grp { font-size: 2.2mm; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; opacity: 0.85; }
  .head .nm { font-size: 5.2mm; font-weight: 900; line-height: 1.05; margin-top: 0.5mm; }
  .body { padding: 2mm 3mm 0; font-size: 2.7mm; flex: 1; }
  .row { display: flex; justify-content: space-between; gap: 2mm; padding: 0.55mm 0; border-bottom: 0.15mm solid #e9ecef; }
  .row b { white-space: nowrap; }
  .row.total { border-bottom: none; font-weight: 700; }
  .sub { font-size: 2.2mm; color: #6c757d; margin-top: 1.2mm; line-height: 1.25; }
  .foot { display: flex; align-items: flex-end; justify-content: space-between; padding: 1.5mm 3mm 2.5mm; gap: 2mm; }
  .foot .qr { width: 13mm; height: 13mm; flex: none; }
  .foot .fl { font-size: 2.1mm; color: #6c757d; line-height: 1.25; }
  .foot .fl b { color: ${NAVY}; }
  .price { font-size: 3.2mm; font-weight: 800; margin-top: 1mm; }
  .traffic { margin-top: 1.5mm; padding: 1.2mm 2mm; border-radius: 1.5mm; background: #f1f3f5; font-size: 2.5mm; font-weight: 600; }

  .event .head { padding-top: 4mm; }
  .event .nm { font-size: 5mm; }
  .event .body { font-size: 3.4mm; line-height: 1.35; padding-top: 4mm; }
  .event .kind { font-size: 2.2mm; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; }

  .back { background: ${NAVY}; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; border-color: ${NAVY}; }
  .back .logo { font-size: 6mm; margin-top: 3mm; color: #fff; }
  .back .kind { font-size: 3mm; letter-spacing: 0.3em; margin-top: 2mm; font-weight: 700; }
  .back.chance { background: #e63946; }
  .back.chest { background: #3a86ff; }
`;

function paginate(cards) {
  const pages = [];
  for (let i = 0; i < cards.length; i += PER_PAGE) pages.push(cards.slice(i, i + PER_PAGE));
  return pages.map((p) => `<div class="page">${p.join('')}</div>`).join('');
}

async function propertyCard(catalog, p) {
  const g = GROUP_META[p.group];
  const qr = await qrSvg(`${SITE_URL}/card/${p.id}/`);
  const analog = realAnalogs(p.id);
  const t = p.traffic;
  let traffic = '';
  if (t.role === 'generator') traffic = `Генератор: +${t.rate} трафика за ход`;
  else if (t.role === 'converter') traffic = `Конвертер: ${t.rate_in} трафика → ${t.rate_out} $NET`;
  else traffic = `Гибрид: +${t.rate} за ход · ${t.rate_in} → ${t.rate_out} $NET`;
  const rows = [
    ['Базовая рента', p.rent.base],
    ['С монополией', p.rent.with_monopoly],
    ...p.rent.with_hosting.map((v, i) => [HOSTING_LEVELS[i], v]),
    [HOSTING_LEVELS[4], p.rent.with_datacenter],
  ];
  return `<div class="card">
    <div class="head" style="background:${g.color};color:${g.text}">
      <div class="grp">${esc(g.label)}</div>
      <div class="nm">${esc(p.name)}</div>
    </div>
    <div class="body">
      ${rows.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${v} $NET</b></div>`).join('')}
      <div class="row total"><span>Прокачка (уровень)</span><b>${p.upgrade_cost} $NET</b></div>
      <div class="traffic">${esc(traffic)}</div>
      ${analog ? `<div class="sub">Как в жизни: ${esc(analog)}</div>` : ''}
    </div>
    <div class="foot">
      <div class="fl">Цена <b>${p.price} $NET</b><br>Залог <b>${p.mortgage} $NET</b><br>Клетка ${cellPos(catalog, p.id)}</div>
      <div class="qr">${qr}</div>
    </div>
  </div>`;
}

async function providerCard(catalog, p) {
  const qr = await qrSvg(`${SITE_URL}/card/${p.id}/`);
  const analog = realAnalogs(p.id);
  return `<div class="card">
    <div class="head" style="background:${NAVY};color:#fff">
      <div class="grp">Провайдер</div>
      <div class="nm">${esc(p.name)}</div>
    </div>
    <div class="body">
      <div class="sub" style="margin:0 0 1.5mm">Рента зависит от числа провайдеров у владельца:</div>
      ${Object.entries(catalog.providerRentTable).map(([n, v]) => `<div class="row"><span>${n} провайдер${n === '1' ? '' : 'а'}</span><b>${v} $NET</b></div>`).join('')}
      <div class="traffic">Инфраструктура: магистрали, по которым едет весь трафик</div>
      ${analog ? `<div class="sub">Как в жизни: ${esc(analog)}</div>` : ''}
    </div>
    <div class="foot">
      <div class="fl">Цена <b>${p.price} $NET</b><br>Залог <b>${p.mortgage} $NET</b><br>Клетка ${cellPos(catalog, p.id)}</div>
      <div class="qr">${qr}</div>
    </div>
  </div>`;
}

async function utilityCard(catalog, u) {
  const qr = await qrSvg(`${SITE_URL}/card/${u.id}/`);
  const analog = realAnalogs(u.id);
  return `<div class="card">
    <div class="head" style="background:#6c757d;color:#fff">
      <div class="grp">${u.category === 'datacenter' ? 'Датацентр' : 'Регистратор доменов'}</div>
      <div class="nm">${esc(u.name)}</div>
    </div>
    <div class="body">
      <div class="sub" style="margin:0 0 1.5mm">Рента = выпавшее на кубиках × множитель:</div>
      ${Object.entries(catalog.utilityMultiplier).map(([n, v]) => `<div class="row"><span>${n} коммуналк${n === '1' ? 'а' : 'и'} у владельца</span><b>× ${v}</b></div>`).join('')}
      <div class="traffic">Без датацентра и домена не работает ни один сайт</div>
      ${analog ? `<div class="sub">Как в жизни: ${esc(analog)}</div>` : ''}
    </div>
    <div class="foot">
      <div class="fl">Цена <b>${u.price} $NET</b><br>Залог <b>${u.mortgage} $NET</b><br>Клетка ${cellPos(catalog, u.id)}</div>
      <div class="qr">${qr}</div>
    </div>
  </div>`;
}

function cellPos(catalog, id) {
  return catalog.cells.find((c) => c.ref === id)?.position ?? '';
}

function eventCard(deck, card) {
  const chance = deck === 'chance';
  const color = chance ? '#e63946' : '#3a86ff';
  return `<div class="card event">
    <div class="head" style="background:${color};color:#fff">
      <div class="kind">${chance ? 'Шанс' : 'Общественная казна'}</div>
      <div class="nm">${esc(card.title)}</div>
    </div>
    <div class="body">${esc(card.text)}</div>
    <div class="foot"><div class="fl">${chance ? 'Риски интернет-бизнеса' : 'Возможности интернет-бизнеса'}</div>${logoIcon('7mm')}</div>
  </div>`;
}

function backCard(kind) {
  const label = kind === 'chance' ? 'ШАНС' : kind === 'chest' ? 'КАЗНА' : 'ВЛАДЕНИЕ';
  return `<div class="card back ${kind}">${logoIcon('18mm')}<div class="logo"><span class="logo">eMonopolia</span></div><div class="kind">${label}</div></div>`;
}

export async function renderPropertyCards(catalog) {
  const cards = [
    ...(await Promise.all(catalog.properties.map((p) => propertyCard(catalog, p)))),
    ...(await Promise.all(catalog.providers.map((p) => providerCard(catalog, p)))),
    ...(await Promise.all(catalog.utilities.map((u) => utilityCard(catalog, u)))),
  ];
  return document('eMonopolia — карточки владений', CSS, paginate(cards));
}

/** Колода событий: лицевые стороны, затем столько же листов рубашек (для двусторонней печати). */
export function renderEventCards(catalog, deck) {
  const faces = catalog[deck].map((c) => eventCard(deck, c));
  const backs = faces.map(() => backCard(deck));
  return document(`eMonopolia — карточки ${deck === 'chance' ? 'Шанса' : 'Казны'}`, CSS, paginate(faces) + paginate(backs));
}
