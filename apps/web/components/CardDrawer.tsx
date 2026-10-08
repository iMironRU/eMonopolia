'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Card, Catalog } from '@/lib/types';
import { useGame, type BoardRules } from '@/lib/store';
import { propertyRent, providerRent, utilityRent, ownsGroup, findField } from '@/lib/rules';

const DECK_META = {
  chance: { title: 'Шанс', subtitle: 'Риски интернет-бизнеса', color: '#e63946', icon: '🎲' },
  chest: { title: 'Общественная казна', subtitle: 'Возможности интернет-бизнеса', color: '#3a86ff', icon: '💼' },
} as const;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Колода карточек: тасуется в localStorage, тянется по одной, как физическая пачка.
 * Если идёт партия — карточку можно применить к игроку одним нажатием.
 */
export function CardDrawer({ deck, catalog }: { deck: 'chance' | 'chest'; catalog: Catalog }) {
  const cards = catalog[deck];
  const meta = DECK_META[deck];
  const corner = (sub: string) => catalog.cells.find((c) => c.type === 'corner' && c.subtype === sub)?.position;
  const board: BoardRules = {
    size: catalog.board.size,
    startPosition: catalog.board.start_position,
    jailPosition: corner('jail') ?? 11,
    goToJailPosition: corner('go_to_jail') ?? 31,
  };
  const storageKey = `emonopolia-deck-${deck}`;
  const [order, setOrder] = useState<string[] | null>(null);
  const [current, setCurrent] = useState<Card | null>(null);
  const [applied, setApplied] = useState(false);
  const [playerId, setPlayerId] = useState('');

  const started = useGame((s) => s.started);
  const players = useGame((s) => s.players);
  const ownership = useGame((s) => s.ownership);
  const adjustMoney = useGame((s) => s.adjustMoney);
  const adjustTraffic = useGame((s) => s.adjustTraffic);
  const collectFromEach = useGame((s) => s.collectFromEach);
  const moveTo = useGame((s) => s.moveTo);
  const sendToJail = useGame((s) => s.sendToJail);
  const addSkipTurn = useGame((s) => s.addSkipTurn);
  const transferMoney = useGame((s) => s.transferMoney);
  const turn = useGame((s) => s.turn);

  // По умолчанию карточку применяем к тому, кто ходит
  useEffect(() => {
    const cur = players[turn.current];
    if (cur) setPlayerId(cur.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn.current, players.length]);

  /** Ближайшая по ходу клетка нужной категории (datacenter → коммуналка, search_engine → поисковик). */
  function nearest(from: number, target: string): number | null {
    for (let step = 1; step <= board.size; step++) {
      const pos = ((from - 1 + step) % board.size) + 1;
      const cell = catalog.cells.find((c) => c.position === pos);
      if (!cell || !('ref' in cell)) continue;
      const f = findField(catalog, cell.ref);
      if (!f) continue;
      if ((f.kind === 'utility' || f.kind === 'property') && f.category === target) return pos;
    }
    return null;
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const parsed = saved ? (JSON.parse(saved) as string[]) : null;
      setOrder(parsed && parsed.length ? parsed : shuffle(cards).map((c) => c.id));
    } catch {
      setOrder(shuffle(cards).map((c) => c.id));
    }
  }, [cards, storageKey]);

  useEffect(() => {
    if (players.length && !playerId) setPlayerId(players[0].id);
  }, [players, playerId]);

  function draw() {
    if (!order) return;
    let next = order;
    if (next.length === 0) next = shuffle(cards).map((c) => c.id);
    const [id, ...rest] = next;
    const card = cards.find((c) => c.id === id) ?? null;
    setCurrent(card);
    setApplied(false);
    setOrder(rest);
    try {
      localStorage.setItem(storageKey, JSON.stringify(rest));
    } catch {
      /* localStorage недоступен — колода просто не сохранится */
    }
  }

  function reshuffle() {
    const fresh = shuffle(cards).map((c) => c.id);
    setOrder(fresh);
    setCurrent(null);
    try {
      localStorage.setItem(storageKey, JSON.stringify(fresh));
    } catch {
      /* ignore */
    }
  }

  function apply() {
    if (!current || !playerId) return;
    const a = current.action;
    const reason = `${meta.title}: ${current.title}`;
    switch (a.type) {
      case 'pay_bank':
        adjustMoney(playerId, -(a.amount ?? 0), reason);
        break;
      case 'receive_bank':
        adjustMoney(playerId, a.amount ?? 0, reason);
        break;
      case 'gain_traffic':
        adjustTraffic(playerId, a.amount ?? 0, reason);
        break;
      case 'lose_traffic':
        adjustTraffic(playerId, -(a.amount ?? 0), reason);
        break;
      case 'collect_from_each':
        collectFromEach(playerId, a.amount ?? 0, reason);
        break;
      case 'pay_per_hosting': {
        const hostings = Object.values(ownership)
          .filter((o) => o.owner === playerId)
          .reduce((sum, o) => sum + o.level, 0);
        adjustMoney(playerId, -(a.amount ?? 0) * hostings, `${reason} (${hostings} ур. хостинга)`);
        break;
      }
      case 'move_to':
        if (a.target === 'start') moveTo(playerId, board.startPosition, board, true, reason);
        break;
      case 'go_to_jail':
        sendToJail(playerId, board, reason);
        break;
      case 'skip_turn':
        addSkipTurn(playerId, a.count ?? 1, reason);
        break;
      case 'move_to_nearest': {
        const me = players.find((p) => p.id === playerId);
        const pos = me ? nearest(me.position, a.target ?? '') : null;
        if (!pos) return;
        moveTo(playerId, pos, board, true, reason);
        // Если поле чужое — сразу считаем ренту с множителем карточки
        const cell = catalog.cells.find((c) => c.position === pos);
        const own = cell && 'ref' in cell ? ownership[cell.ref] : undefined;
        const field = cell && 'ref' in cell ? findField(catalog, cell.ref) : undefined;
        if (own && field && own.owner !== playerId && !own.mortgaged) {
          const ownerFields = Object.entries(ownership).filter(([, o]) => o.owner === own.owner).map(([id]) => id);
          let rent = 0;
          if (field.kind === 'property') rent = propertyRent(field, { monopoly: ownsGroup(catalog, ownerFields, field.group), level: own.level });
          else if (field.kind === 'provider') rent = providerRent(catalog, catalog.providers.filter((p) => ownerFields.includes(p.id)).length);
          else {
            const [x, y] = turn.lastRoll ?? [3, 4];
            rent = utilityRent(catalog, catalog.utilities.filter((u) => ownerFields.includes(u.id)).length, x + y);
          }
          rent *= a.multiplier ?? 1;
          transferMoney(playerId, own.owner, rent, `${reason} — рента${a.multiplier ? ` ×${a.multiplier}` : ''} за ${field.name}`);
        }
        break;
      }
      default:
        return; // double_next_rent — отслеживается вручную
    }
    setApplied(true);
  }

  const auto = current && current.action.type !== 'double_next_rent';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-5 text-white" style={{ background: meta.color }}>
        <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{meta.subtitle}</div>
        <h1 className="text-3xl font-black">
          {meta.icon} {meta.title}
        </h1>
        <div className="mt-1 text-sm opacity-80">
          В колоде осталось: {order?.length ?? cards.length} из {cards.length}
        </div>
      </div>

      <div className="flex gap-2">
        <button className="btn-dark flex-1" onClick={draw} disabled={!order}>
          Тянуть карточку
        </button>
        <button className="btn-ghost" onClick={reshuffle}>
          Перетасовать
        </button>
      </div>

      {current && (
        <div className="card space-y-3 border-2" style={{ borderColor: meta.color }}>
          <div className="text-xs uppercase tracking-wider text-muted">{meta.title}</div>
          <div className="text-2xl font-black">{current.title}</div>
          <p className="text-lg">{current.text}</p>

          {started && players.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-navy/10 pt-3">
              {applied && (
                <Link href="/game/" className="btn-ghost w-full">
                  ← Вернуться к партии
                </Link>
              )}
              <select className="input w-auto flex-1" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {auto ? (
                <button className="btn-primary" onClick={apply} disabled={applied}>
                  {applied ? 'Применено ✓' : 'Применить к игроку'}
                </button>
              ) : (
                <span className="text-sm text-muted">Запомните: следующая полученная рента удваивается.</span>
              )}
            </div>
          )}
        </div>
      )}

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">Все карточки колоды ({cards.length})</summary>
        <ul className="mt-2 space-y-1 text-sm">
          {cards.map((c) => (
            <li key={c.id}>
              <b>{c.title}.</b> {c.text}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
