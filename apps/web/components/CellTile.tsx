import Link from 'next/link';
import type { Catalog, Cell } from '@/lib/types';
import { GROUP_META, findField } from '@/lib/rules';

const CORNER_ICON: Record<string, string> = { start: '🚀', jail: '🚫', free_parking: '📴', go_to_jail: '👮' };

export function cellHref(cell: Cell): string | null {
  if ('ref' in cell) return `/card/${cell.ref}/`;
  if (cell.type === 'card') return `/${cell.deck}/`;
  return null;
}

export function cellTitle(catalog: Catalog, cell: Cell): string {
  if ('ref' in cell) return findField(catalog, cell.ref)?.name ?? cell.ref;
  if (cell.type === 'card') return cell.deck === 'chance' ? 'Шанс' : 'Казна';
  return cell.name;
}

export function CellTile({ catalog, cell }: { catalog: Catalog; cell: Cell }) {
  const href = cellHref(cell);
  let stripe = '#dee2e6';
  let subtitle = '';
  let icon = '';

  if (cell.type === 'property') {
    const f = findField(catalog, cell.ref);
    if (f?.kind === 'property') {
      stripe = GROUP_META[f.group].color;
      subtitle = `${f.price} $NET`;
      icon = GROUP_META[f.group].emoji;
    }
  } else if (cell.type === 'provider') {
    const f = findField(catalog, cell.ref);
    stripe = '#0d1b2a';
    subtitle = f ? `${f.price} $NET · провайдер` : '';
    icon = '🔌';
  } else if (cell.type === 'utility') {
    const f = findField(catalog, cell.ref);
    stripe = '#6c757d';
    subtitle = f ? `${f.price} $NET · коммуналка` : '';
    icon = f?.kind === 'utility' && f.category === 'datacenter' ? '🏢' : '🌐';
  } else if (cell.type === 'card') {
    stripe = cell.deck === 'chance' ? '#e63946' : '#3a86ff';
    subtitle = cell.deck === 'chance' ? 'риски' : 'возможности';
    icon = cell.deck === 'chance' ? '🎲' : '💼';
  } else if (cell.type === 'tax') {
    stripe = '#adb5bd';
    subtitle = `−${cell.amount} $NET`;
    icon = '💸';
  } else if (cell.type === 'corner') {
    icon = CORNER_ICON[cell.subtype] ?? '';
    subtitle = cell.subtype === 'start' ? `+${catalog.board.pass_start_bonus} $NET за круг` : '';
  }

  const body = (
    <div className="card flex h-full items-stretch gap-3 p-3 transition hover:shadow-md" style={{ borderLeft: `6px solid ${stripe}` }}>
      <div className="w-7 shrink-0 text-xs font-bold text-muted">{cell.position}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">
          {icon} {cellTitle(catalog, cell)}
        </div>
        {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    <div className="h-full">{body}</div>
  );
}
