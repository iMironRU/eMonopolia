import type { Metadata } from 'next';
import { getCatalog } from '@/lib/data';
import { CardDrawer } from '@/components/CardDrawer';

export const metadata: Metadata = { title: 'Шанс' };

export default function ChancePage() {
  return <CardDrawer deck="chance" catalog={getCatalog()} />;
}
