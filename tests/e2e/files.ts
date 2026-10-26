// Test files generated on the fly: the repo must not contain scans or images (SPEC section 14).
import type { Page } from '@playwright/test';

/** A JPEG "scan" drawn in the browser. */
export async function makeJpeg(page: Page, text: string, width = 1240, height = 1754): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ text, width, height }) => {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#111';
      ctx.font = '64px sans-serif';
      ctx.fillText(text, 80, 160);
      for (let y = 300; y < height - 100; y += 60) ctx.fillRect(80, y, width - 160, 3);
      return c.toDataURL('image/jpeg', 0.9);
    },
    { text, width, height },
  );
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

/** A minimal valid multi-page PDF with one line of Latin text per page. */
export function makePdf(texts: string[]): Buffer {
  const objs: string[] = [];
  const pageIds = texts.map((_, i) => 4 + i * 2);
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${texts.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  texts.forEach((t, i) => {
    const p = 4 + i * 2;
    const stream = `BT /F1 48 Tf 72 700 Td (${t}) Tj ET`;
    objs[p] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${p + 1} 0 R >>`;
    objs[p + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

export const jsonFile = (name: string, value: unknown) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value), 'utf8') });
