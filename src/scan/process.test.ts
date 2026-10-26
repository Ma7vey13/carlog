import { describe, expect, it } from 'vitest';
import { fitSize, isPdf, sha256Hex } from './process';

describe('scan processing helpers', () => {
  it('fits the long side into 2000 px without upscaling', () => {
    expect(fitSize(3000, 4000)).toEqual({ width: 1500, height: 2000 });
    expect(fitSize(4032, 3024)).toEqual({ width: 2000, height: 1500 });
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('hashes content with SHA-256', async () => {
    expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('recognises PDFs by type or extension', () => {
    expect(isPdf(new File([''], 'scan.PDF'))).toBe(true);
    expect(isPdf(new File([''], 'x', { type: 'application/pdf' }))).toBe(true);
    expect(isPdf(new File([''], 'photo.jpg', { type: 'image/jpeg' }))).toBe(false);
  });
});
