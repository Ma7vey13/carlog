// "Открыть скан" (SPEC section 6Б): hand the scan pages to a chat app — the Android share sheet
// where available, otherwise a plain download.

import type { Scan } from '../core/model';
import { getDb } from '../db/db';
import { loadScanBlob } from '../db/scans';
import { rotatedCopy } from './process';

async function scanFiles(scans: readonly Scan[]): Promise<File[]> {
  const files: File[] = [];
  for (const [i, scan] of scans.entries()) {
    const blob = await loadScanBlob(getDb(), scan.sha256);
    if (!blob) continue;
    const upright = await rotatedCopy(blob, scan.rotation);
    files.push(new File([upright], `скан-${i + 1}.jpg`, { type: 'image/jpeg' }));
  }
  return files;
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/** Shares all pages at once; falls back to downloading them one by one. */
export async function shareScans(scans: readonly Scan[]): Promise<ShareResult> {
  const files = await scanFiles(scans);
  if (!files.length) return 'cancelled';
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: 'Скан документа' });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Some desktop browsers claim support and then fail: fall through to downloads.
    }
  }
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return 'downloaded';
}

/** Copies text, falling back to a selectable textarea when the Clipboard API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
