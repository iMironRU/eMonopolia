import Link from 'next/link';
import { getCatalog } from '@/lib/data';
import { GROUP_META, GROUP_ORDER, groupMembers } from '@/lib/rules';
import { CellTile } from '@/components/CellTile';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// PDF собираются из print/ при деплое и кладутся в /print/ рядом с сайтом
const PRINT_FILES = [
  { file: 'board-a2.pdf', title: 'Поле A2', desc: '400×400 мм + памятка, для типографии' },
  { file: 'board-a4x4.pdf', title: 'Поле на 4 листах A4', desc: 'домашняя печать, склеить встык' },
  { file: 'cards-properties.pdf', title: 'Карточки владений', desc: '28 штук, 65×90 мм' },
  { file: 'cards-chance.pdf', title: 'Карточки Шанса', desc: '16 штук + рубашки' },
  { file: 'cards-chest.pdf', title: 'Карточки Казны', desc: '16 штук + рубашки' },
];

export default function HomePage() {
  const catalog = getCatalog();

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
          Построй свой интернет.
          <br />
          <span className="text-brand">Пойми, как он устроен.</span>
        </h1>
        <p className="max-w-2xl text-navy/80">
          eMonopolia — настольная Монополия, где поля — это поисковики, соцсети и маркетплейсы. Это приложение заменяет банк и калькулятор:
          считает ренту, хранит деньги и трафик игроков, а каждая сделка подтверждается всеми, как в блокчейне.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/game/" className="btn-primary">
            Начать партию
          </Link>
          <Link href="/qr/" className="btn-ghost">
            QR-коды для поля
          </Link>
          <a href="https://github.com/iMironRU/eMonopolia/blob/main/docs/mechanics.md" className="btn-ghost">
            Правила
          </a>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card">
          <div className="text-2xl">🌐</div>
          <div className="mt-1 font-bold">Трафик — ресурс</div>
          <p className="text-sm text-navy/70">Поисковики и соцсети его генерируют, маркетплейсы и стриминг превращают в $NET.</p>
        </div>
        <div className="card">
          <div className="text-2xl">🏗️</div>
          <div className="mt-1 font-bold">Прокачка хостинга</div>
          <p className="text-sm text-navy/70">От VPS до собственного датацентра — рента растёт, как с домами в классике.</p>
        </div>
        <div className="card">
          <div className="text-2xl">🪙</div>
          <div className="mt-1 font-bold">Консенсус</div>
          <p className="text-sm text-navy/70">Покупки и прокачки проходят только после подтверждения большинством игроков.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Печатные материалы</h2>
        <p className="text-sm text-navy/70">Поле и карточки генерируются из тех же данных, что и приложение. На каждой клетке QR-код на её страницу.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {PRINT_FILES.map((f) => (
            <a key={f.file} href={`${BASE}/print/${f.file}`} className="card p-3 transition hover:shadow-md">
              <div className="font-semibold">🖨️ {f.title}</div>
              <div className="text-xs text-muted">{f.desc}</div>
            </a>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Группы полей</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {GROUP_ORDER.map((g) => {
            const meta = GROUP_META[g];
            const members = groupMembers(catalog, g);
            return (
              <div key={g} className="card p-3" style={{ borderTop: `6px solid ${meta.color}` }}>
                <div className="font-semibold">
                  {meta.emoji} {meta.label}
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-xs">
                  {members.map((m) => (
                    <Link key={m.id} href={`/card/${m.id}/`} className="rounded bg-navy/5 px-1.5 py-0.5 hover:bg-navy/10">
                      {m.name}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Доска — 40 клеток</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {catalog.cells.map((cell) => (
            <CellTile key={cell.position} catalog={catalog} cell={cell} />
          ))}
        </div>
      </section>
    </div>
  );
}
