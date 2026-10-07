'use client';
// Состояние партии. Хранится в localStorage (MVP без бэкенда).
// Каталог (цены, рента) сюда не попадает — он статический и приходит пропсами.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MAX_LEVEL } from './rules';

export interface Player {
  id: string;
  name: string;
  color: string;
  money: number;
  traffic: number;
}

export interface Ownership {
  owner: string;
  /** 0 — без прокачки, 1–4 — хостинг, 5 — датацентр */
  level: number;
  mortgaged: boolean;
}

export type TxPayload =
  | { kind: 'buy'; fieldId: string; fieldName: string; playerId: string; price: number }
  | { kind: 'upgrade'; fieldId: string; fieldName: string; playerId: string; cost: number; toLevel: number }
  | { kind: 'transfer'; fieldId: string; fieldName: string; from: string; to: string; price: number }
  | { kind: 'convert'; fieldId: string; fieldName: string; playerId: string; trafficIn: number; moneyOut: number };

export interface Tx {
  id: string;
  payload: TxPayload;
  initiator: string;
  votes: Record<string, boolean>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export interface LogEntry {
  id: string;
  ts: number;
  text: string;
}

export interface Settings {
  startMoney: number;
  passStartBonus: number;
  jailFee: number;
}

interface GameState {
  started: boolean;
  settings: Settings;
  players: Player[];
  ownership: Record<string, Ownership>;
  txs: Tx[];
  log: LogEntry[];

