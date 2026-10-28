// Where the app is published decides the default data repository and the docs links:
// https://<owner>.github.io/carlog/ → <owner>/carlog-data. Guides are built in (features/help).

export function pagesOwner(): string | null {
  const host = globalThis.location?.hostname ?? '';
  return host.endsWith('.github.io') ? host.slice(0, -'.github.io'.length) : null;
}

export function defaultDataRepo(): string {
  const owner = pagesOwner();
  return owner ? `${owner}/carlog-data` : '';
}

export function guessDeviceName(): string {
  const nav = globalThis.navigator as (Navigator & { userAgentData?: { mobile?: boolean } }) | undefined;
  const mobile = nav?.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(nav?.userAgent ?? '');
  return mobile ? 'Телефон' : 'Компьютер';
}
