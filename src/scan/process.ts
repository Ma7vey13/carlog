// Turning picked files into compressed scan pages (SPEC section 3): long side ~2000 px,
// JPEG 0.8 (DECISIONS D-005). PDFs are rendered page by page with pdf.js, loaded on demand.

import type { ProcessedPage } from '../db/scans';

export const MAX_SIDE = 2000;
export const JPEG_QUALITY = 0.8;

export class ScanError extends Error {}

/** Size that fits into `max` on the long side; never upscales. */
export function fitSize(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ScanError('Не удалось сжать изображение'))), 'image/jpeg', JPEG_QUALITY),
  );
}

async function finish(canvas: HTMLCanvasElement): Promise<ProcessedPage> {
  const blob = await canvasToJpeg(canvas);
  return { blob, mime: 'image/jpeg', width: canvas.width, height: canvas.height, sha256: await sha256Hex(blob) };
}

/** Photo → one page. EXIF orientation is applied, so phone photos come out upright. */
export async function processImage(file: Blob): Promise<ProcessedPage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ScanError(
      'Не удалось открыть изображение. Если это фото в формате HEIC, переключите камеру на JPEG (в настройках камеры — «Совместимость» или «Формат: JPEG») или сделайте снимок кнопкой «Сфотографировать».',
    );
  }
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return finish(canvas);
}

/** PDF → one page per PDF page. pdf.js is loaded only when a PDF is picked. */
export async function processPdf(file: Blob, onPage?: (done: number, total: number) => void): Promise<ProcessedPage[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
  // useWasm: false keeps pdf.js on its JavaScript decoders, so the CSP needs no 'wasm-unsafe-eval'.
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useWasm: false });
  const pages: ProcessedPage[] = [];
  try {
    let pdf;
    try {
      pdf = await task.promise;
    } catch {
      throw new ScanError('Не удалось открыть PDF. Возможно, файл повреждён или защищён паролем.');
    }
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: MAX_SIDE / Math.max(base.width, base.height) });
      const canvas = makeCanvas(Math.round(viewport.width), Math.round(viewport.height));
      await page.render({ canvas, viewport }).promise;
      pages.push(await finish(canvas));
      page.cleanup();
      onPage?.(i, pdf.numPages);
    }
  } finally {
    await task.destroy();
  }
  return pages;
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/** Files in the order picked → pages in the same order (a multi-page PDF expands in place). */
export async function processFiles(files: readonly File[], onProgress?: (message: string) => void): Promise<ProcessedPage[]> {
  const pages: ProcessedPage[] = [];
  for (const [i, file] of files.entries()) {
    const label = files.length > 1 ? `Файл ${i + 1} из ${files.length}: ` : '';
    if (isPdf(file)) {
      onProgress?.(`${label}открываю PDF…`);
      pages.push(...(await processPdf(file, (done, total) => onProgress?.(`${label}страница ${done} из ${total}`))));
    } else if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      onProgress?.(`${label}сжимаю фото…`);
      pages.push(await processImage(file));
    } else {
      throw new ScanError(`«${file.name}» — не фото и не PDF`);
    }
  }
  return pages;
}

/** The stored page turned by `rotation` degrees clockwise, as a new JPEG (for sharing to a chat). */
export async function rotatedCopy(blob: Blob, rotation: 0 | 90 | 180 | 270): Promise<Blob> {
  if (rotation === 0) return blob;
  const bitmap = await createImageBitmap(blob);
  const quarter = rotation === 90 || rotation === 270;
  const canvas = makeCanvas(quarter ? bitmap.height : bitmap.width, quarter ? bitmap.width : bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  return canvasToJpeg(canvas);
}