  setup: (players: { name: string; color: string }[], settings: Settings) => void;
  reset: () => void;
  adjustMoney: (playerId: string, delta: number, reason: string) => void;
  adjustTraffic: (playerId: string, delta: number, reason: string) => void;
  transferMoney: (from: string, to: string, amount: number, reason: string) => void;
  collectFromEach: (to: string, amount: number, reason: string) => void;
  setMortgaged: (fieldId: string, mortgaged: boolean, amount: number) => void;
  /** Прямое действие без консенсуса (например, мелкая конвертация). */
  applyDirect: (payload: TxPayload) => void;
  propose: (payload: TxPayload, initiator: string) => void;
  vote: (txId: string, playerId: string, approve: boolean) => void;
  dismissTx: (txId: string) => void;
}

export const PLAYER_COLORS = ['#e63946', '#3a86ff', '#ffc107', '#00b86b', '#d63384', '#fd7e14'];

const DEFAULT_SETTINGS: Settings = { startMoney: 1500, passStartBonus: 200, jailFee: 50 };

const uid = () => Math.random().toString(36).slice(2, 10);

export function describeTx(p: TxPayload, players: Player[]): string {
  const name = (id: string) => players.find((x) => x.id === id)?.name ?? '?';
  switch (p.kind) {
    case 'buy':
      return `${name(p.playerId)} покупает ${p.fieldName} за ${p.price} $NET`;
    case 'upgrade':
      return `${name(p.playerId)} прокачивает ${p.fieldName} до уровня ${p.toLevel} за ${p.cost} $NET`;
    case 'transfer':
      return `${name(p.from)} передаёт ${p.fieldName} → ${name(p.to)} за ${p.price} $NET`;
    case 'convert':
      return `${name(p.playerId)} конвертирует ${p.trafficIn} трафика → ${p.moneyOut} $NET на ${p.fieldName}`;
  }
}

function applyPayload(state: GameState, p: TxPayload): Pick<GameState, 'players' | 'ownership'> {
  const players = state.players.map((pl) => ({ ...pl }));
  const ownership = { ...state.ownership };
  const get = (id: string) => players.find((x) => x.id === id);
  switch (p.kind) {
    case 'buy': {
      const pl = get(p.playerId);
      if (pl) pl.money -= p.price;
      ownership[p.fieldId] = { owner: p.playerId, level: 0, mortgaged: false };
      break;
    }
    case 'upgrade': {
      const pl = get(p.playerId);
      const own = ownership[p.fieldId];
      if (pl && own) {
        pl.money -= p.cost;
        ownership[p.fieldId] = { ...own, level: Math.min(MAX_LEVEL, p.toLevel) };
      }
      break;
    }
    case 'transfer': {
      const from = get(p.from);
      const to = get(p.to);
      const own = ownership[p.fieldId];
      if (from && to && own) {
        to.money -= p.price;
        from.money += p.price;
        ownership[p.fieldId] = { ...own, owner: p.to };
      }
      break;
    }
    case 'convert': {
      const pl = get(p.playerId);
      if (pl) {
        pl.traffic -= p.trafficIn;
        pl.money += p.moneyOut;
      }
      break;
    }
  }
  return { players, ownership };
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      started: false,
      settings: DEFAULT_SETTINGS,
      players: [],
      ownership: {},
      txs: [],
      log: [],

      setup: (players, settings) =>
        set({
          started: true,
          settings,
          players: players.map((p) => ({ id: uid(), name: p.name, color: p.color, money: settings.startMoney, traffic: 0 })),
          ownership: {},
          txs: [],
          log: [{ id: uid(), ts: Date.now(), text: `Новая партия: ${players.map((p) => p.name).join(', ')}. Стартовый капитал ${settings.startMoney} $NET.` }],
        }),

      reset: () => set({ started: false, players: [], ownership: {}, txs: [], log: [] }),

      adjustMoney: (playerId, delta, reason) =>
        set((s) => ({
          players: s.players.map((p) => (p.id === playerId ? { ...p, money: p.money + delta } : p)),
          log: addLog(s.log, `${pname(s, playerId)}: ${delta >= 0 ? '+' : ''}${delta} $NET — ${reason}`),
        })),

      adjustTraffic: (playerId, delta, reason) =>
        set((s) => ({
          players: s.players.map((p) => (p.id === playerId ? { ...p, traffic: Math.max(0, p.traffic + delta) } : p)),
          log: addLog(s.log, `${pname(s, playerId)}: ${delta >= 0 ? '+' : ''}${delta} трафика — ${reason}`),
        })),

      transferMoney: (from, to, amount, reason) =>
        set((s) => ({
          players: s.players.map((p) => {
            if (p.id === from) return { ...p, money: p.money - amount };
            if (p.id === to) return { ...p, money: p.money + amount };
            return p;
          }),
          log: addLog(s.log, `${pname(s, from)} → ${pname(s, to)}: ${amount} $NET — ${reason}`),
        })),

      collectFromEach: (to, amount, reason) =>
        set((s) => {
          const others = s.players.filter((p) => p.id !== to).length;
          return {
            players: s.players.map((p) => (p.id === to ? { ...p, money: p.money + amount * others } : { ...p, money: p.money - amount })),
            log: addLog(s.log, `Каждый платит ${pname(s, to)} по ${amount} $NET — ${reason}`),
          };
        }),

      setMortgaged: (fieldId, mortgaged, amount) =>
        set((s) => {
          const own = s.ownership[fieldId];
          if (!own) return s;
          return {
            ownership: { ...s.ownership, [fieldId]: { ...own, mortgaged } },
            players: s.players.map((p) => (p.id === own.owner ? { ...p, money: p.money + (mortgaged ? amount : -amount) } : p)),
            log: addLog(s.log, `${pname(s, own.owner)} ${mortgaged ? 'заложил' : 'выкупил'} поле ${fieldId} (${amount} $NET)`),
          };
        }),

      applyDirect: (payload) =>
        set((s) => ({ ...applyPayload(s, payload), log: addLog(s.log, describeTx(payload, s.players)) })),

      propose: (payload, initiator) =>
        set((s) => ({
          txs: [
            ...s.txs,
            { id: uid(), payload, initiator, votes: { [initiator]: true }, status: 'pending', createdAt: Date.now() },
          ],
          log: addLog(s.log, `Транзакция на подтверждение: ${describeTx(payload, s.players)}`),
        })),

      vote: (txId, playerId, approve) => {
        const s = get();
        const tx = s.txs.find((t) => t.id === txId);
        if (!tx || tx.status !== 'pending') return;
        const votes = { ...tx.votes, [playerId]: approve };
        const yes = Object.values(votes).filter(Boolean).length;
        const no = Object.values(votes).filter((v) => !v).length;
        const n = s.players.length;
        const needed = Math.floor(n / 2) + 1; // простое большинство
        let status: Tx['status'] = 'pending';
        if (yes >= needed) status = 'approved';
        else if (no >= n - needed + 1) status = 'rejected';

        const txs = s.txs.map((t) => (t.id === txId ? { ...t, votes, status } : t));
        if (status === 'approved') {
          set({ ...applyPayload(s, tx.payload), txs, log: addLog(s.log, `✅ Подтверждено (${yes}/${n}): ${describeTx(tx.payload, s.players)}`) });
        } else if (status === 'rejected') {
          set({ txs, log: addLog(s.log, `❌ Отклонено: ${describeTx(tx.payload, s.players)}`) });
        } else {
          set({ txs });
        }
      },

      dismissTx: (txId) => set((s) => ({ txs: s.txs.filter((t) => t.id !== txId) })),
    }),
    // skipHydration: при static export сервер рендерит пустое состояние,
    // а localStorage подхватывается в StoreHydrator после монтирования.
    { name: 'emonopolia-game-v1', skipHydration: true },
  ),
);

function pname(s: GameState, id: string): string {
  return s.players.find((p) => p.id === id)?.name ?? '?';
}

function addLog(log: LogEntry[], text: string): LogEntry[] {
  return [{ id: uid(), ts: Date.now(), text }, ...log].slice(0, 200);
}
