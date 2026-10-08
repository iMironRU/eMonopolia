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
  /** Клетка 1–40 (см. data/board.yaml) */
  position: number;
  inJail: boolean;
  /** Сколько ходов подряд игрок пытался выбросить дубль в БАНе */
  jailTurns: number;
  /** Пропустить следующие N ходов (карточка «Редизайн затянулся») */
  skipTurns: number;
}

/** Параметры доски, нужные для хода. Берутся из каталога в компоненте. */
export interface BoardRules {
  size: number;
  startPosition: number;
  jailPosition: number;
  goToJailPosition: number;
}

export interface Turn {
  /** индекс в players */
  current: number;
  /** бросал ли текущий игрок в этом ходу */
  rolled: boolean;
  /** дублей подряд в этом ходу */
  doubles: number;
  lastRoll: [number, number] | null;
  /** клетка, на которую игрок только что встал (для подсказки действий) */
  landed: number | null;
  passedStart: boolean;
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
  turn: Turn;

  setup: (players: { name: string; color: string }[], settings: Settings) => void;
  reset: () => void;
  /** Бросок 2d6 текущим игроком: перемещение, СТАРТ, дубли, БАН. Трафик начисляется в начале хода. */
  rollDice: (board: BoardRules, trafficIncome: number) => void;
  endTurn: () => void;
  payJailFee: () => void;
  /** Принудительное перемещение (карточки «Иди на …»). collectStart — начислять ли бонус при проходе СТАРТа. */
  moveTo: (playerId: string, position: number, board: BoardRules, collectStart: boolean, reason: string) => void;
  sendToJail: (playerId: string, board: BoardRules, reason: string) => void;
  addSkipTurn: (playerId: string, count: number, reason: string) => void;
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
const d6 = () => 1 + Math.floor(Math.random() * 6);

const FRESH_TURN: Turn = { current: 0, rolled: false, doubles: 0, lastRoll: null, landed: null, passedStart: false };

/** Сдвиг по кольцу из `size` клеток с нумерацией от 1. Возвращает новую позицию и признак прохода через старт. */
export function advance(position: number, steps: number, board: BoardRules): { position: number; passedStart: boolean } {
  const idx = (position - 1 + steps) % board.size;
  const next = idx + 1;
  // Прошли СТАРТ, если новая позиция «меньше» старой по кольцу (а не встали ровно на него задом наперёд)
  const passedStart = position + steps > board.size;
  return { position: next, passedStart };
}

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
      turn: FRESH_TURN,

      setup: (players, settings) =>
        set({
          started: true,
          settings,
          players: players.map((p) => ({
            id: uid(),
            name: p.name,
            color: p.color,
            money: settings.startMoney,
            traffic: 0,
            position: 1,
            inJail: false,
            jailTurns: 0,
            skipTurns: 0,
          })),
          ownership: {},
          txs: [],
          turn: FRESH_TURN,
          log: [{ id: uid(), ts: Date.now(), text: `Новая партия: ${players.map((p) => p.name).join(', ')}. Стартовый капитал ${settings.startMoney} $NET.` }],
        }),

      reset: () => set({ started: false, players: [], ownership: {}, txs: [], log: [], turn: FRESH_TURN }),

      rollDice: (board, trafficIncome) =>
        set((s) => {
          const me = s.players[s.turn.current];
          if (!me || (s.turn.rolled && s.turn.doubles === 0)) return s;
          const a = d6();
          const b = d6();
          const sum = a + b;
          const isDouble = a === b;
          let log = s.log;
          let player: Player = { ...me };
          let turn: Turn = { ...s.turn, rolled: true, lastRoll: [a, b], landed: null, passedStart: false };

          // Трафик начисляется один раз — в начале хода (первый бросок)
          if (!s.turn.rolled && trafficIncome > 0) {
            player.traffic += trafficIncome;
            log = addLog(log, `${me.name}: +${trafficIncome} трафика — доход с полей в начале хода`);
          }

          if (player.inJail) {
            if (isDouble) {
              player = { ...player, inJail: false, jailTurns: 0 };
              log = addLog(log, `${me.name} выбросил дубль ${a}+${b} и вышел из БАНа`);
              const mv = advance(player.position, sum, board);
              player.position = mv.position;
              turn = { ...turn, landed: mv.position, doubles: 0 }; // после выхода из бана повторного хода нет
            } else {
              const tries = player.jailTurns + 1;
              if (tries >= 3) {
                player = { ...player, inJail: false, jailTurns: 0, money: player.money - s.settings.jailFee };
                log = addLog(log, `${me.name}: третья неудача в БАНе — платит ${s.settings.jailFee} $NET и выходит (${a}+${b})`);
                const mv = advance(player.position, sum, board);
                player.position = mv.position;
                turn = { ...turn, landed: mv.position, doubles: 0 };
              } else {
                player = { ...player, jailTurns: tries };
                log = addLog(log, `${me.name} в БАНе: ${a}+${b}, не дубль (попытка ${tries}/3)`);
                turn = { ...turn, doubles: 0 };
              }
            }
            return { players: s.players.map((p) => (p.id === me.id ? player : p)), turn, log };
          }

          const doubles = isDouble ? s.turn.doubles + 1 : 0;
          if (doubles >= 3) {
            player = { ...player, position: board.jailPosition, inJail: true, jailTurns: 0 };
            log = addLog(log, `${me.name}: три дубля подряд (${a}+${b}) — отправляется в БАН`);
            return { players: s.players.map((p) => (p.id === me.id ? player : p)), turn: { ...turn, doubles: 0, landed: board.jailPosition }, log };
          }

          const mv = advance(player.position, sum, board);
          player.position = mv.position;
          if (mv.passedStart) {
            player.money += s.settings.passStartBonus;
            log = addLog(log, `${me.name} прошёл СТАРТ: +${s.settings.passStartBonus} $NET`);
          }
          log = addLog(log, `${me.name} бросил ${a}+${b}=${sum}${isDouble ? ' (дубль)' : ''} → клетка ${mv.position}`);

          if (mv.position === board.goToJailPosition) {
            player = { ...player, position: board.jailPosition, inJail: true, jailTurns: 0 };
            log = addLog(log, `${me.name} попал на «Под БАН!» — отправляется в БАН`);
            return { players: s.players.map((p) => (p.id === me.id ? player : p)), turn: { ...turn, doubles: 0, landed: board.jailPosition }, log };
          }

          return {
            players: s.players.map((p) => (p.id === me.id ? player : p)),
            turn: { ...turn, doubles, landed: mv.position, passedStart: mv.passedStart },
            log,
          };
        }),

