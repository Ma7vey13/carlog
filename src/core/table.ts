// Reading a table the owner gives: CSV, cells pasted from Excel / Google Sheets (tab-separated),
// or an .xlsx file. The result is a plain grid of trimmed strings; meaning comes later
// (core/regulationTable.ts). No dependency: .xlsx is a ZIP of XML files (core/zip.ts).

import { readZip, ZipError } from './zip';

export type Grid = string[][];

/** Picks the delimiter that splits the first lines most consistently: tab, semicolon or comma. */
function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = ',';
  let bestScore = 0;
  for (const d of ['\t', ';', ',']) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const min = Math.min(...counts);
    const score = min > 0 ? min * 10 + counts.filter((c) => c === counts[0]).length : 0;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/** CSV / TSV with quotes ("a ""b"""), CRLF, and line breaks inside quoted cells. */
export function parseDelimited(text: string, delimiter = detectDelimiter(text)): Grid {
  const rows: Grid = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return tidy(rows);
}

/** Trims cells, drops empty rows and trailing empty columns. */
export function tidy(rows: Grid): Grid {
  const clean = rows.map((r) => r.map((c) => c.replace(/ /g, ' ').replace(/\s+/g, ' ').trim())).filter((r) => r.some(Boolean));
  const width = Math.max(0, ...clean.map((r) => r.reduce((w, c, i) => (c ? i + 1 : w), 0)));
  return clean.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}

/** A chat answer may wrap the table in ```csv … ``` with words around it. */
export function extractTableText(text: string): string {
  const fenced = /```[a-z]*\s*\n([\s\S]*?)```/i.exec(text);
  return fenced ? fenced[1]! : text;
}

// --- .xlsx ------------------------------------------------------------------------------------

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** All <t> runs of a shared or inline string, phonetic hints (<rPh>) excluded. */
function textOf(xml: string): string {
  const noPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  return [...noPhonetic.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]!)).join('');
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

/** First worksheet of an .xlsx workbook as a grid. Formulas give their cached values. */
export async function readXlsx(bytes: Uint8Array): Promise<Grid> {
  let files;
  try {
    files = await readZip(bytes);
  } catch {
    throw new ZipError('Файл не похож на таблицу Excel (.xlsx)');
  }
  const dec = new TextDecoder();
  const byName = new Map(files.map((f) => [f.name, dec.decode(f.data)]));

  // The first sheet in workbook order, via its relationship id.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const workbook = byName.get('xl/workbook.xml');
  const rels = byName.get('xl/_rels/workbook.xml.rels');
  const firstRid = workbook && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  if (firstRid && rels) {
    const target = new RegExp(`<Relationship\\b[^>]*Id="${firstRid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstRid}"`).exec(rels)?.[1];
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheet = byName.get(sheetPath) ?? [...byName.entries()].find(([n]) => /^xl\/worksheets\/[^/]+\.xml$/.test(n))?.[1];
  if (!sheet) throw new ZipError('В файле Excel не найден лист с таблицей');

  const shared = [...(byName.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!));
  const rows: Grid = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNo = Number(/\br="(\d+)"/.exec(rowMatch[1]!)?.[1] ?? rows.length + 1) - 1;
    const row: string[] = [];
    let next = 0;
    for (const c of rowMatch[2]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const inner = c[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(inner);
      else if (v !== undefined) value = decodeXml(v);
      row[col] = value;
    }
    rows[rowNo] = Array.from({ length: row.length }, (_, i) => row[i] ?? '');
  }
  return tidy(Array.from({ length: rows.length }, (_, i) => rows[i] ?? []));
}

/** Any supported file → grid. */
export async function readTableFile(name: string, bytes: Uint8Array): Promise<Grid> {
  if (/\.xlsx$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return readXlsx(bytes);
  if (/\.xls$/i.test(name)) throw new ZipError('Старый формат .xls не поддерживается: сохраните таблицу как .xlsx или CSV');
  return parseDelimited(new TextDecoder().decode(bytes).replace(/^﻿/, ''));
}
