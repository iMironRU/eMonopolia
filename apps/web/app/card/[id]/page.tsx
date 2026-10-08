import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import ReactMarkdown from 'react-markdown';
import { getCatalog } from '@/lib/data';
import { getFieldContent } from '@/lib/content';
import { GROUP_META, allFields, fieldPosition, findField, groupMembers, rentLadder } from '@/lib/rules';
import { RentCalculator } from '@/components/RentCalculator';

export function generateStaticParams() {
  return allFields(getCatalog()).map((f) => ({ id: f.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const field = findField(getCatalog(), id);
  return { title: field?.name ?? 'Поле' };
}

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const catalog = getCatalog();
  const field = findField(catalog, id);
  if (!field) notFound();

  const content = getFieldContent(id);
  const position = fieldPosition(catalog, id);

  const header =
    field.kind === 'property'
      ? { color: GROUP_META[field.group].color, text: GROUP_META[field.group].text, label: `${GROUP_META[field.group].emoji} ${GROUP_META[field.group].label}` }
      : field.kind === 'provider'
        ? { color: '#0d1b2a', text: '#fff', label: '🔌 Провайдер' }
        : { color: '#6c757d', text: '#fff', label: field.category === 'datacenter' ? '🏢 Датацентр' : '🌐 Регистратор доменов' };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-5" style={{ background: header.color, color: header.text }}>
        <div className="text-xs font-semibold uppercase tracking-wider opacity-80">
          {header.label} · клетка {position}
        </div>
        <h1 className="mt-1 text-3xl font-black">{field.name}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            Цена: <b>{field.price} $NET</b>
          </span>
          <span>
            Залог: <b>{field.mortgage} $NET</b>
          </span>
          {field.kind === 'property' && (
            <span>
              Прокачка: <b>{field.upgrade_cost} $NET</b> / уровень
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {field.kind === 'property' && (
            <section className="card">
              <h2 className="font-bold">Трафик</h2>
              <TrafficInfo field={field} />
            </section>
          )}

          <section className="card">
            <h2 className="font-bold">Рента</h2>
            {field.kind === 'property' && (
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {rentLadder(field).map((r) => (
                    <tr key={r.label} className="border-t border-navy/5">
                      <td className="py-1.5">{r.label}</td>
                      <td className="py-1.5 text-right font-semibold">{r.value} $NET</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {field.kind === 'provider' && (
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {Object.entries(catalog.providerRentTable).map(([n, v]) => (
                    <tr key={n} className="border-t border-navy/5">
                      <td className="py-1.5">{n} провайдер(а) у владельца</td>
                      <td className="py-1.5 text-right font-semibold">{v} $NET</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {field.kind === 'utility' && (
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {Object.entries(catalog.utilityMultiplier).map(([n, v]) => (
                    <tr key={n} className="border-t border-navy/5">
                      <td className="py-1.5">{n} коммуналк{n === '1' ? 'а' : 'и'} у владельца</td>
                      <td className="py-1.5 text-right font-semibold">бросок × {v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <h2 className="font-bold">💡 Как это работает в жизни</h2>
            {content ? (
              <div className="prose-edu text-[15px]">
                <ReactMarkdown>{content.body}</ReactMarkdown>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">Обучающий текст для этого поля ещё не написан.</p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <RentCalculator catalog={catalog} field={field} />
          {field.kind === 'property' && (
            <section className="card">
              <h3 className="text-sm font-bold">Группа {GROUP_META[field.group].label}</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {groupMembers(catalog, field.group).map((m) => (
                  <li key={m.id}>
                    {m.id === field.id ? (
                      <b>{m.name}</b>
                    ) : (
                      <Link className="underline decoration-navy/30 hover:decoration-navy" href={`/card/${m.id}/`}>
                        {m.name}
                      </Link>
                    )}{' '}
                    <span className="text-muted">· {m.price} $NET</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Link href="/" className="btn-ghost w-full">
            ← К доске
          </Link>
        </aside>
      </div>
    </div>
  );
}

function TrafficInfo({ field }: { field: Extract<ReturnType<typeof findField>, { kind: 'property' }> }) {
  const t = field.traffic;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {(t.role === 'generator' || t.role === 'hybrid') && (
        <li>
          🌱 <b>Генерирует +{t.rate} трафика</b> в начале каждого твоего хода.
        </li>
      )}
      {(t.role === 'converter' || t.role === 'hybrid') && (
        <li>
          💰 <b>Конвертирует {t.rate_in} трафика → {t.rate_out} $NET</b> в любой момент твоего хода.
        </li>
      )}
      {t.role === 'hybrid' && <li className="text-muted">Гибрид: и генерирует, и конвертирует.</li>}
      {t.role === 'converter' && <li className="text-muted">Сам трафик не генерирует — его нужно добыть на других полях или купить у игроков.</li>}
    </ul>
  );
}
