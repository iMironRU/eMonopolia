'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
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
import { Board } from './Board';
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
  { id: 'convert', label: 'Конвертировать трафик', icon: '💱' },
  { id: 'trade', label: 'Сделка между игроками', icon: '🤝' },
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

/* ---------------------------------------------------------------- Table */

function Table({ catalog }: { catalog: Catalog }) {
  const g = useGame();
  const [action, setAction] = useState<Action | null>(null);
  const pending = g.txs.filter((t) => t.status === 'pending');

  const ownedBy = (pid: string) => Object.entries(g.ownership).filter(([, o]) => o.owner === pid).map(([id]) => id);
  const mortgagedOf = (pid: string) => ownedBy(pid).filter((id) => g.ownership[id].mortgaged);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Партия</h1>
        <button
          className="btn-ghost text-xs"
          onClick={() => {
            if (confirm('Завершить партию и стереть состояние?')) g.reset();
          }}
        >
          Завершить
        </button>
      </div>

      <Board
        catalog={catalog}
        tokens={g.players.map((p) => ({ id: p.id, name: p.name, color: p.color, position: p.position, inJail: p.inJail }))}
        highlight={g.turn.landed}
        ownership={Object.fromEntries(Object.entries(g.ownership).map(([id, o]) => [id, g.players.find((p) => p.id === o.owner)?.color ?? '#999']))}
      />

      <TurnPanel catalog={catalog} openAction={setAction} />

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">🪙 Ожидают подтверждения ({pending.length})</h2>
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
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        {g.players.map((p) => {
          const owned = ownedBy(p.id);
          const income = trafficIncome(catalog, owned, mortgagedOf(p.id));
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
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">Действия</h2>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <button key={a.id} className={action === a.id ? 'btn-dark' : 'btn-ghost'} onClick={() => setAction(action === a.id ? null : a.id)}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
        {action === 'rent' && <RentForm catalog={catalog} onDone={() => setAction(null)} />}
        {action === 'buy' && <BuyForm catalog={catalog} onDone={() => setAction(null)} />}
        {action === 'upgrade' && <UpgradeForm catalog={catalog} onDone={() => setAction(null)} />}
        {action === 'convert' && <ConvertForm catalog={catalog} onDone={() => setAction(null)} />}
        {action === 'trade' && <TradeForm onDone={() => setAction(null)} />}
        {action === 'transfer' && <TransferForm catalog={catalog} onDone={() => setAction(null)} />}
        {action === 'mortgage' && <MortgageForm catalog={catalog} onDone={() => setAction(null)} />}
        {action === 'fix' && <FixForm onDone={() => setAction(null)} />}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Журнал</h2>
        <ul className="card max-h-72 space-y-1 overflow-y-auto text-sm">
          {g.log.map((e) => (
            <li key={e.id} className="border-b border-navy/5 py-1 last:border-0">
              <span className="mr-2 text-xs text-muted">{new Date(e.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
              {e.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** Панель текущего хода: бросок, что выпало, подсказка по клетке, конец хода. */
function TurnPanel({ catalog, openAction }: { catalog: Catalog; openAction: (a: Action) => void }) {
  const g = useGame();
  const [paid, setPaid] = useState<number | null>(null); // клетка, за которую уже заплатили в этом ходу
  const me = g.players[g.turn.current];
  if (!me) return null;
  const rules = boardRules(catalog);
  const owned = Object.entries(g.ownership).filter(([, o]) => o.owner === me.id).map(([id]) => id);
  const mortgaged = owned.filter((id) => g.ownership[id].mortgaged);
  const income = trafficIncome(catalog, owned, mortgaged);
  const canRoll = !g.turn.rolled || (g.turn.doubles > 0 && !me.inJail);
  const landedCell = g.turn.landed ? catalog.cells.find((c) => c.position === g.turn.landed) : undefined;
  const [a, b] = g.turn.lastRoll ?? [0, 0];

  // Что делать на клетке, куда встал игрок
  let landing: React.ReactNode = null;
  if (landedCell && !me.inJail) {
    const title = cellTitle(catalog, landedCell);
    const href = cellHref(landedCell);
    if ('ref' in landedCell) {
      const field = findField(catalog, landedCell.ref);
      const own = g.ownership[landedCell.ref];
      if (field && !own) {
        landing = (
          <>
            <span>
              <b>{title}</b> свободно — {field.price} $NET.
            </span>
            <button className="btn-primary px-2 py-1 text-xs" onClick={() => openAction('buy')}>
              Купить
            </button>
          </>
        );
      } else if (field && own && own.owner !== me.id) {
        const owner = g.players.find((p) => p.id === own.owner);
        const ownerFields = Object.entries(g.ownership).filter(([, o]) => o.owner === own.owner).map(([id]) => id);
        let rent = 0;
        if (own.mortgaged) rent = 0;
        else if (field.kind === 'property') rent = propertyRent(field, { monopoly: ownsGroup(catalog, ownerFields, field.group), level: own.level });
        else if (field.kind === 'provider') rent = providerRent(catalog, catalog.providers.filter((p) => ownerFields.includes(p.id)).length);
        else rent = utilityRent(catalog, catalog.utilities.filter((u) => ownerFields.includes(u.id)).length, a + b);
        const done = paid === landedCell.position;
        landing = (
          <>
            <span>
              <b>{title}</b> принадлежит {owner?.name}. Рента: <b>{rent} $NET</b>
              {own.mortgaged && ' (заложено — платить не нужно)'}
            </span>
            {rent > 0 && (
              <button
                className="btn-primary px-2 py-1 text-xs"
                disabled={done}
                onClick={() => {
                  g.transferMoney(me.id, own.owner, rent, `рента за ${field.name}`);
                  setPaid(landedCell.position);
                }}
              >
                {done ? 'Оплачено ✓' : 'Заплатить'}
              </button>
            )}
          </>
        );
      } else {
        landing = (
          <span>
            <b>{title}</b> — твоё поле.
          </span>
        );
      }
    } else if (landedCell.type === 'tax') {
      const done = paid === landedCell.position;
      landing = (
        <>
          <span>
            <b>{landedCell.name}</b>: {landedCell.amount} $NET в банк.
          </span>
          <button
            className="btn-primary px-2 py-1 text-xs"
            disabled={done}
            onClick={() => {
              g.adjustMoney(me.id, -landedCell.amount, landedCell.name);
              setPaid(landedCell.position);
            }}
          >
            {done ? 'Оплачено ✓' : 'Заплатить'}
          </button>
        </>
      );
    } else if (landedCell.type === 'card') {
      landing = (
        <>
          <span>
            <b>{title}</b> — тяни карточку.
          </span>
          {href && (
            <Link href={href} className="btn-primary px-2 py-1 text-xs">
              Тянуть
            </Link>
          )}
        </>
      );
    } else if (landedCell.type === 'corner') {
      landing = <span>{landedCell.subtype === 'start' ? 'СТАРТ. Бонус уже начислен.' : landedCell.subtype === 'free_parking' ? 'Офлайн — ничего не происходит.' : title}</span>;
    }
  }

  return (
    <section className="card space-y-3 border-2" style={{ borderColor: me.color }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted">Ходит</div>
          <div className="text-xl font-black">{me.name}</div>
        </div>
        {g.turn.lastRoll && (
          <div className="text-4xl leading-none" title={`${a}+${b}=${a + b}`}>
            {DIE[a]}
            {DIE[b]} <span className="align-middle text-base font-bold">= {a + b}</span>
          </div>
        )}
      </div>

      {me.inJail && !g.turn.rolled && (
        <div className="rounded-lg bg-navy/5 p-2 text-sm">
          🚫 В БАНе (попытка {me.jailTurns + 1}/3). Выброси дубль или заплати {g.settings.jailFee} $NET. Рента и трафик продолжают приходить.
        </div>
      )}
      {g.turn.doubles > 0 && !me.inJail && <div className="text-sm font-semibold text-brand">Дубль! Бросай ещё раз. {g.turn.doubles === 2 && 'Третий дубль подряд отправит в БАН.'}</div>}

      {landing && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-navy/5 p-2 text-sm">{landing}</div>}

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-dark flex-1"
          disabled={!canRoll}
          onClick={() => {
            setPaid(null);
            g.rollDice(rules, income);
          }}
        >
          🎲 Бросить кубики
          {!g.turn.rolled && income > 0 && <span className="ml-1 text-xs opacity-70">(+{income} трафика)</span>}
        </button>
        {me.inJail && !g.turn.rolled && (
          <button className="btn-ghost" onClick={() => g.payJailFee()}>
            Заплатить {g.settings.jailFee} $NET
          </button>
        )}
        <button
          className="btn-primary"
          disabled={!g.turn.rolled || (g.turn.doubles > 0 && !me.inJail)}
          onClick={() => {
            setPaid(null);
            g.endTurn();
          }}
        >
          Конец хода →
        </button>
      </div>
    </section>
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
