#!/usr/bin/env node
// Renders PWA icons from public/icons/favicon.svg with Playwright's Chromium.
// Run after changing the SVG: `npm run icons` (needs `npx playwright install chromium`).
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const ICON_DIR = new URL('../public/icons/', import.meta.url);
const svg = readFileSync(new URL('favicon.svg', ICON_DIR), 'utf8');
const BG = '#173a63';

// `maskable`: Android crops icons to various shapes, keeping only the central 80% circle,
// so the artwork is scaled down onto a full-bleed background.
const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { file, size, maskable } of targets) {
    const inner = maskable ? Math.round(size * 0.78) : size;
    const html = `<!doctype html><html><body style="margin:0;background:${maskable ? BG : 'transparent'}">
      <div style="width:${size}px;height:${size}px;display:grid;place-items:center">
        <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
      </div></body></html>`;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(html);
    const png = await page.screenshot({ omitBackground: !maskable, clip: { x: 0, y: 0, width: size, height: size } });
    writeFileSync(new URL(file, ICON_DIR), png);
    console.log(`icons/${file} ${size}x${size}`);
  }
} finally {
  await browser.close();
}
