import { describe, expect, it } from 'vitest';
import { extractTableText, parseDelimited, readTableFile, readXlsx } from './table';
import { createZip } from './zip';

const enc = new TextEncoder();

describe('delimited text', () => {
  it('reads cells pasted from Excel (tabs) and trims them', () => {
    expect(parseDelimited('Название\tКм\tМес\r\nМасло двигателя\t10 000\t12\r\n\r\n')).toEqual([
      ['Название', 'Км', 'Мес'],
      ['Масло двигателя', '10 000', '12'],
    ]);
  });

  it('reads CSV with semicolons, quotes and commas inside cells', () => {
    expect(parseDelimited('Название;Ключевые слова\n"Масло ""Total""";"замена масла, двигатель"\n')).toEqual([
      ['Название', 'Ключевые слова'],
      ['Масло "Total"', 'замена масла, двигатель'],
    ]);
    expect(parseDelimited('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('takes the table out of a chat answer', () => {
    expect(extractTableText('Вот таблица:\n```csv\na;b\n1;2\n```\nГотово.')).toBe('a;b\n1;2\n');
    expect(extractTableText('a;b')).toBe('a;b');
  });
});

describe('xlsx', () => {
  const xlsx = (sheet: string, shared: string[]) =>
    createZip([
      { name: 'xl/workbook.xml', data: enc.encode('<workbook><sheets><sheet name="ТО" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode('<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>') },
      { name: 'xl/sharedStrings.xml', data: enc.encode(`<sst>${shared.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`) },
      { name: 'xl/worksheets/sheet1.xml', data: enc.encode(`<worksheet><sheetData>${sheet}</sheetData></worksheet>`) },
    ]);

  it('reads shared strings, numbers, inline strings and skipped cells', async () => {
    const file = xlsx(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
        '<row r="3"><c r="A3" t="inlineStr"><is><t>Масло &amp; фильтр</t></is></c><c r="B3"><v>10000</v></c><c r="C3" t="str"><f>A1</f><v>12</v></c></row>',
      ['Название', 'Мес'],
    );
    expect(await readXlsx(file)).toEqual([
      ['Название', '', 'Мес'],
      ['Масло & фильтр', '10000', '12'],
    ]);
    expect(await readTableFile('regulation.xlsx', file)).toHaveLength(2);
  });

  it('explains files it cannot read', async () => {
    await expect(readXlsx(enc.encode('plain text'))).rejects.toThrow('не похож на таблицу Excel');
    await expect(readTableFile('old.xls', enc.encode('x'))).rejects.toThrow('.xls не поддерживается');
    expect(await readTableFile('t.csv', enc.encode('﻿a;b\n1;2'))).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});
