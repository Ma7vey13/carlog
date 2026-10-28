import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, createZip, readZip, ZipError } from './zip';

const enc = new TextEncoder();

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('round-trips files with Cyrillic names and binary data', async () => {
    const bin = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
    const zip = createZip([
      { name: 'backup.json', data: enc.encode('{"ок":true}') },
      { name: 'scans/ab.jpg', data: bin },
      { name: 'пусто.txt', data: new Uint8Array() },
    ]);
    const files = await readZip(zip);
    expect(files.map((f) => f.name)).toEqual(['backup.json', 'scans/ab.jpg', 'пусто.txt']);
    expect(new TextDecoder().decode(files[0]!.data)).toBe('{"ок":true}');
    expect(files[1]!.data).toEqual(bin);
    expect(files[2]!.data.length).toBe(0);
  });

  it('reads deflated entries (an archive re-zipped by another tool)', async () => {
    const text = enc.encode('сжатый текст '.repeat(200));
    const zip = createZip([{ name: 'a.txt', data: text }]);
    // Turn the stored entry into a deflated one by hand.
    const packed = new Uint8Array(deflateRawSync(text));
    const nameLen = 5;
    const local = zip.slice(0, 30 + nameLen);
    const lv = new DataView(local.buffer);
    lv.setUint16(8, 8, true);
    lv.setUint32(18, packed.length, true);
    const cdStart = 30 + nameLen + text.length;
    const cd = zip.slice(cdStart, cdStart + 46 + nameLen);
    const cv = new DataView(cd.buffer);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, packed.length, true);
    const end = zip.slice(zip.length - 22);
    const ev = new DataView(end.buffer);
    ev.setUint32(16, local.length + packed.length, true);
    const rebuilt = new Uint8Array([...local, ...packed, ...cd, ...end]);
    const files = await readZip(rebuilt);
    expect(files[0]!.data).toEqual(text);
  });

  it('explains broken files', async () => {
    await expect(readZip(enc.encode('not a zip'))).rejects.toThrow(ZipError);
    const zip = createZip([{ name: 'a.txt', data: enc.encode('hello') }]);
    zip[30 + 5] ^= 0xff; // flip a data byte
    await expect(readZip(zip)).rejects.toThrow('Файл «a.txt» в архиве повреждён');
  });
});
