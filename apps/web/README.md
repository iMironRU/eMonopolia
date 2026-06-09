# apps/web — Веб-приложение eMonopolia

**Статус:** не начато (фаза 1).

## Технологии

- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- Static export для деплоя на GitHub Pages

## Что должно делать в MVP

- Сканировать QR-код с поля → показать карточку с обучающим контентом
- Калькулятор ренты (с учётом монополий и прокачки)
- Учёт денег и трафика игроков (localStorage)
- Подтверждение сделок всеми игроками (эмуляция консенсуса)
- Карточки Шанса и Казны (выпадают случайно при сканировании QR с пачки)

## Как запустить (TODO)

```bash
cd apps/web
npm install
npm run dev
```

## Структура (план)

```
apps/web/
├── app/                  # App Router
│   ├── card/[id]/        # страница каждого поля по ID
│   ├── chance/           # карточки Шанса
│   ├── chest/            # карточки Казны
│   ├── game/             # экран текущей партии
│   └── page.tsx          # лендинг
├── components/
├── lib/
│   ├── data.ts           # импорт YAML
│   └── game-state.ts     # стейт партии
└── public/
```

## Загрузка данных

Данные читаются из `../../data/*.yaml` на этапе сборки:

```typescript
import { readFileSync } from 'fs';
import { load } from 'js-yaml';

const properties = load(readFileSync('../../data/properties.yaml', 'utf-8'));
```
