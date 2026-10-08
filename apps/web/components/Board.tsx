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

/** Игровое поле с фишками. Активная клетка подсвечивается. */
export function Board({
  catalog,
  tokens,
  highlight,
  ownership,
}: {
  catalog: Catalog;
  tokens: Token[];
  highlight?: number | null;
  /** fieldId → цвет владельца, чтобы показать, чьё поле */
  ownership?: Record<string, string>;
}) {
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <div
        className="grid aspect-square w-full gap-[2px] rounded-xl bg-navy/10 p-[2px]"
        style={{ gridTemplateColumns: 'repeat(11, minmax(0, 1fr))', gridTemplateRows: 'repeat(11, minmax(0, 1fr))' }}
      >
        {catalog.cells.map((cell) => {
          const { row, col } = cellCoords(cell.position);
          const color = cellColor(catalog, cell);
          const here = tokens.filter((t) => t.position === cell.position);
          const title = cellTitle(catalog, cell);
          const href = cellHref(cell);
          const isCorner = cell.type === 'corner';
          const ownerColor = 'ref' in cell ? ownership?.[cell.ref] : undefined;
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
              <div className="flex min-h-[8px] w-full flex-wrap justify-center gap-[2px] sm:min-h-[10px]">
                {here.map((t) => (
                  <span
                    key={t.id}
                    className="size-[8px] rounded-full border border-white shadow sm:size-[11px]"
                    style={{ background: t.color, opacity: t.inJail ? 0.6 : 1 }}
                    title={t.name}
                  />
                ))}
              </div>
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

        {/* Центр доски */}
        <div className="flex flex-col items-center justify-center text-center" style={{ gridRow: '2 / 11', gridColumn: '2 / 11' }}>
          <div className="text-xl font-black tracking-tight sm:text-3xl">
            <span className="text-brand">e</span>Monopolia
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 px-2 text-[10px] sm:text-xs">
            {tokens.map((t) => (
              <span key={t.id} className="flex items-center gap-1">
                <span className="size-2.5 rounded-full" style={{ background: t.color }} />
                {t.name}
                {t.inJail && ' 🚫'}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
