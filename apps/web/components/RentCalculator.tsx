'use client';
import { useState } from 'react';
import type { Catalog, Field } from '@/lib/types';
import { HOSTING_LEVELS, MAX_LEVEL, propertyRent, providerRent, utilityRent } from '@/lib/rules';

/** Калькулятор ренты для одного поля: выбираешь ситуацию — получаешь сумму. */
export function RentCalculator({ catalog, field }: { catalog: Catalog; field: Field }) {
  const [monopoly, setMonopoly] = useState(false);
  const [level, setLevel] = useState(0);
  const [mortgaged, setMortgaged] = useState(false);
  const [count, setCount] = useState(1);
  const [dice, setDice] = useState(7);

  let rent = 0;
  if (field.kind === 'property') rent = propertyRent(field, { monopoly: monopoly || level > 0, level, mortgaged });
  if (field.kind === 'provider') rent = mortgaged ? 0 : providerRent(catalog, count);
  if (field.kind === 'utility') rent = mortgaged ? 0 : utilityRent(catalog, count, dice);

  return (
    <section className="card space-y-3">
      <h3 className="text-sm font-bold">🧮 Калькулятор ренты</h3>

      {field.kind === 'property' && (
        <>
          <label className="block text-sm">
            <span className="text-muted">Прокачка хостинга</span>
            <select className="input mt-1" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {HOSTING_LEVELS.map((name, i) => (
                <option key={i} value={i}>
                  {i === 0 ? name : `${i}. ${name}`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={monopoly || level > 0} disabled={level > 0} onChange={(e) => setMonopoly(e.target.checked)} />
            Владелец собрал всю группу
          </label>
        </>
      )}

      {field.kind === 'provider' && (
        <label className="block text-sm">
          <span className="text-muted">Провайдеров у владельца</span>
          <select className="input mt-1" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}

      {field.kind === 'utility' && (
        <>
          <label className="block text-sm">
            <span className="text-muted">Коммуналок у владельца</span>
            <select className="input mt-1" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted">Выпало на кубиках: {dice}</span>
            <input type="range" min={2} max={12} value={dice} onChange={(e) => setDice(Number(e.target.value))} className="mt-1 w-full" />
          </label>
        </>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={mortgaged} onChange={(e) => setMortgaged(e.target.checked)} />
        Поле заложено
      </label>

      <div className="rounded-lg bg-navy p-3 text-center text-white">
        <div className="text-xs uppercase tracking-wider opacity-70">Гость платит</div>
        <div className="text-2xl font-black">{rent} $NET</div>
        {field.kind === 'property' && level === MAX_LEVEL && <div className="text-xs opacity-70">максимальная прокачка</div>}
      </div>
    </section>
  );
}
