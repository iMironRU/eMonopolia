import type { Metadata } from 'next';
import { getCatalog } from '@/lib/data';
import { GameScreen } from '@/components/GameScreen';

export const metadata: Metadata = { title: 'Партия' };

export default function GamePage() {
  return <GameScreen catalog={getCatalog()} />;
}
