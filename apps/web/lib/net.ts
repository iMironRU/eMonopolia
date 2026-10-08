'use client';
// Сетевая игра без сервера: WebRTC через PeerJS (сигнальный сервер — публичный PeerServer).
// Хост держит состояние и авторитетен: гости отправляют ему намерения («бросить», «голосовать»),
// хост выполняет их у себя через обычные действия стора и рассылает всем полное состояние.
import { create } from 'zustand';
import type { DataConnection, Peer } from 'peerjs';
import { FRESH_NET, PLAYER_COLORS, REMOTE_ACTIONS, useGame, type GameState, type RemoteAction } from './store';

export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'emonopolia-v1-';
const peerId = (code: string) => `${PEER_PREFIX}${code}`;

export interface LobbyEntry {
  token: string;
  name: string;
  online: boolean;
  playerId?: string;
}

interface NetStatus {
  status: 'idle' | 'connecting' | 'open' | 'error';
  error: string | null;
  /** Хост: подключённые гости. Гость: список из лобби хоста. */
  lobby: LobbyEntry[];
  /** playerId → онлайн (хост и гость) */
  online: Record<string, boolean>;
  hostOnline: boolean;
}

export const useNet = create<NetStatus>(() => ({ status: 'idle', error: null, lobby: [], online: {}, hostOnline: false }));

type GuestToHost = { t: 'hello'; token: string; name: string } | { t: 'call'; fn: RemoteAction; args: unknown[] };
type HostToGuest =
  | { t: 'lobby'; players: { name: string; online: boolean }[] }
  | { t: 'you'; playerId: string | null }
  | { t: 'state'; state: Pick<GameState, 'started' | 'settings' | 'players' | 'ownership' | 'txs' | 'log' | 'turn'>; online: Record<string, boolean> }
  | { t: 'error'; message: string };

let peer: Peer | null = null;
const conns = new Map<string, DataConnection>(); // token → соединение (хост)
let hostConn: DataConnection | null = null; // гость
let unsubscribe: (() => void) | null = null;
/** Оригинальные действия стора; у гостя они подменяются на отправку хосту. */
const originals: Partial<Record<RemoteAction, (...args: unknown[]) => void>> = {};

