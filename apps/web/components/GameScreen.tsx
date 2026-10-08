'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Catalog, Field, Property } from '@/lib/types';
import {
  CONSENSUS_CONVERT_THRESHOLD,
  GROUP_META,
  HOSTING_LEVELS,
  MAX_LEVEL,
  SYNERGY_BONUS_PERCENT,
  allFields,
  convertTraffic,
  findField,
  groupMembers,
  hasEcosystemSynergy,
  isConverter,
  ownsGroup,
  propertyRent,
  providerRent,
  trafficIncome,
  utilityRent,
} from '@/lib/rules';
import { PLAYER_COLORS, describeTx, useGame, type BoardRules, type TxPayload } from '@/lib/store';
import { useHydrated } from './StoreHydrator';
import { Board, type BoardView } from './Board';
import { cellHref, cellTitle } from './CellTile';

type Action = 'rent' | 'buy' | 'upgrade' | 'convert' | 'transfer' | 'mortgage' | 'trade' | 'fix';

export function boardRules(catalog: Catalog): BoardRules {
  const corner = (sub: string) => catalog.cells.find((c) => c.type === 'corner' && c.subtype === sub)?.position;
  return {
    size: catalog.board.size,
    startPosition: catalog.board.start_position,
    jailPosition: corner('jail') ?? 11,
    goToJailPosition: corner('go_to_jail') ?? 31,
  };
}

const ACTIONS: { id: Action; label: string; icon: string }[] = [
  { id: 'rent', label: 'Рента', icon: '🏠' },
  { id: 'buy', label: 'Купить поле', icon: '🛒' },
  { id: 'upgrade', label: 'Прокачать', icon: '🏗️' },
  { id: 'convert', label: 'Конвертация трафика', icon: '💱' },
  { id: 'trade', label: 'Перевод игроку', icon: '🤝' },
  { id: 'transfer', label: 'Продать поле', icon: '📜' },
  { id: 'mortgage', label: 'Залог', icon: '🏦' },
  { id: 'fix', label: 'Коррекция', icon: '✏️' },
];

export function GameScreen({ catalog }: { catalog: Catalog }) {
  const hydrated = useHydrated();
  const started = useGame((s) => s.started);
  if (!hydrated) return <div className="text-sm text-muted">Загрузка партии…</div>;
  return started ? <Table catalog={catalog} /> : <Setup />;
}

/* ---------------------------------------------------------------- Setup */

