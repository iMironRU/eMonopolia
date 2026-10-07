'use client';
import { useEffect, useState } from 'react';
import { useGame } from '@/lib/store';

/** Подхватывает партию из localStorage после монтирования (без SSR-рассинхрона). */
export function StoreHydrator() {
  useEffect(() => {
    void useGame.persist.rehydrate();
  }, []);
  return null;
}

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useGame.persist.hasHydrated()) setHydrated(true);
    return useGame.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
