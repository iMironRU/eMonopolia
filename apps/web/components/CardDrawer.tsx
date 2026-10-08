'use client';
import { useEffect, useState } from 'react';
import type { Card } from '@/lib/types';
import { useGame } from '@/lib/store';

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
export function CardDrawer({ deck, cards }: { deck: 'chance' | 'chest'; cards: Card[] }) {
  const meta = DECK_META[deck];
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
        if (a.target === 'start') adjustMoney(playerId, 200, reason);
        break;
      default:
        return; // ручные действия: БАН, пропуск хода, переход на поле
    }
    setApplied(true);
  }

  const auto = current && !['go_to_jail', 'move_to_nearest', 'skip_turn', 'double_next_rent'].includes(current.action.type);

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
                <span className="text-sm text-muted">Выполните действие вручную на доске.</span>
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