      endTurn: () =>
        set((s) => {
          if (s.players.length === 0) return s;
          let next = (s.turn.current + 1) % s.players.length;
          let players = s.players;
          let log = s.log;
          // Пропуск хода: уменьшаем счётчик и идём дальше (не больше одного круга)
          for (let i = 0; i < s.players.length; i++) {
            const p = players[next];
            if (p.skipTurns > 0) {
              players = players.map((x, idx) => (idx === next ? { ...x, skipTurns: x.skipTurns - 1 } : x));
              log = addLog(log, `${p.name} пропускает ход`);
              next = (next + 1) % s.players.length;
            } else break;
          }
          return { players, log, turn: { ...FRESH_TURN, current: next } };
        }),

      payJailFee: () =>
        set((s) => {
          const me = s.players[s.turn.current];
          if (!me?.inJail || s.turn.rolled) return s;
          return {
            players: s.players.map((p) => (p.id === me.id ? { ...p, inJail: false, jailTurns: 0, money: p.money - s.settings.jailFee } : p)),
            log: addLog(s.log, `${me.name} заплатил ${s.settings.jailFee} $NET и вышел из БАНа`),
          };
        }),

      moveTo: (playerId, position, board, collectStart, reason) =>
        set((s) => {
          const me = s.players.find((p) => p.id === playerId);
          if (!me) return s;
          const steps = (position - me.position + board.size) % board.size;
          const mv = advance(me.position, steps, board);
          const bonus = collectStart && (mv.passedStart || position === board.startPosition) ? s.settings.passStartBonus : 0;
          let log = addLog(s.log, `${me.name} → клетка ${position} — ${reason}`);
          if (bonus) log = addLog(log, `${me.name} прошёл СТАРТ: +${bonus} $NET`);
          const isMe = s.players[s.turn.current]?.id === playerId;
          return {
            players: s.players.map((p) => (p.id === playerId ? { ...p, position, money: p.money + bonus } : p)),
            turn: isMe ? { ...s.turn, landed: position } : s.turn,
            log,
          };
        }),

      sendToJail: (playerId, board, reason) =>
        set((s) => {
          const me = s.players.find((p) => p.id === playerId);
          if (!me) return s;
          const isMe = s.players[s.turn.current]?.id === playerId;
          return {
            players: s.players.map((p) => (p.id === playerId ? { ...p, position: board.jailPosition, inJail: true, jailTurns: 0 } : p)),
            turn: isMe ? { ...s.turn, doubles: 0, landed: board.jailPosition } : s.turn,
            log: addLog(s.log, `${me.name} отправляется в БАН — ${reason}`),
          };
        }),

      addSkipTurn: (playerId, count, reason) =>
        set((s) => ({
          players: s.players.map((p) => (p.id === playerId ? { ...p, skipTurns: p.skipTurns + count } : p)),
          log: addLog(s.log, `${pname(s, playerId)} пропустит ${count} ход(а) — ${reason}`),
        })),

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
    {
      name: 'emonopolia-game-v1',
      skipHydration: true,
      version: 2,
      // v1 → v2: у игроков появились позиция и БАН, у партии — ход.
      migrate: (persisted, version) => {
        const s = persisted as Partial<GameState>;
        if (version < 2) {
          s.players = (s.players ?? []).map((p) => ({ ...p, position: p.position ?? 1, inJail: p.inJail ?? false, jailTurns: p.jailTurns ?? 0, skipTurns: p.skipTurns ?? 0 }));
          s.turn = FRESH_TURN;
        }
        return s as GameState;
      },
    },
  ),
);

function pname(s: GameState, id: string): string {
  return s.players.find((p) => p.id === id)?.name ?? '?';
}

function addLog(log: LogEntry[], text: string): LogEntry[] {
  return [{ id: uid(), ts: Date.now(), text }, ...log].slice(0, 200);
}
