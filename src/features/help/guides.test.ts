import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMarkdown, type Block } from '../../core/markdown';
import { guideByFile, GUIDES } from './guides';

/** Every link href in a parsed guide. */
function links(blocks: Block[]): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      const v = value as { type?: string; href?: string };
      if (v.type === 'link' && typeof v.href === 'string') out.push(v.href);
      Object.values(value).forEach(walk);
    }
  };
  walk(blocks);
  return out;
}

describe('owner guide', () => {
  it('every file in docs/ is in the in-app help', () => {
    const files = readdirSync(new URL('../../../docs/', import.meta.url)).filter((f) => f.endsWith('.md'));
    expect(GUIDES.map((g) => g.file).sort()).toEqual(files.sort());
  });

  it('links between guides point to existing guides and sections', () => {
    const broken: string[] = [];
    let checked = 0;
    for (const g of GUIDES) {
      for (const href of links(parseMarkdown(g.source))) {
        if (/^https?:/.test(href)) continue;
        checked++;
        const [file, anchor] = href.split('#');
        const target = guideByFile(file!);
        if (!target) {
          broken.push(`${g.file}: ${href}`);
          continue;
        }
        if (anchor) {
          const ids = parseMarkdown(target.source).flatMap((b) => (b.type === 'heading' ? [b.id] : []));
          if (!ids.includes(anchor)) broken.push(`${g.file}: ${href}`);
        }
      }
    }
    expect(broken).toEqual([]);
    expect(checked).toBeGreaterThan(15);
  });

  it('covers what SPEC section 12 asks of the owner guide', () => {
    const all = GUIDES.map((g) => g.source).join('\n');
    for (const topic of ['Установить приложение на телефон', 'Синхронизация', 'Claude Code', 'чат-ИИ', 'Вручную', 'Если токен истёк', 'Восстановить из копии']) {
      expect(all, topic).toContain(topic);
    }
  });
});
