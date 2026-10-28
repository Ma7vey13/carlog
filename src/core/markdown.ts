// A small Markdown parser for the owner guides in docs/ shown inside the app ("Ещё → Справка").
// Covers what the guides use: headings, paragraphs, nested lists, tables, **bold**, *italic*,
// `code`, [links](url) and bare URLs. Output is a tree rendered as React elements — never HTML.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] };

export interface ListItem {
  content: Inline[];
  children: List | null;
}

export interface List {
  type: 'list';
  ordered: boolean;
  items: ListItem[];
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; id: string; content: Inline[] }
  | { type: 'paragraph'; content: Inline[] }
  | List
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] };

/** GitHub-style heading anchor: "Шаг 1. Создать токен GitHub" → "шаг-1-создать-токен-github". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

// --- inline -----------------------------------------------------------------------------------

const INLINE_RE = /\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+[^\s).,;:!?])/u;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      out.push({ type: 'text', text: rest });
      break;
    }
    if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) });
    if (m[1] !== undefined) out.push({ type: 'strong', children: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ type: 'em', children: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ type: 'code', text: m[3] });
    else if (m[4] !== undefined) out.push({ type: 'link', href: m[5]!, children: parseInline(m[4]) });
    else if (m[6] !== undefined) out.push({ type: 'link', href: m[6], children: [{ type: 'text', text: m[6] }] });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

export function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.type === 'text' || n.type === 'code' ? n.text : inlineText(n.children))).join('');
}

// --- blocks -----------------------------------------------------------------------------------

const LIST_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const TABLE_SEP_RE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function cells(line: string): Inline[][] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => parseInline(c.trim()));
}

interface RawItem {
  indent: number;
  ordered: boolean;
  text: string;
}

/** Nests list items by indentation. */
function buildList(items: RawItem[]): List {
  const root: List = { type: 'list', ordered: items[0]!.ordered, items: [] };
  const stack: Array<{ indent: number; list: List }> = [{ indent: items[0]!.indent, list: root }];
  for (const it of items) {
    while (stack.length > 1 && it.indent < stack[stack.length - 1]!.indent) stack.pop();
    let top = stack[stack.length - 1]!;
    if (it.indent > top.indent) {
      const parent = top.list.items[top.list.items.length - 1];
      if (parent) {
        parent.children ??= { type: 'list', ordered: it.ordered, items: [] };
        stack.push({ indent: it.indent, list: parent.children });
        top = stack[stack.length - 1]!;
      }
    }
    top.list.items.push({ content: parseInline(it.text), children: null });
  }
  return root;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const content = parseInline(heading[2]!.trim());
      blocks.push({ type: 'heading', level: heading[1]!.length as 1 | 2 | 3, id: slugify(inlineText(content)), content });
      i++;
      continue;
    }
    if (line.trim().startsWith('|') && TABLE_SEP_RE.test(lines[i + 1] ?? '')) {
      const header = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(cells(lines[i++]!));
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    if (LIST_RE.test(line)) {
      const items: RawItem[] = [];
      while (i < lines.length) {
        const l = lines[i]!;
        const m = LIST_RE.exec(l);
        if (m) {
          items.push({ indent: m[1]!.length, ordered: /\d/.test(m[2]!), text: m[3]! });
        } else if (l.trim() && /^\s+/.test(l) && items.length) {
          items[items.length - 1]!.text += ' ' + l.trim(); // continuation line
        } else {
          break;
        }
        i++;
      }
      blocks.push(buildList(items));
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^#{1,3}\s/.test(lines[i]!) && !LIST_RE.test(lines[i]!) && !lines[i]!.trim().startsWith('|')) {
      para.push(lines[i]!.trim());
      i++;
    }
    blocks.push({ type: 'paragraph', content: parseInline(para.join(' ')) });
  }
  return blocks;
}
