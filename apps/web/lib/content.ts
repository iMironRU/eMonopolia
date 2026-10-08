// Обучающий контент из content/{lang}/properties/{id}.md
import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { REPO_ROOT } from './data';

export interface FieldContent {
  property: string;
  edition: string;
  /** markdown без frontmatter и без первого H1 (имя поля уже в шапке карточки) */
  body: string;
}

export function getFieldContent(id: string, lang = 'ru'): FieldContent | null {
  const file = join(REPO_ROOT, 'content', lang, 'properties', `${id}.md`);
  if (!existsSync(file)) return null;
  const { data, content } = matter(readFileSync(file, 'utf8'));
  const body = content.replace(/^\s*#\s+.*\n/, '').trim();
  return {
    property: String(data.property ?? id),
    edition: String(data.edition ?? 'all'),
    body,
  };
}
