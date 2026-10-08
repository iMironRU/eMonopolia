'use client';
import Link from 'next/link';
import type { Catalog, Cell } from '@/lib/types';
import { GROUP_META, findField } from '@/lib/rules';
import { cellHref, cellTitle } from './CellTile';

export interface Token {
  id: string;
  name: string;
  color: string;
  position: number;
  inJail?: boolean;
}

/**
 * Координаты клетки на сетке 11×11. Нумерация из data/board.yaml:
 * 1–11 нижняя сторона (справа налево), 12–20 левая (снизу вверх),
 * 21–31 верхняя (слева направо), 32–40 правая (сверху вниз).
 */
export function cellCoords(position: number): { row: number; col: number } {
  if (position <= 11) return { row: 10, col: 11 - position };
  if (position <= 20) return { row: 10 - (position - 11), col: 0 };
  if (position <= 31) return { row: 0, col: position - 21 };
  return { row: position - 31, col: 10 };
}

function cellColor(catalog: Catalog, cell: Cell): string {
  if (cell.type === 'property') {
    const f = findField(catalog, cell.ref);
    return f?.kind === 'property' ? GROUP_META[f.group].color : '#dee2e6';
  }
  if (cell.type === 'provider') return '#0d1b2a';
  if (cell.type === 'utility') return '#6c757d';
  if (cell.type === 'card') return cell.deck === 'chance' ? '#e63946' : '#3a86ff';
  if (cell.type === 'tax') return '#adb5bd';
  return '#e9ecef';
}

const CORNER_ICON: Record<string, string> = { start: '🚀', jail: '🚫', free_parking: '📴', go_to_jail: '👮' };

function cellIcon(cell: Cell): string {
  if (cell.type === 'corner') return CORNER_ICON[cell.subtype] ?? '';
  if (cell.type === 'card') return cell.deck === 'chance' ? '🎲' : '💼';
  if (cell.type === 'tax') return '💸';
  if (cell.type === 'provider') return '🔌';
  if (cell.type === 'utility') return '🏢';
  return '';
}

const TILT = 55; // наклон доски, градусов
const TURN = 45; // поворот доски в плоскости, градусов
const ISO_SCALE = 0.72; // чтобы ромб влез по ширине
export type BoardView = 'iso' | 'flat';

export interface OwnerInfo {
  color: string;
  /** 0 — без прокачки, 1–4 — хостинг, 5 — датацентр */
  level: number;
  mortgaged?: boolean;
}

/** Где на клетке стоят постройки: у внутренней кромки (там же, где цветная полоска). */
function buildingSpot(position: number): { x: number; y: number } {
  const { row, col } = cellCoords(position);
  if (row === 10) return { x: (col + 0.5) / 11, y: (row + 0.24) / 11 };
  if (row === 0) return { x: (col + 0.5) / 11, y: (row + 0.78) / 11 };
  if (col === 0) return { x: (col + 0.78) / 11, y: (row + 0.5) / 11 };
  return { x: (col + 0.24) / 11, y: (row + 0.5) / 11 };
}

