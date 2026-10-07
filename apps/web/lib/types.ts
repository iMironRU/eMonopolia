// Типы данных, зеркалящие data/*.yaml. Единственный источник истины — YAML,
// здесь только описание его формы для TypeScript.

export type Group =
  | 'brown'
  | 'light_blue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'dark_blue';

export type TrafficRole = 'generator' | 'converter' | 'hybrid';

export interface Traffic {
  role: TrafficRole;
  /** единиц трафика за ход (generator / hybrid) */
  rate?: number;
  /** сколько трафика сжигается за одну конвертацию (converter / hybrid) */
  rate_in?: number;
  /** сколько $NET даёт одна конвертация (converter / hybrid) */
  rate_out?: number;
}

export interface Rent {
  base: number;
  with_monopoly: number;
  with_hosting: [number, number, number, number];
  with_datacenter: number;
}

export interface Property {
  kind: 'property';
  id: string;
  name: string;
  group: Group;
  category: string;
  price: number;
  mortgage: number;
  rent: Rent;
  upgrade_cost: number;
  traffic: Traffic;
}

export interface Provider {
  kind: 'provider';
  id: string;
  name: string;
  price: number;
  mortgage: number;
}

export interface Utility {
  kind: 'utility';
  id: string;
  name: string;
  category: string;
  price: number;
  mortgage: number;
}

export type Field = Property | Provider | Utility;

export type Cell =
  | { position: number; type: 'corner'; subtype: 'start' | 'jail' | 'free_parking' | 'go_to_jail'; name: string }
  | { position: number; type: 'property' | 'provider' | 'utility'; ref: string }
  | { position: number; type: 'card'; deck: 'chance' | 'chest' }
  | { position: number; type: 'tax'; name: string; amount: number };

export type CardActionType =
  | 'pay_bank'
  | 'receive_bank'
  | 'go_to_jail'
  | 'lose_traffic'
  | 'gain_traffic'
  | 'pay_per_hosting'
  | 'move_to'
  | 'move_to_nearest'
  | 'collect_from_each'
  | 'skip_turn'
  | 'double_next_rent';

export interface Card {
  id: string;
  title: string;
  text: string;
  action: {
    type: CardActionType;
    amount?: number;
    target?: string;
    multiplier?: number;
    count?: number;
  };
}

export interface BoardMeta {
  size: number;
  start_position: number;
  pass_start_bonus: number;
}

/** Полный каталог игры, собранный из data/ на этапе сборки. */
export interface Catalog {
  board: BoardMeta;
  cells: Cell[];
  properties: Property[];
  providers: Provider[];
  providerRentTable: Record<number, number>;
  utilities: Utility[];
  utilityMultiplier: Record<number, number>;
  chance: Card[];
  chest: Card[];
}