function Setup() {
  const setup = useGame((s) => s.setup);
  const [names, setNames] = useState(['', '', '', '']);
  const [startMoney, setStartMoney] = useState(1500);
  const [passStartBonus, setPassStartBonus] = useState(200);
  const valid = names.filter((n) => n.trim()).length >= 2;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-black">Новая партия</h1>
      <p className="text-sm text-muted">
        Один телефон на стол — «банк». Игроки по очереди нажимают свои кнопки, а сделки подтверждают большинством.
      </p>
      <div className="card space-y-2">
        {names.map((n, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="size-4 rounded-full" style={{ background: PLAYER_COLORS[i] }} />
            <input
              className="input"
              placeholder={`Игрок ${i + 1}`}
              value={n}
              onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
            />
          </div>
        ))}
        {names.length < 6 && (
          <button className="btn-ghost w-full" onClick={() => setNames([...names, ''])}>
            + ещё игрок
          </button>
        )}
      </div>
      <div className="card grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-muted">Стартовый капитал</span>
          <input className="input mt-1" type="number" value={startMoney} onChange={(e) => setStartMoney(Number(e.target.value))} />
        </label>
        <label className="text-sm">
          <span className="text-muted">Бонус за СТАРТ</span>
          <input className="input mt-1" type="number" value={passStartBonus} onChange={(e) => setPassStartBonus(Number(e.target.value))} />
        </label>
      </div>
      <button
        className="btn-primary w-full text-base"
        disabled={!valid}
        onClick={() =>
          setup(
            names.map((n, i) => ({ name: n.trim(), color: PLAYER_COLORS[i] })).filter((p) => p.name),
            { startMoney, passStartBonus, jailFee: 50 },
          )
        }
      >
        Начать игру
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- Game shell (мобильная раскладка) */

type Tab = 'players' | 'actions' | 'deals' | 'log' | 'menu';
const VIEW_KEY = 'emonopolia-board-view';
const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function Table({ catalog }: { catalog: Catalog }) {
  const g = useGame();
  const [tab, setTab] = useState<Tab | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [view, setView] = useState<BoardView>('iso');
  const [rolling, setRolling] = useState(false);
  const [showDice, setShowDice] = useState(false);
  const [paid, setPaid] = useState<number | null>(null); // клетка, за которую уже заплатили в этом ходу
  const [dismissed, setDismissed] = useState<number | null>(null); // закрытая карточка клетки

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'flat' || saved === 'iso') setView(saved);
    } catch {
      /* ignore */
    }
  }, []);
  const toggleView = () => {
    const next: BoardView = view === 'iso' ? 'flat' : 'iso';
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const me = g.players[g.turn.current];
  const rules = boardRules(catalog);
  const pending = g.txs.filter((t) => t.status === 'pending');
  const ownedBy = (pid: string) => Object.entries(g.ownership).filter(([, o]) => o.owner === pid).map(([id]) => id);
  const myOwned = me ? ownedBy(me.id) : [];
  const income = me ? trafficIncome(catalog, myOwned, myOwned.filter((id) => g.ownership[id].mortgaged)) : 0;
  const canRoll = !!me && (!g.turn.rolled || (g.turn.doubles > 0 && !me.inJail));
  const canEnd = !!me && g.turn.rolled && !(g.turn.doubles > 0 && !me.inJail);

  function roll() {
    if (!canRoll || rolling) return;
    setRolling(true);
    setShowDice(true);
    setPaid(null);
    setDismissed(null);
    // Короткая анимация «кубики крутятся», затем настоящий бросок из стора
    window.setTimeout(() => {
      g.rollDice(rules, income);
      setRolling(false);
    }, 650);
  }
  function endTurn() {
    setPaid(null);
    setDismissed(null);
    setShowDice(false);
    g.endTurn();
  }

  if (!me) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col text-white"
      style={{ background: 'radial-gradient(circle at 50% 20%, #17483a 0%, #0d1b2a 65%)' }}
    >
      {/* HUD */}
      <header className="flex items-center justify-between gap-2 px-3 pt-[max(8px,env(safe-area-inset-top))] pb-2">
        <button className="flex min-w-0 items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-left" onClick={() => setTab('players')}>
          <span className="grid size-8 shrink-0 place-items-center rounded-full text-sm font-black text-white" style={{ background: me.color }}>
            {me.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight">{me.name}</span>
            <span className="block text-[10px] uppercase tracking-wider text-white/60">ходит</span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <Stat icon="💵" value={me.money} title="$NET" danger={me.money < 0} />
          <Stat icon="🌐" value={me.traffic} title="трафик" />
        </div>
        <button className="grid size-9 place-items-center rounded-full bg-white/10 text-lg" onClick={() => setTab('menu')} aria-label="Меню">
          ☰
        </button>
      </header>

      {/* Доска */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2">
        <Board
          catalog={catalog}
          view={view}
          className="shrink-0"
          tokens={g.players.map((p) => ({ id: p.id, name: p.name, color: p.color, position: p.position, inJail: p.inJail }))}
          highlight={g.turn.landed}
          ownership={Object.fromEntries(Object.entries(g.ownership).map(([id, o]) => [id, { color: g.players.find((p) => p.id === o.owner)?.color ?? '#999', level: o.level, mortgaged: o.mortgaged }]))}
          style={{ width: view === 'iso' ? 'min(135%, calc((100dvh - 230px) * 1.47))' : 'min(100%, calc(100dvh - 230px))' }}
        />

        {showDice && <Dice rolling={rolling} roll={g.turn.lastRoll} />}

        {!rolling && (
          <LandingCard
            catalog={catalog}
            paid={paid}
            setPaid={setPaid}
            dismissed={dismissed}
            onDismiss={() => setDismissed(g.turn.landed)}
            onOpenDeals={() => setTab('deals')}
          />
        )}
      </div>

      {/* Нижняя панель */}
      <nav className="px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1">
        <div className="relative mx-auto grid max-w-xl grid-cols-5 items-end gap-1">
          <TabButton icon="👥" label="Игроки" onClick={() => setTab('players')} />
          <TabButton icon="⚡" label="Действия" onClick={() => setTab('actions')} />
          <div className="flex flex-col items-center">
            {canRoll ? (
              <button
                onClick={roll}
                disabled={rolling}
                className="-mt-6 grid size-[76px] place-items-center rounded-full border-4 border-white/20 bg-gradient-to-b from-[#ff9f43] to-[#e8590c] text-center shadow-[0_8px_0_#a63d05,0_12px_24px_rgba(0,0,0,0.5)] transition active:translate-y-1 active:shadow-[0_4px_0_#a63d05] disabled:opacity-70"
                style={{ transform: rolling ? 'translateY(4px)' : undefined }}
              >
                <span className="text-2xl leading-none">🎲</span>
                <span className="mt-0.5 block text-[10px] font-black uppercase tracking-wider">{g.turn.doubles > 0 && g.turn.rolled ? 'Ещё раз' : 'Бросок'}</span>
              </button>
            ) : (
              <button
                onClick={endTurn}
                disabled={!canEnd}
                className="-mt-6 grid size-[76px] place-items-center rounded-full border-4 border-white/20 bg-gradient-to-b from-[#2ecc71] to-[#1e9e55] text-center shadow-[0_8px_0_#13693a,0_12px_24px_rgba(0,0,0,0.5)] transition active:translate-y-1 active:shadow-[0_4px_0_#13693a] disabled:opacity-50"
              >
                <span className="text-2xl leading-none">➜</span>
                <span className="mt-0.5 block text-[10px] font-black uppercase tracking-wider">Конец хода</span>
              </button>
            )}
            {!g.turn.rolled && income > 0 && <span className="mt-1 text-[10px] text-white/60">+{income} трафика за ход</span>}
            {g.turn.lastRoll && !showDice && (
              <span className="mt-1 text-[11px] text-white/70">
                {DIE[g.turn.lastRoll[0]]}
                {DIE[g.turn.lastRoll[1]]} = {g.turn.lastRoll[0] + g.turn.lastRoll[1]}
              </span>
            )}
          </div>
          <TabButton icon="🪙" label="Сделки" badge={pending.length} onClick={() => setTab('deals')} />
          <TabButton icon="📜" label="Журнал" onClick={() => setTab('log')} />
        </div>
      </nav>

      {/* Шторки */}
      <Sheet open={tab === 'players'} title="Игроки" onClose={() => setTab(null)}>
        <PlayersList catalog={catalog} />
      </Sheet>
      <Sheet open={tab === 'actions'} title="Действия" onClose={() => { setTab(null); setAction(null); }}>
        <div className="grid grid-cols-2 gap-2">
          {ACTIONS.map((a) => (
            <button key={a.id} className={`${action === a.id ? 'btn-dark' : 'btn-ghost'} justify-start`} onClick={() => setAction(action === a.id ? null : a.id)}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {action === 'rent' && <RentForm catalog={catalog} onDone={() => setAction(null)} />}
          {action === 'buy' && <BuyForm catalog={catalog} onDone={() => { setAction(null); setTab('deals'); }} />}
          {action === 'upgrade' && <UpgradeForm catalog={catalog} onDone={() => { setAction(null); setTab('deals'); }} />}
          {action === 'convert' && <ConvertForm catalog={catalog} onDone={() => setAction(null)} />}
          {action === 'trade' && <TradeForm onDone={() => setAction(null)} />}
          {action === 'transfer' && <TransferForm catalog={catalog} onDone={() => { setAction(null); setTab('deals'); }} />}
          {action === 'mortgage' && <MortgageForm catalog={catalog} onDone={() => setAction(null)} />}
          {action === 'fix' && <FixForm onDone={() => setAction(null)} />}
        </div>
      </Sheet>
      <Sheet open={tab === 'deals'} title={`Сделки на подтверждение${pending.length ? ` (${pending.length})` : ''}`} onClose={() => setTab(null)}>
        <PendingList />
      </Sheet>
      <Sheet open={tab === 'log'} title="Журнал" onClose={() => setTab(null)}>
        <ul className="space-y-1 text-sm">
          {g.log.map((e) => (
            <li key={e.id} className="border-b border-navy/5 py-1 last:border-0">
              <span className="mr-2 text-xs text-muted">{new Date(e.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
              {e.text}
            </li>
          ))}
        </ul>
      </Sheet>
      <Sheet open={tab === 'menu'} title="Меню" onClose={() => setTab(null)}>
        <div className="space-y-2">
          <button className="btn-ghost w-full justify-start" onClick={() => { toggleView(); setTab(null); }}>
            {view === 'iso' ? '⬒ Плоская доска' : '◈ 3D-доска'}
          </button>
          <Link href="/" className="btn-ghost w-full justify-start">
            🗺️ Карточки полей и правила
          </Link>
          <Link href="/qr/" className="btn-ghost w-full justify-start">
            🖨️ QR-коды и печать
          </Link>
          <button
            className="btn-danger w-full justify-start"
            onClick={() => {
              if (confirm('Завершить партию и стереть состояние?')) {
                g.reset();
                setTab(null);
              }
            }}
          >
            ⏹ Завершить партию
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function Stat({ icon, value, title, danger }: { icon: string; value: number; title: string; danger?: boolean }) {
  return (
    <div className={`flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-sm font-black tabular-nums ${danger ? 'text-[#ff6b6b]' : ''}`} title={title}>
      <span className="text-base leading-none">{icon}</span>
      {value.toLocaleString('ru-RU')}
    </div>
  );
}

function TabButton({ icon, label, badge, onClick }: { icon: string; label: string; badge?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative flex flex-col items-center gap-0.5 rounded-xl py-1 text-white/80 active:bg-white/10">
      <span className="text-2xl leading-none">{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      {!!badge && (
        <span className="absolute -top-1 right-1/4 grid min-w-5 place-items-center rounded-full bg-[#e63946] px-1 text-[10px] font-black text-white">{badge}</span>
      )}
    </button>
  );
}

/** Выдвижная панель снизу, как в мобильных играх. */
function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative mx-auto flex max-h-[80%] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-paper text-navy shadow-2xl"
        style={{ animation: 'sheet-up 0.25s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-navy/20 absolute left-1/2 top-2 -translate-x-1/2" />
          <h2 className="mt-2 text-lg font-black">{title}</h2>
          <button className="mt-2 grid size-8 place-items-center rounded-full bg-navy/5 text-navy/70" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">{children}</div>
        <div className="border-t border-navy/10 bg-paper px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button className="btn-dark w-full" onClick={onClose}>
            ОК
          </button>
        </div>
      </div>
    </div>
  );
}

/** Кубики по центру доски: крутятся, затем показывают результат. */
function Dice({ rolling, roll }: { rolling: boolean; roll: [number, number] | null }) {
  const [faces, setFaces] = useState<[number, number]>([1, 1]);
  useEffect(() => {
    if (!rolling) return;
    const id = window.setInterval(() => setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 80);
    return () => window.clearInterval(id);
  }, [rolling]);
  const shown = rolling || !roll ? faces : roll;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3" style={{ transform: 'translateY(-10%)' }}>
      {shown.map((v, i) => (
        <div
          key={i}
          className="grid size-14 place-items-center rounded-2xl bg-white text-4xl text-navy shadow-[0_10px_24px_rgba(0,0,0,0.5)] sm:size-20 sm:text-6xl"
          style={{ animation: rolling ? `die-roll 0.5s ease-in-out infinite ${i * 0.1}s` : 'die-land 0.4s ease-out' }}
        >
          {DIE[v]}
        </div>
      ))}
      {!rolling && roll && (
        <div className="absolute mt-32 rounded-full bg-black/50 px-3 py-1 text-lg font-black sm:mt-44">= {roll[0] + roll[1]}</div>
      )}
    </div>
  );
}

/** Карточка клетки, на которую встал игрок: что произошло и что нажать. */
function LandingCard({
  catalog,
  paid,
  setPaid,
  dismissed,
  onDismiss,
  onOpenDeals,
}: {
  catalog: Catalog;
  paid: number | null;
  setPaid: (p: number | null) => void;
  dismissed: number | null;
  onDismiss: () => void;
  onOpenDeals: () => void;
}) {
  const g = useGame();
  const me = g.players[g.turn.current];
  if (!me) return null;
  const [a, b] = g.turn.lastRoll ?? [0, 0];

  let title = '';
  let body: React.ReactNode = null;
  let actions: React.ReactNode = null;
  let color = '#0d1b2a';

  if (me.inJail && !g.turn.rolled) {
    title = '🚫 Ты в БАНе';
    body = (
      <>
        Попытка {me.jailTurns + 1} из 3. Выброси дубль или заплати {g.settings.jailFee} $NET. Рента и трафик продолжают приходить.
      </>
    );
    actions = (
      <button className="btn-primary" onClick={() => g.payJailFee()}>
        Заплатить {g.settings.jailFee} $NET
      </button>
    );
    color = '#6c757d';
  } else if (g.turn.landed && dismissed !== g.turn.landed) {
    const cell = catalog.cells.find((c) => c.position === g.turn.landed);
    if (!cell) return null;
    const name = cellTitle(catalog, cell);
    if (me.inJail) {
      title = '👮 Под БАН!';
      body = 'Фишка отправлена в БАН. Выход — дубль, карточка или штраф в начале следующего хода.';
      color = '#e63946';
    } else if ('ref' in cell) {
      const field = findField(catalog, cell.ref);
      const own = g.ownership[cell.ref];
      color = field?.kind === 'property' ? GROUP_META[field.group].color : field?.kind === 'provider' ? '#0d1b2a' : '#6c757d';
      if (field && !own) {
        const pendingHere = g.txs.some((t) => t.status === 'pending' && t.payload.kind === 'buy' && t.payload.fieldId === field.id);
        title = name;
        body = (
          <>
            Свободно. Цена <b>{field.price} $NET</b>
            {field.kind === 'property' && <> · {GROUP_META[field.group].label}</>}
          </>
        );
        actions = pendingHere ? (
          <button className="btn-ghost" onClick={onOpenDeals}>
            Ждёт подтверждения →
          </button>
        ) : (
          <>
            <button
              className="btn-primary"
              disabled={me.money < field.price}
              onClick={() => {
                g.propose({ kind: 'buy', fieldId: field.id, fieldName: field.name, playerId: me.id, price: field.price }, me.id);
                onOpenDeals();
              }}
            >
              Купить за {field.price}
            </button>
            <button className="btn-ghost" onClick={onDismiss}>
              Пропустить
            </button>
          </>
        );
      } else if (field && own && own.owner !== me.id) {
        const owner = g.players.find((p) => p.id === own.owner);
        const ownerFields = Object.entries(g.ownership).filter(([, o]) => o.owner === own.owner).map(([id]) => id);
        let rent = 0;
        if (!own.mortgaged) {
          if (field.kind === 'property') rent = propertyRent(field, { monopoly: ownsGroup(catalog, ownerFields, field.group), level: own.level });
          else if (field.kind === 'provider') rent = providerRent(catalog, catalog.providers.filter((p) => ownerFields.includes(p.id)).length);
          else rent = utilityRent(catalog, catalog.utilities.filter((u) => ownerFields.includes(u.id)).length, a + b);
        }
        const done = paid === cell.position;
        title = name;
        body = (
          <>
            Владелец — <b style={{ color: owner?.color }}>{owner?.name}</b>.{' '}
            {own.mortgaged ? 'Поле заложено, платить не нужно.' : <>Рента <b>{rent} $NET</b>{field.kind === 'property' && own.level > 0 ? ` · ${HOSTING_LEVELS[own.level]}` : ''}</>}
          </>
        );
        actions =
          rent > 0 ? (
            <button
              className={done ? 'btn-ghost' : 'btn-danger'}
              disabled={done}
              onClick={() => {
                g.transferMoney(me.id, own.owner, rent, `рента за ${field.name}`);
                setPaid(cell.position);
              }}
            >
              {done ? 'Оплачено ✓' : `Заплатить ${rent} $NET`}
            </button>
          ) : (
            <button className="btn-ghost" onClick={onDismiss}>
              ОК
            </button>
          );
      } else if (field && own) {
        title = name;
        // Можно ли прокачать прямо отсюда: вся группа у игрока, равномерная застройка, не максимум
        const mine = Object.entries(g.ownership).filter(([, o]) => o.owner === me.id).map(([id]) => id);
        const canUpgrade =
          field.kind === 'property' &&
          !own.mortgaged &&
          own.level < MAX_LEVEL &&
          ownsGroup(catalog, mine, field.group) &&
          own.level <= Math.min(...groupMembers(catalog, field.group).map((m) => g.ownership[m.id]?.level ?? 0));
        const pendingHere = g.txs.some((t) => t.status === 'pending' && t.payload.kind === 'upgrade' && t.payload.fieldId === field.id);
        body = (
          <>
            Твоё поле{field.kind === 'property' && own.level > 0 ? ` · ${HOSTING_LEVELS[own.level]}` : ''}.
            {field.kind === 'property' && canUpgrade && (
              <>
                {' '}
                Следующий уровень — <b>{HOSTING_LEVELS[own.level + 1]}</b> за <b>{field.upgrade_cost} $NET</b>, рента станет{' '}
                <b>{propertyRent(field, { monopoly: true, level: own.level + 1 })} $NET</b>.
              </>
            )}
            {field.kind === 'property' && !canUpgrade && own.level < MAX_LEVEL && !own.mortgaged && ' Для прокачки нужна вся группа и равномерная застройка.'}
          </>
        );
        actions = (
          <>
            {field.kind === 'property' && canUpgrade && !pendingHere && (
              <button
                className="btn-primary"
                disabled={me.money < field.upgrade_cost}
                onClick={() => {
                  g.propose({ kind: 'upgrade', fieldId: field.id, fieldName: field.name, playerId: me.id, cost: field.upgrade_cost, toLevel: own.level + 1 }, me.id);
                  onOpenDeals();
                }}
              >
                🏗️ Прокачать за {field.upgrade_cost}
              </button>
            )}
            {pendingHere && (
              <button className="btn-ghost" onClick={onOpenDeals}>
                Ждёт подтверждения →
              </button>
            )}
            <button className="btn-ghost" onClick={onDismiss}>
              ОК
            </button>
          </>
        );
      }
    } else if (cell.type === 'tax') {
      const done = paid === cell.position;
      title = `💸 ${cell.name}`;
      body = (
        <>
          В банк <b>{cell.amount} $NET</b>.
        </>
      );
      color = '#adb5bd';
      actions = (
        <button
          className={done ? 'btn-ghost' : 'btn-danger'}
          disabled={done}
          onClick={() => {
            g.adjustMoney(me.id, -cell.amount, cell.name);
            setPaid(cell.position);
          }}
        >
          {done ? 'Оплачено ✓' : `Заплатить ${cell.amount} $NET`}
        </button>
      );
    } else if (cell.type === 'card') {
      const chance = cell.deck === 'chance';
      title = chance ? '🎲 Шанс' : '💼 Казна';
      body = chance ? 'Риски интернет-бизнеса. Тяни карточку.' : 'Возможности интернет-бизнеса. Тяни карточку.';
      color = chance ? '#e63946' : '#3a86ff';
      actions = (
        <Link href={cellHref(cell) ?? '/'} className="btn-primary">
          Тянуть карточку
        </Link>
      );
    } else if (cell.type === 'corner') {
      title = name;
      body =
        cell.subtype === 'start'
          ? `Бонус +${g.settings.passStartBonus} $NET уже начислен.`
          : cell.subtype === 'free_parking'
            ? 'Офлайн. Ничего не происходит.'
            : 'Просто смотришь. Ничего не происходит.';
      color = cell.subtype === 'start' ? '#00b86b' : '#6c757d';
      actions = (
        <button className="btn-ghost" onClick={onDismiss}>
          ОК
        </button>
      );
    }
  } else if (g.turn.doubles > 0 && g.turn.rolled && !me.inJail) {
    title = '🎉 Дубль!';
    body = g.turn.doubles === 2 ? 'Бросай ещё раз. Третий дубль подряд отправит в БАН.' : 'Бросай ещё раз.';
    color = '#00b86b';
  } else {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-3">
      <div
        className="pointer-events-auto w-full max-w-md rounded-2xl bg-white p-3 text-navy shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
        style={{ borderTop: `6px solid ${color}`, animation: 'sheet-up 0.3s ease-out' }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-base font-black">{title}</div>
            <div className="mt-0.5 text-sm text-navy/80">{body}</div>
          </div>
          {g.turn.doubles > 0 && g.turn.rolled && !me.inJail && title !== '🎉 Дубль!' && (
            <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">дубль</span>
          )}
        </div>
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

function PlayersList({ catalog }: { catalog: Catalog }) {
  const g = useGame();
  const ownedBy = (pid: string) => Object.entries(g.ownership).filter(([, o]) => o.owner === pid).map(([id]) => id);
  return (
    <div className="space-y-3">
      {g.players.map((p) => {
        const owned = ownedBy(p.id);
        const income = trafficIncome(catalog, owned, owned.filter((id) => g.ownership[id].mortgaged));
        const synergy = hasEcosystemSynergy(catalog, owned);
        const cell = catalog.cells.find((c) => c.position === p.position);
        const isCurrent = g.players[g.turn.current]?.id === p.id;
        return (
          <div key={p.id} className={`card space-y-2 ${isCurrent ? 'ring-2 ring-brand' : ''}`} style={{ borderTop: `6px solid ${p.color}` }}>
            <div className="flex items-baseline justify-between">
              <div className="text-lg font-bold">
                {p.name}
                {isCurrent && <span className="ml-2 text-xs font-semibold text-brand">ходит</span>}
              </div>
              {synergy && <span className="rounded bg-brand/10 px-1.5 text-xs font-semibold text-brand">экосистема +{SYNERGY_BONUS_PERCENT}%</span>}
            </div>
            <div className="text-xs text-muted">
              📍 {p.position}. {cell ? cellTitle(catalog, cell) : ''}
              {p.inJail && ' · в БАНе'}
              {p.skipTurns > 0 && ` · пропуск ${p.skipTurns}`}
              {income > 0 && ` · +${income} трафика/ход`}
            </div>
            <div className="flex gap-4">
              <div>
                <div className="text-xs uppercase text-muted">$NET</div>
                <div className={`text-2xl font-black ${p.money < 0 ? 'text-[#e63946]' : ''}`}>{p.money}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted">Трафик</div>
                <div className="text-2xl font-black">{p.traffic}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              {owned.length === 0 && <span className="text-muted">Полей пока нет</span>}
              {owned.map((id) => {
                const f = findField(catalog, id);
                const o = g.ownership[id];
                const color = f?.kind === 'property' ? GROUP_META[f.group].color : f?.kind === 'provider' ? '#0d1b2a' : '#6c757d';
                return (
                  <Link
                    key={id}
                    href={`/card/${id}/`}
                    className={`rounded border px-1.5 py-0.5 ${o.mortgaged ? 'line-through opacity-50' : ''}`}
                    style={{ borderColor: color }}
                    title={f?.kind === 'property' ? HOSTING_LEVELS[o.level] : undefined}
                  >
                    {f?.name}
                    {o.level > 0 && <sup className="ml-0.5 font-bold">{o.level}</sup>}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PendingList() {
  const g = useGame();
  const pending = g.txs.filter((t) => t.status === 'pending');
  const recent = g.txs.filter((t) => t.status !== 'pending').slice(-5).reverse();
  return (
    <div className="space-y-3">
      {pending.length === 0 && <p className="text-sm text-muted">Нет сделок, ожидающих подтверждения. Покупка, прокачка и передача поля попадают сюда и проходят большинством голосов — как транзакция в блокчейне.</p>}
      {pending.map((tx) => {
        const yes = Object.values(tx.votes).filter(Boolean).length;
        return (
          <div key={tx.id} className="card space-y-2 border-2 border-brand">
            <div className="font-semibold">{describeTx(tx.payload, g.players)}</div>
            <div className="text-xs text-muted">
              Подтвердили {yes} из {g.players.length}. Нужно простое большинство.
            </div>
            <div className="flex flex-wrap gap-2">
              {g.players.map((p) => {
                const v = tx.votes[p.id];
                if (v !== undefined)
                  return (
                    <span key={p.id} className="rounded-full bg-navy/5 px-2 py-1 text-xs" style={{ borderLeft: `4px solid ${p.color}` }}>
                      {p.name}: {v ? '✅' : '❌'}
                    </span>
                  );
                return (
                  <span key={p.id} className="flex items-center gap-1 rounded-full bg-navy/5 px-2 py-1 text-xs" style={{ borderLeft: `4px solid ${p.color}` }}>
                    {p.name}
                    <button className="btn-primary px-2 py-0.5 text-xs" onClick={() => g.vote(tx.id, p.id, true)}>
                      Да
                    </button>
                    <button className="btn-danger px-2 py-0.5 text-xs" onClick={() => g.vote(tx.id, p.id, false)}>
                      Нет
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
      {recent.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-muted">Недавние</div>
          <ul className="space-y-1 text-sm">
            {recent.map((tx) => (
              <li key={tx.id} className="text-navy/70">
                {tx.status === 'approved' ? '✅' : '❌'} {describeTx(tx.payload, g.players)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FixForm({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const [player, setPlayer] = useState('');
  const [money, setMoney] = useState(0);
  const [traffic, setTraffic] = useState(0);
  const [reason, setReason] = useState('ручная коррекция');
  return (
    <Form title="✏️ Коррекция" hint="Если приложение и стол разошлись: начислить или списать деньги и трафик вручную (со знаком).">
      <PlayerSelect label="Игрок" value={player} onChange={setPlayer} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-muted">± $NET</span>
          <input className="input mt-1" type="number" value={money} onChange={(e) => setMoney(Number(e.target.value))} />
        </label>
        <label className="text-sm">
          <span className="text-muted">± трафик</span>
          <input className="input mt-1" type="number" value={traffic} onChange={(e) => setTraffic(Number(e.target.value))} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-muted">Причина</span>
        <input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button
        className="btn-primary w-full"
        disabled={!player || (money === 0 && traffic === 0)}
        onClick={() => {
          if (money !== 0) g.adjustMoney(player, money, reason);
          if (traffic !== 0) g.adjustTraffic(player, traffic, reason);
          onDone();
        }}
      >
        Применить
      </button>
    </Form>
  );
}

/* ---------------------------------------------------------------- Forms */

function PlayerSelect({ value, onChange, label, exclude }: { value: string; onChange: (v: string) => void; label: string; exclude?: string }) {
  const players = useGame((s) => s.players);
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <select className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {players
          .filter((p) => p.id !== exclude)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>
    </label>
  );
}

function FieldSelect({ value, onChange, label, fields }: { value: string; onChange: (v: string) => void; label: string; fields: Field[] }) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <select className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name} · {f.price} $NET
          </option>
        ))}
      </select>
    </label>
  );
}

function Form({ children, title, hint }: { children: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="card space-y-3">
      <div className="font-semibold">{title}</div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {children}
    </div>
  );
}

function RentForm({ catalog, onDone }: { catalog: Catalog; onDone: () => void }) {
  const g = useGame();
  const [payer, setPayer] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [dice, setDice] = useState(7);

  const fields = allFields(catalog).filter((f) => g.ownership[f.id] && g.ownership[f.id].owner !== payer && !g.ownership[f.id].mortgaged);
  const field = fieldId ? findField(catalog, fieldId) : undefined;
  const own = fieldId ? g.ownership[fieldId] : undefined;

  let rent = 0;
  let explain = '';
  if (field && own) {
    const ownerFields = Object.entries(g.ownership).filter(([, o]) => o.owner === own.owner).map(([id]) => id);
    if (field.kind === 'property') {
      const monopoly = ownsGroup(catalog, ownerFields, field.group);
      rent = propertyRent(field, { monopoly, level: own.level });
      explain = own.level > 0 ? HOSTING_LEVELS[own.level] : monopoly ? 'вся группа у владельца — рента ×2' : 'базовая рента';
    } else if (field.kind === 'provider') {
      const n = catalog.providers.filter((p) => ownerFields.includes(p.id)).length;
      rent = providerRent(catalog, n);
      explain = `${n} провайдер(а) у владельца`;
    } else {
      const n = catalog.utilities.filter((u) => ownerFields.includes(u.id)).length;
      rent = utilityRent(catalog, n, dice);
      explain = `бросок ${dice} × ${catalog.utilityMultiplier[n]}`;
    }
  }

  return (
    <Form title="🏠 Оплата ренты" hint="Рента считается автоматически с учётом монополии и прокачки владельца.">
      <PlayerSelect label="Кто платит" value={payer} onChange={setPayer} />
      <FieldSelect label="На чьё поле попал" value={fieldId} onChange={setFieldId} fields={fields} />
      {field?.kind === 'utility' && (
        <label className="block text-sm">
          <span className="text-muted">Выпало на кубиках: {dice}</span>
          <input type="range" min={2} max={12} value={dice} onChange={(e) => setDice(Number(e.target.value))} className="w-full" />
        </label>
      )}
      {field && own && (
        <div className="rounded-lg bg-navy p-3 text-white">
          <div className="text-xs opacity-70">{explain}</div>
          <div className="text-2xl font-black">{rent} $NET</div>
          <div className="text-xs opacity-70">владелец: {g.players.find((p) => p.id === own.owner)?.name}</div>
        </div>
      )}
      <button
        className="btn-primary w-full"
        disabled={!payer || !field || !own}
        onClick={() => {
          if (!field || !own) return;
          g.transferMoney(payer, own.owner, rent, `рента за ${field.name}`);
          onDone();
        }}
      >
        Оплатить
      </button>
    </Form>
  );
}

function BuyForm({ catalog, onDone }: { catalog: Catalog; onDone: () => void }) {
  const g = useGame();
  // По умолчанию — текущий игрок и клетка, на которую он только что встал (если она свободна)
  const landedCell = g.turn.landed ? catalog.cells.find((c) => c.position === g.turn.landed) : undefined;
  const landedFree = landedCell && 'ref' in landedCell && !g.ownership[landedCell.ref] ? landedCell.ref : '';
  const [player, setPlayer] = useState(g.players[g.turn.current]?.id ?? '');
  const [fieldId, setFieldId] = useState(landedFree);
  const [price, setPrice] = useState<number | null>(null);
  const free = allFields(catalog).filter((f) => !g.ownership[f.id]);
  const field = fieldId ? findField(catalog, fieldId) : undefined;
  const finalPrice = price ?? field?.price ?? 0;

  return (
    <Form title="🛒 Покупка поля" hint="Требует подтверждения большинством игроков. Цену можно изменить — например, после аукциона.">
      <PlayerSelect label="Покупатель" value={player} onChange={setPlayer} />
      <FieldSelect label="Свободное поле" value={fieldId} onChange={(v) => { setFieldId(v); setPrice(null); }} fields={free} />
      {field && (
        <label className="block text-sm">
          <span className="text-muted">Цена</span>
          <input className="input mt-1" type="number" value={finalPrice} onChange={(e) => setPrice(Number(e.target.value))} />
        </label>
      )}
      <button
        className="btn-primary w-full"
        disabled={!player || !field}
        onClick={() => {
          if (!field) return;
          g.propose({ kind: 'buy', fieldId: field.id, fieldName: field.name, playerId: player, price: finalPrice }, player);
          onDone();
        }}
      >
        Отправить на подтверждение
      </button>
    </Form>
  );
}

function UpgradeForm({ catalog, onDone }: { catalog: Catalog; onDone: () => void }) {
  const g = useGame();
  const [player, setPlayer] = useState('');
  const [fieldId, setFieldId] = useState('');

  const owned = Object.entries(g.ownership).filter(([, o]) => o.owner === player).map(([id]) => id);
  // Можно прокачивать только при полной группе и равномерно (не выше минимального уровня группы +1).
  const upgradable = catalog.properties.filter((p) => {
    const o = g.ownership[p.id];
    if (!o || o.owner !== player || o.mortgaged || o.level >= MAX_LEVEL) return false;
    if (!ownsGroup(catalog, owned, p.group)) return false;
    const minLevel = Math.min(...groupMembers(catalog, p.group).map((m) => g.ownership[m.id]?.level ?? 0));
    return o.level <= minLevel;
  });
  const field = fieldId ? (findField(catalog, fieldId) as Property | undefined) : undefined;
  const own = fieldId ? g.ownership[fieldId] : undefined;

  return (
    <Form title="🏗️ Прокачка хостинга" hint="Только при полной группе и равномерно по всем полям группы. Требует подтверждения.">
      <PlayerSelect label="Игрок" value={player} onChange={(v) => { setPlayer(v); setFieldId(''); }} />
      {player && upgradable.length === 0 && <p className="text-sm text-muted">Нет полей, доступных для прокачки: нужна вся группа и равномерная застройка.</p>}
      <FieldSelect label="Поле" value={fieldId} onChange={setFieldId} fields={upgradable} />
      {field && own && (
        <div className="rounded-lg bg-navy p-3 text-sm text-white">
          {HOSTING_LEVELS[own.level]} → <b>{HOSTING_LEVELS[own.level + 1]}</b> за <b>{field.upgrade_cost} $NET</b>. Рента станет{' '}
          <b>{propertyRent(field, { monopoly: true, level: own.level + 1 })} $NET</b>.
        </div>
      )}
      <button
        className="btn-primary w-full"
        disabled={!field || !own}
        onClick={() => {
          if (!field || !own) return;
          g.propose({ kind: 'upgrade', fieldId: field.id, fieldName: field.name, playerId: player, cost: field.upgrade_cost, toLevel: own.level + 1 }, player);
          onDone();
        }}
      >
        Отправить на подтверждение
      </button>
    </Form>
  );
}

function ConvertForm({ catalog, onDone }: { catalog: Catalog; onDone: () => void }) {
  const g = useGame();
  const [player, setPlayer] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [batches, setBatches] = useState(1);

  const p = g.players.find((x) => x.id === player);
  const owned = Object.entries(g.ownership).filter(([, o]) => o.owner === player && !o.mortgaged).map(([id]) => id);
  const converters = catalog.properties.filter((pr) => owned.includes(pr.id) && isConverter(pr));
  const field = fieldId ? (findField(catalog, fieldId) as Property | undefined) : undefined;
  const synergy = hasEcosystemSynergy(catalog, owned);
  const maxBatches = field && p ? Math.floor(p.traffic / (field.traffic.rate_in ?? 10)) : 0;
  const result = useMemo(
    () => (field && p ? convertTraffic(field, Math.min(batches, maxBatches) * (field.traffic.rate_in ?? 10), synergy) : null),
    [field, p, batches, maxBatches, synergy],
  );
  const needsConsensus = (result?.moneyOut ?? 0) > CONSENSUS_CONVERT_THRESHOLD;

  return (
    <Form title="💱 Конвертация трафика" hint={`Маркетплейсы и стриминг превращают трафик в $NET. Суммы больше ${CONSENSUS_CONVERT_THRESHOLD} $NET требуют подтверждения.`}>
      <PlayerSelect label="Игрок" value={player} onChange={(v) => { setPlayer(v); setFieldId(''); }} />
      {player && converters.length === 0 && <p className="text-sm text-muted">У игрока нет конвертеров (маркетплейс, стриминг, видеогигант).</p>}
      <FieldSelect label="Конвертер" value={fieldId} onChange={setFieldId} fields={converters} />
      {field && p && (
        <>
          <label className="block text-sm">
            <span className="text-muted">
              Пакетов по {field.traffic.rate_in} трафика: {Math.min(batches, maxBatches)} (доступно {maxBatches}, трафика {p.traffic})
            </span>
            <input type="range" min={0} max={Math.max(0, maxBatches)} value={Math.min(batches, maxBatches)} onChange={(e) => setBatches(Number(e.target.value))} className="w-full" />
          </label>
          {result && (
            <div className="rounded-lg bg-navy p-3 text-white">
              <div className="text-xs opacity-70">
                {field.traffic.rate_in} → {field.traffic.rate_out} $NET{synergy ? ` · синергия экосистемы +${SYNERGY_BONUS_PERCENT}%` : ''}
              </div>
              <div className="text-2xl font-black">
                −{result.trafficSpent} трафика → +{result.moneyOut} $NET
              </div>
              {needsConsensus && <div className="text-xs opacity-70">крупная сумма — нужно подтверждение</div>}
            </div>
          )}
        </>
      )}
      <button
        className="btn-primary w-full"
        disabled={!field || !result || result.batches === 0}
        onClick={() => {
          if (!field || !result) return;
          const payload: TxPayload = { kind: 'convert', fieldId: field.id, fieldName: field.name, playerId: player, trafficIn: result.trafficSpent, moneyOut: result.moneyOut };
          if (needsConsensus) g.propose(payload, player);
          else g.applyDirect(payload);
          onDone();
        }}
      >
        {needsConsensus ? 'Отправить на подтверждение' : 'Конвертировать'}
      </button>
    </Form>
  );
}

function TradeForm({ onDone }: { onDone: () => void }) {
  const g = useGame();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [money, setMoney] = useState(0);
  const [traffic, setTraffic] = useState(0);
  const [reason, setReason] = useState('сделка');

  return (
    <Form title="🤝 Сделка между игроками" hint="Перевод денег и/или трафика. Для обмена «трафик за деньги» укажите обе суммы — деньги пойдут в одну сторону, трафик в другую.">
      <div className="grid grid-cols-2 gap-3">
        <PlayerSelect label="От кого ($NET)" value={from} onChange={setFrom} exclude={to} />
        <PlayerSelect label="Кому ($NET)" value={to} onChange={setTo} exclude={from} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-muted">$NET (от → кому)</span>
          <input className="input mt-1" type="number" min={0} value={money} onChange={(e) => setMoney(Number(e.target.value))} />
        </label>
        <label className="text-sm">
          <span className="text-muted">Трафик (кому → от)</span>
          <input className="input mt-1" type="number" min={0} value={traffic} onChange={(e) => setTraffic(Number(e.target.value))} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-muted">Комментарий</span>
        <input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button
        className="btn-primary w-full"
        disabled={!from || !to || (money <= 0 && traffic <= 0)}
        onClick={() => {
          if (money > 0) g.transferMoney(from, to, money, reason);
          if (traffic > 0) {
            g.adjustTraffic(to, -traffic, reason);
            g.adjustTraffic(from, traffic, reason);
          }
          onDone();
        }}
      >
        Провести
      </button>
    </Form>
  );
}

function TransferForm({ catalog, onDone }: { catalog: Catalog; onDone: () => void }) {
  const g = useGame();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [price, setPrice] = useState(0);
  const fields = allFields(catalog).filter((f) => g.ownership[f.id]?.owner === from);
  const field = fieldId ? findField(catalog, fieldId) : undefined;

  return (
    <Form title="📜 Продажа поля другому игроку" hint="Требует подтверждения большинством.">
      <div className="grid grid-cols-2 gap-3">
        <PlayerSelect label="Продавец" value={from} onChange={(v) => { setFrom(v); setFieldId(''); }} exclude={to} />
        <PlayerSelect label="Покупатель" value={to} onChange={setTo} exclude={from} />
      </div>
      <FieldSelect label="Поле" value={fieldId} onChange={setFieldId} fields={fields} />
      <label className="block text-sm">
        <span className="text-muted">Цена, $NET</span>
        <input className="input mt-1" type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
      </label>
      <button
        className="btn-primary w-full"
        disabled={!from || !to || !field}
        onClick={() => {
          if (!field) return;
          g.propose({ kind: 'transfer', fieldId: field.id, fieldName: field.name, from, to, price }, from);
          onDone();
        }}
      >
        Отправить на подтверждение
      </button>
    </Form>
  );
}

function MortgageForm({ catalog, onDone }: { catalog: Catalog; onDone: () => void }) {
  const g = useGame();
  const [fieldId, setFieldId] = useState('');
  const fields = allFields(catalog).filter((f) => g.ownership[f.id]);
  const field = fieldId ? findField(catalog, fieldId) : undefined;
  const own = fieldId ? g.ownership[fieldId] : undefined;
  const redeem = field ? Math.round(field.mortgage * 1.1) : 0;

  return (
    <Form title="🏦 Залог поля" hint="Заложенное поле не приносит ренту и трафик. Выкуп — залог + 10%.">
      <FieldSelect label="Поле" value={fieldId} onChange={setFieldId} fields={fields} />
      {field && own && (
        <button
          className="btn-primary w-full"
          onClick={() => {
            g.setMortgaged(field.id, !own.mortgaged, own.mortgaged ? redeem : field.mortgage);
            onDone();
          }}
        >
          {own.mortgaged ? `Выкупить за ${redeem} $NET` : `Заложить и получить ${field.mortgage} $NET`}
        </button>
      )}
    </Form>
  );
}
