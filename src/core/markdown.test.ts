import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, slugify, type Block, type List } from './markdown';

describe('slugify', () => {
  it('matches GitHub anchors for Russian headings', () => {
    expect(slugify('Шаг 1. Создать токен GitHub')).toBe('шаг-1-создать-токен-github');
    expect(slugify('Если токен истёк')).toBe('если-токен-истёк');
    expect(slugify('Что лежит в carlog-data')).toBe('что-лежит-в-carlog-data');
  });
});

describe('parseInline', () => {
  it('handles bold, italic, code, links and bare URLs', () => {
    expect(parseInline('Нажмите **Settings** → *No license*, `github_` и [инструкция](01-github-repos.md), https://github.com.')).toEqual([
      { type: 'text', text: 'Нажмите ' },
      { type: 'strong', children: [{ type: 'text', text: 'Settings' }] },
      { type: 'text', text: ' → ' },
      { type: 'em', children: [{ type: 'text', text: 'No license' }] },
      { type: 'text', text: ', ' },
      { type: 'code', text: 'github_' },
      { type: 'text', text: ' и ' },
      { type: 'link', href: '01-github-repos.md', children: [{ type: 'text', text: 'инструкция' }] },
      { type: 'text', text: ', ' },
      { type: 'link', href: 'https://github.com', children: [{ type: 'text', text: 'https://github.com' }] },
      { type: 'text', text: '.' },
    ]);
  });
});

describe('parseMarkdown', () => {
  it('builds headings, paragraphs, nested lists and tables', () => {
    const blocks = parseMarkdown(['# Заголовок', '', 'Абзац', 'в две строки.', '', '1. Первый', '   - вложенный', '2. Второй', '', '| A | B |', '| --- | --- |', '| 1 | **2** |'].join('\n'));
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'table']);
    expect((blocks[1] as Extract<Block, { type: 'paragraph' }>).content).toEqual([{ type: 'text', text: 'Абзац в две строки.' }]);
    const list = blocks[2] as List;
    expect(list.ordered).toBe(true);
    expect(list.items).toHaveLength(2);
    expect(list.items[0]!.children).toMatchObject({ ordered: false, items: [{ content: [{ type: 'text', text: 'вложенный' }] }] });
    expect(blocks[3]).toMatchObject({ type: 'table', rows: [[[{ type: 'text', text: '1' }], [{ type: 'strong' }]]] });
  });

  it('parses every owner guide without losing text', () => {
    for (const file of ['01-github-repos.md', '02-github-pages.md', '03-install.md', '04-sync.md']) {
      const text = readFileSync(new URL(`../../docs/${file}`, import.meta.url), 'utf8');
      const blocks = parseMarkdown(text);
      expect(blocks[0]?.type, file).toBe('heading');
      expect(blocks.length, file).toBeGreaterThan(5);
    }
    const sync = parseMarkdown(readFileSync(new URL('../../docs/04-sync.md', import.meta.url), 'utf8'));
    const ids = sync.filter((b) => b.type === 'heading').map((b) => (b as { id: string }).id);
    expect(ids).toEqual(expect.arrayContaining(['шаг-1-создать-токен-github', 'если-токен-истёк', 'если-забыли-пароль']));
  });
});
