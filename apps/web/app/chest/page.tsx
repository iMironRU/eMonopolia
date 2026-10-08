import type { Metadata } from 'next';
import { getCatalog } from '@/lib/data';
import { CardDrawer } from '@/components/CardDrawer';

export const metadata: Metadata = { title: 'Общественная казна' };

export default function ChestPage() {
  return <CardDrawer deck="chest" catalog={getCatalog()} />;
}