export function randomCode(len = 4): string {
  return Array.from({ length: len }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join('');
}
const uid = () => Math.random().toString(36).slice(2, 12);

async function createPeer(id?: string): Promise<Peer> {
  const { Peer } = await import('peerjs');
  return new Promise((resolve, reject) => {
    const p = new Peer(id as string, { debug: 0 });
    p.on('open', () => resolve(p));
    p.on('error', (e) => {
      useNet.setState({ status: 'error', error: describeError(e) });
      reject(e);
    });
  });
}

function describeError(e: unknown): string {
  const type = (e as { type?: string })?.type;
  if (type === 'unavailable-id') return 'Комната с таким кодом уже существует. Попробуйте другой код.';
  if (type === 'peer-unavailable') return 'Комната не найдена. Проверьте код: хост должен быть онлайн.';
  if (type === 'network' || type === 'server-error' || type === 'socket-error') return 'Нет связи с сигнальным сервером. Проверьте интернет или попробуйте позже.';
  if (type === 'browser-incompatible') return 'Браузер не поддерживает WebRTC.';
  return String((e as Error)?.message ?? e);
}

function pickState(s: GameState) {
  const { started, settings, players, ownership, txs, log, turn } = s;
  return { started, settings, players, ownership, txs, log, turn };
}

/* ---------------------------------------------------------------- Хост */

function hostBroadcast() {
  const s = useGame.getState();
  const online: Record<string, boolean> = {};
  for (const [token, pid] of Object.entries(s.net.tokens)) online[pid] = conns.get(token)?.open ?? false;
  if (s.net.myPlayerId) online[s.net.myPlayerId] = true;
  useNet.setState({ online });
  const msg: HostToGuest = { t: 'state', state: pickState(s), online };
  for (const c of conns.values()) if (c.open) c.send(msg);
}

function hostLobbyBroadcast() {
  const s = useGame.getState();
  const lobby = useNet.getState().lobby;
  const players = [{ name: s.net.guestName ?? 'Хост', online: true }, ...lobby.map((l) => ({ name: l.name, online: l.online }))];
  const msg: HostToGuest = { t: 'lobby', players };
  for (const c of conns.values()) if (c.open) c.send(msg);
}

function hostHandle(conn: DataConnection, msg: GuestToHost) {
  const s = useGame.getState();
  if (msg.t === 'hello') {
    conns.set(msg.token, conn);
    const lobby = useNet.getState().lobby.filter((l) => l.token !== msg.token);
    const playerId = s.net.tokens[msg.token];
    useNet.setState({ lobby: [...lobby, { token: msg.token, name: msg.name, online: true, playerId }] });
    if (s.started) {
      conn.send({ t: 'you', playerId: playerId ?? null } satisfies HostToGuest);
      hostBroadcast();
    } else {
      hostLobbyBroadcast();
    }
    return;
  }
  if (msg.t === 'call') {
    const token = [...conns.entries()].find(([, c]) => c === conn)?.[0];
    const caller = token ? s.net.tokens[token] : undefined;
    if (!caller || !REMOTE_ACTIONS.includes(msg.fn)) return;
    const current = s.players[s.turn.current]?.id;
    // Минимальная авторизация: ход — только тот, кто ходит; голос — только за себя.
    if (['rollDice', 'endTurn', 'payJailFee'].includes(msg.fn) && caller !== current) return;
    if (msg.fn === 'vote' && msg.args[1] !== caller) return;
    if (msg.fn === 'propose' && msg.args[1] !== caller) return;
    const fn = originals[msg.fn] ?? (s[msg.fn] as unknown as (...a: unknown[]) => void);
    fn(...msg.args);
  }
}

/** Создать комнату. Хост — игрок на этом телефоне. */
export async function hostRoom(hostName: string): Promise<string> {
  await leaveRoom();
  useNet.setState({ status: 'connecting', error: null, lobby: [], online: {}, hostOnline: true });
  const code = randomCode();
  peer = await createPeer(peerId(code));
  useGame.getState().setNet({ ...FRESH_NET, mode: 'host', roomCode: code, guestName: hostName });
  wireHost(peer);
  useNet.setState({ status: 'open' });
  return code;
}

/** Восстановить комнату после перезагрузки хоста. */
export async function resumeHost(): Promise<void> {
  const { net } = useGame.getState();
  if (net.mode !== 'host' || !net.roomCode) return;
  useNet.setState({ status: 'connecting', error: null, hostOnline: true });
  try {
    peer = await createPeer(peerId(net.roomCode));
    wireHost(peer);
    useNet.setState({ status: 'open' });
  } catch {
    /* ошибка уже в useNet */
  }
}

function wireHost(p: Peer) {
  p.on('connection', (conn) => {
    conn.on('data', (data) => hostHandle(conn, data as GuestToHost));
    conn.on('close', () => {
      const token = [...conns.entries()].find(([, c]) => c === conn)?.[0];
      if (!token) return;
      conns.delete(token);
      useNet.setState({ lobby: useNet.getState().lobby.map((l) => (l.token === token ? { ...l, online: false } : l)) });
      if (useGame.getState().started) hostBroadcast();
      else hostLobbyBroadcast();
    });
  });
  p.on('disconnected', () => {
    useNet.setState({ status: 'connecting' });
    p.reconnect();
  });
  unsubscribe?.();
  unsubscribe = useGame.subscribe((s, prev) => {
    if (s.net.mode !== 'host') return;
    if (s.players !== prev.players || s.ownership !== prev.ownership || s.txs !== prev.txs || s.turn !== prev.turn || s.log !== prev.log || s.started !== prev.started) {
      hostBroadcast();
    }
  });
}

/** Хост начинает игру: игроки из лобби получают id и свои токены. */
export function hostStart(settings: GameState['settings']) {
  const g = useGame.getState();
  const lobby = useNet.getState().lobby;
  const names = [g.net.guestName ?? 'Хост', ...lobby.map((l) => l.name)];
  g.setup(
    names.map((name, i) => ({ name, color: PLAYER_COLORS[i % PLAYER_COLORS.length] })),
    settings,
  );
  const players = useGame.getState().players;
  const tokens: Record<string, string> = {};
  lobby.forEach((l, i) => {
    tokens[l.token] = players[i + 1].id;
  });
  // setup() сбрасывает net? Нет — net сохраняется, обновляем только привязки
  useGame.getState().setNet({ mode: 'host', roomCode: g.net.roomCode, myPlayerId: players[0].id, tokens, guestName: g.net.guestName });
  for (const l of lobby) {
    const c = conns.get(l.token);
    if (c?.open) c.send({ t: 'you', playerId: tokens[l.token] } satisfies HostToGuest);
  }
  useNet.setState({ lobby: lobby.map((l) => ({ ...l, playerId: tokens[l.token] })) });
  hostBroadcast();
}

/* ---------------------------------------------------------------- Гость */

function installGuestProxy() {
  const s = useGame.getState();
  const patch: Partial<GameState> = {};
  for (const fn of REMOTE_ACTIONS) {
    if (!originals[fn]) originals[fn] = s[fn] as unknown as (...a: unknown[]) => void;
    (patch as Record<string, unknown>)[fn] = (...args: unknown[]) => {
      if (hostConn?.open) hostConn.send({ t: 'call', fn, args } satisfies GuestToHost);
    };
  }
  useGame.setState(patch);
}

function restoreActions() {
  const patch: Partial<GameState> = {};
  for (const fn of REMOTE_ACTIONS) if (originals[fn]) (patch as Record<string, unknown>)[fn] = originals[fn];
  useGame.setState(patch);
}

function guestHandle(msg: HostToGuest) {
  if (msg.t === 'lobby') {
    useNet.setState({ lobby: msg.players.map((p, i) => ({ token: String(i), name: p.name, online: p.online })) });
  } else if (msg.t === 'you') {
    useGame.getState().setNet({ myPlayerId: msg.playerId });
  } else if (msg.t === 'state') {
    useGame.setState({ ...msg.state });
    useNet.setState({ online: msg.online });
  } else if (msg.t === 'error') {
    useNet.setState({ status: 'error', error: msg.message });
  }
}

/** Войти в комнату по коду. */
export async function joinRoom(code: string, name: string): Promise<void> {
  await leaveRoom();
  const token = useGame.getState().net.guestToken ?? uid();
  useGame.getState().setNet({ ...FRESH_NET, mode: 'guest', roomCode: code.toUpperCase(), guestToken: token, guestName: name });
  useGame.setState({ started: false, players: [], ownership: {}, txs: [], log: [] });
  await connectGuest();
}

/** Восстановить подключение гостя после перезагрузки. */
export async function resumeGuest(): Promise<void> {
  const { net } = useGame.getState();
  if (net.mode !== 'guest' || !net.roomCode) return;
  await connectGuest();
}

async function connectGuest() {
  const { net } = useGame.getState();
  if (!net.roomCode || !net.guestToken) return;
  useNet.setState({ status: 'connecting', error: null, hostOnline: false });
  installGuestProxy();
  try {
    peer = await createPeer();
  } catch {
    return;
  }
  const conn = peer.connect(peerId(net.roomCode), { reliable: true });
  hostConn = conn;
  conn.on('open', () => {
    useNet.setState({ status: 'open', hostOnline: true });
    conn.send({ t: 'hello', token: net.guestToken!, name: net.guestName ?? 'Игрок' } satisfies GuestToHost);
  });
  conn.on('data', (d) => guestHandle(d as HostToGuest));
  conn.on('close', () => {
    useNet.setState({ hostOnline: false, status: 'connecting' });
    // Хост мог перезагрузиться — пробуем переподключиться
    window.setTimeout(() => {
      if (useGame.getState().net.mode === 'guest') void connectGuest();
    }, 3000);
  });
  peer.on('error', (e) => {
    const type = (e as { type?: string }).type;
    if (type === 'peer-unavailable') {
      useNet.setState({ status: 'error', error: describeError(e), hostOnline: false });
      window.setTimeout(() => {
        if (useGame.getState().net.mode === 'guest') void connectGuest();
      }, 5000);
    }
  });
}

/** Выйти из комнаты (хост — закрыть комнату). Локальный стор остаётся как есть. */
export async function leaveRoom(): Promise<void> {
  unsubscribe?.();
  unsubscribe = null;
  for (const c of conns.values()) c.close();
  conns.clear();
  hostConn?.close();
  hostConn = null;
  peer?.destroy();
  peer = null;
  restoreActions();
  useNet.setState({ status: 'idle', error: null, lobby: [], online: {}, hostOnline: false });
}

/** Ссылка-приглашение в комнату (для QR). */
export function joinUrl(code: string): string {
  if (typeof window === 'undefined') return '';
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return `${window.location.origin}${base}/game/?join=${code}`;
}
