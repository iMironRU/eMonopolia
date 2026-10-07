import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { StoreHydrator } from '@/components/StoreHydrator';

export const metadata: Metadata = {
  title: { default: 'eMonopolia', template: '%s — eMonopolia' },
  description: 'Гибридная настольно-цифровая игра, которая объясняет, как устроен интернет.',
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/icon.svg` },
};

export const viewport: Viewport = {
  themeColor: '#0d1b2a',
  width: 'device-width',
  initialScale: 1,
};

const NAV = [
  { href: '/', label: 'Доска' },
  { href: '/game/', label: 'Партия' },
  { href: '/chance/', label: 'Шанс' },
  { href: '/chest/', label: 'Казна' },
  { href: '/qr/', label: 'QR' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <StoreHydrator />
        <header className="no-print sticky top-0 z-20 border-b border-navy/10 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
            <Link href="/" className="flex shrink-0 items-center gap-2 font-black tracking-tight">
              <span className="grid size-7 place-items-center rounded-md bg-navy text-brand">e</span>
              <span className="hidden sm:inline">
                <span className="text-brand">e</span>Monopolia
              </span>
            </Link>
            <nav className="flex gap-0.5 overflow-x-auto text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="shrink-0 rounded-md px-2 py-1 font-medium text-navy/80 hover:bg-navy/5">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="no-print mx-auto max-w-5xl px-4 py-8 text-center text-xs text-muted">
          eMonopolia · код MIT, контент CC BY-SA 4.0 · все названия полей вымышлены ·{' '}
          <a className="underline" href="https://github.com/iMironRU/eMonopolia">
            GitHub
          </a>
        </footer>
      </body>
    </html>
  );
}
