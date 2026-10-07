import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { getCatalog } from '@/lib/data';
import { cellHref, cellTitle } from '@/components/CellTile';

export const metadata: Metadata = { title: 'QR-коды для поля' };

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imironru.github.io/eMonopolia').replace(/\/$/, '');

/** Печатный лист с QR-кодами: клеишь на клетки — игроки сканируют телефоном и попадают на карточку. */
export default async function QrPage() {
  const catalog = getCatalog();
  const items = await Promise.all(
    catalog.cells.map(async (cell) => {
      const href = cellHref(cell) ?? '/';
      const url = `${SITE_URL}${href}`;
      const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0d1b2a', light: '#ffffff' } });
      return { cell, url, svg, title: cellTitle(catalog, cell) };
    }),
  );

  return (
    <div className="space-y-4">
      <div className="no-print card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">QR-коды для печати</h1>
          <p className="text-sm text-muted">
            40 кодов, по одному на клетку. Ведут на <code>{SITE_URL}</code>. Печатайте через Ctrl+P.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 print:grid-cols-5">
        {items.map(({ cell, svg, title, url }) => (
          <div key={cell.position} className="rounded-lg border border-navy/15 bg-white p-2 text-center break-inside-avoid">
            <div className="text-[10px] font-bold text-muted">#{cell.position}</div>
            <div className="mx-auto w-full max-w-[140px]" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="truncate text-xs font-semibold">{title}</div>
            <div className="truncate text-[9px] text-muted">{url.replace(/^https?:\/\//, '')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