/** Игровое поле с фишками. Изометрия (как в мобильных «Монополиях») или плоский вид. */
export function Board({
  catalog,
  tokens,
  highlight,
  ownership,
  view = 'iso',
  className = '',
  style,
}: {
  catalog: Catalog;
  tokens: Token[];
  highlight?: number | null;
  /** fieldId → цвет владельца, чтобы показать, чьё поле */
  ownership?: Record<string, OwnerInfo>;
  view?: BoardView;
  className?: string;
  style?: React.CSSProperties;
}) {
  const iso = view === 'iso';

  // Фишки лежат отдельным слоем поверх сетки: так их можно «поставить» вертикально
  // в 3D и плавно переезжать между клетками.
  const byCell = new Map<number, Token[]>();
  for (const t of tokens) byCell.set(t.position, [...(byCell.get(t.position) ?? []), t]);

  return (
    <div className={`relative mx-auto w-full max-w-[720px] ${className}`} style={style}>
      <div className={`relative w-full ${iso ? 'aspect-[25/17]' : 'aspect-square'}`} style={iso ? { perspective: '1400px', perspectiveOrigin: '50% 40%' } : undefined}>
        <div
          className={`absolute left-0 top-0 grid aspect-square w-full gap-[2px] rounded-xl bg-[#0d1b2a] p-[3px] transition-transform duration-500 ${iso ? 'shadow-2xl' : ''}`}
          style={{
            gridTemplateColumns: 'repeat(11, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(11, minmax(0, 1fr))',
            transformStyle: 'preserve-3d',
            transformOrigin: '50% 50%',
            transform: iso ? `translateY(-22%) rotateX(${TILT}deg) rotateZ(${TURN}deg) scale(${ISO_SCALE})` : 'none',
          }}
        >
          {catalog.cells.map((cell) => {
            const { row, col } = cellCoords(cell.position);
            const color = cellColor(catalog, cell);
            const title = cellTitle(catalog, cell);
            const href = cellHref(cell);
            const isCorner = cell.type === 'corner';
            const ownerColor = 'ref' in cell ? ownership?.[cell.ref]?.color : undefined;
            const active = highlight === cell.position;
            // Цветная полоска — на внутренней стороне клетки (как на настоящей доске)
            const stripe =
              row === 10 ? 'border-t-[5px]' : row === 0 ? 'border-b-[5px]' : col === 0 ? 'border-r-[5px]' : 'border-l-[5px]';

            const inner = (
              <div
                className={`relative flex h-full w-full flex-col items-center justify-between overflow-hidden rounded-[3px] bg-white p-[2px] text-[8px] leading-none sm:text-[10px] ${isCorner ? '' : stripe} ${active ? 'ring-2 ring-brand ring-offset-1' : ''}`}
                style={{ borderColor: color, ...(isCorner ? { background: '#e9ecef' } : {}) }}
                title={`${cell.position}. ${title}`}
              >
                <div className="flex w-full items-start justify-between">
                  <span className="font-bold text-muted">{cell.position}</span>
                  {ownerColor && <span className="size-[6px] rounded-full sm:size-2" style={{ background: ownerColor }} />}
                </div>
                <div className="text-center">
                  {isCorner || cell.type === 'card' || cell.type === 'tax' || cell.type === 'provider' || cell.type === 'utility' ? (
                    <span className="text-[11px] sm:text-base">{cellIcon(cell)}</span>
                  ) : (
                    <span className="hidden truncate font-semibold sm:block">{title}</span>
                  )}
                </div>
                <div className="min-h-[8px] sm:min-h-[10px]" />
              </div>
            );

            return (
              <div key={cell.position} style={{ gridRow: row + 1, gridColumn: col + 1 }}>
                {href ? (
                  <Link href={href} className="block h-full">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </div>
            );
          })}

          {/* Центр доски: в изометрии логотип лежит на доске вдоль нижней кромки */}
          <div
            className="flex flex-col items-center justify-center rounded-lg text-center text-white"
            style={{ gridRow: '2 / 11', gridColumn: '2 / 11', background: 'radial-gradient(circle at 50% 40%, #35b377 0%, #1f8a55 55%, #176b43 100%)', boxShadow: 'inset 0 0 40px rgba(0,0,0,0.25)' }}
          >
            <div className="text-xl font-black tracking-tight drop-shadow sm:text-4xl">
              <span className="text-[#ffe66d]">e</span>Monopolia
            </div>
            <div className="mt-1 text-[8px] uppercase tracking-[0.3em] text-white/70 sm:text-xs">построй свой интернет</div>
            <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 px-2 text-[10px] sm:text-xs">
              {tokens.map((t) => (
                <span key={t.id} className="flex items-center gap-1">
                  <span className="size-2.5 rounded-full border border-white/80" style={{ background: t.color }} />
                  {t.name}
                  {t.inJail && ' 🚫'}
                </span>
              ))}
            </div>
          </div>

          {/* Слой построек и фишек */}
          <div className="pointer-events-none absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
            {catalog.cells.map((cell) => {
              if (!('ref' in cell)) return null;
              const own = ownership?.[cell.ref];
              if (!own || own.level <= 0) return null;
              const { x, y } = buildingSpot(cell.position);
              return (
                <div
                  key={`b-${cell.ref}`}
                  className="absolute"
                  style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -100%)', transformStyle: 'preserve-3d' }}
                  title={`${cellTitle(catalog, cell)}: уровень ${own.level}`}
                >
                  <div className="origin-bottom" style={{ transform: iso ? `rotateZ(${-TURN}deg) rotateX(${-TILT}deg)` : 'none', opacity: own.mortgaged ? 0.5 : 1 }}>
                    <Buildings level={own.level} color={own.color} tall={iso} />
                  </div>
                </div>
              );
            })}
            {tokens.map((t) => {
              const { row, col } = cellCoords(t.position);
              const mates = byCell.get(t.position) ?? [];
              const i = mates.findIndex((m) => m.id === t.id);
              const n = mates.length;
              // Несколько фишек на клетке расставляем по горизонтали
              const dx = n > 1 ? (i - (n - 1) / 2) * 12 : 0; // px
              return (
                <div
                  key={t.id}
                  className="absolute transition-all duration-500 ease-in-out"
                  style={{
                    left: `${((col + 0.5) / 11) * 100}%`,
                    top: `${((row + 0.5) / 11) * 100}%`,
                    transform: `translate(calc(-50% + ${dx}px), -100%)`,
                    transformStyle: 'preserve-3d',
                  }}
                  title={t.name}
                >
                  <div
                    className="origin-bottom transition-transform duration-500"
                    style={{ transform: iso ? `rotateZ(${-TURN}deg) rotateX(${-TILT}deg)` : 'none' }}
                  >
                    <Pawn color={t.color} dim={t.inJail} tall={iso} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Фишка: в 3D — пешка, стоящая на доске; в плоском виде — кружок. */
function Pawn({ color, dim, tall }: { color: string; dim?: boolean; tall: boolean }) {
  if (!tall) {
    return <span className="block size-3 rounded-full border-2 border-white shadow sm:size-4" style={{ background: color, opacity: dim ? 0.6 : 1 }} />;
  }
  return (
    <svg viewBox="0 0 24 40" className="h-8 w-5 drop-shadow-md sm:h-10 sm:w-6" style={{ opacity: dim ? 0.6 : 1 }}>
      <ellipse cx="12" cy="37" rx="8" ry="2.5" fill="rgba(0,0,0,0.25)" />
      <path d="M6 36 Q12 22 7 18 Q4 15 7 13 A5 5 0 1 1 17 13 Q20 15 17 18 Q12 22 18 36 Z" fill={color} stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Постройки на поле — уровни прокачки хостинга.
 * 1–4: серверные стойки (по одной на уровень), 5: собственный датацентр.
 */
function Buildings({ level, color, tall }: { level: number; color: string; tall: boolean }) {
  if (level >= 5) {
    // Датацентр: здание с окнами
    const w = tall ? 'h-7 w-7 sm:h-9 sm:w-9' : 'h-4 w-4 sm:h-5 sm:w-5';
    return (
      <svg viewBox="0 0 28 28" className={`${w} drop-shadow-md`}>
        <ellipse cx="14" cy="26" rx="12" ry="2" fill="rgba(0,0,0,0.25)" />
        <rect x="3" y="6" width="22" height="20" rx="1.5" fill={color} stroke="#fff" strokeWidth="1.5" />
        <rect x="6" y="2" width="16" height="5" rx="1" fill={color} stroke="#fff" strokeWidth="1.5" />
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={6 + c * 4.5} y={10 + r * 4.5} width="2.6" height="2.6" fill="#fff" opacity="0.9" />),
        )}
      </svg>
    );
  }
  // Стойки: level штук, в ряд
  const n = Math.min(4, level);
  const unit = tall ? 9 : 6;
  const h = tall ? 14 : 8;
  const width = n * unit + 2;
  return (
    <svg viewBox={`0 0 ${width} ${h + 4}`} width={width * (tall ? 1.3 : 1)} height={(h + 4) * (tall ? 1.3 : 1)} className="drop-shadow">
      {Array.from({ length: n }).map((_, i) => (
        <g key={i}>
          <rect x={1 + i * unit} y={2} width={unit - 2} height={h} rx="1" fill={color} stroke="#fff" strokeWidth="1" />
          {tall && (
            <>
              <rect x={2.5 + i * unit} y={4} width={unit - 5} height="1.6" fill="#fff" opacity="0.9" />
              <rect x={2.5 + i * unit} y={7} width={unit - 5} height="1.6" fill="#fff" opacity="0.7" />
              <rect x={2.5 + i * unit} y={10} width={unit - 5} height="1.6" fill="#fff" opacity="0.5" />
            </>
          )}
        </g>
      ))}
    </svg>
  );
}
