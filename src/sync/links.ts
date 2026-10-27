// Where the app is published decides the default data repository and the docs links:
// https://<owner>.github.io/carlog/ → <owner>/carlog-data, docs at github.com/<owner>/carlog.

export function pagesOwner(): string | null {
  const host = globalThis.location?.hostname ?? '';
  return host.endsWith('.github.io') ? host.slice(0, -'.github.io'.length) : null;
}

export function defaultDataRepo(): string {
  const owner = pagesOwner();
  return owner ? `${owner}/carlog-data` : '';
}

/** Owner guide on GitHub, e.g. docsUrl('04-sync.md', 'если-токен-истёк'). */
export function docsUrl(file: string, anchor?: string): string {
  const owner = pagesOwner() ?? 'Ma7vey13';
  return `https://github.com/${owner}/carlog/blob/main/docs/${file}${anchor ? `#${anchor}` : ''}`;
}

export function guessDeviceName(): string {
  const nav = globalThis.navigator as (Navigator & { userAgentData?: { mobile?: boolean } }) | undefined;
  const mobile = nav?.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(nav?.userAgent ?? '');
  return mobile ? 'Телефон' : 'Компьютер';
}
