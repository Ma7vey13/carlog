import { createContext, useContext, useLayoutEffect } from 'react';

export interface PageHeader {
  title: string;
  /** Hash href for the back arrow, e.g. `#/history`. */
  backHref?: string | undefined;
}

export const PageHeaderContext = createContext<(header: PageHeader | null) => void>(() => {});

/** Lets a nested screen (visit card, editor) replace the app bar title and add a back arrow. */
export function usePageHeader(title: string, backHref?: string) {
  const setHeader = useContext(PageHeaderContext);
  useLayoutEffect(() => {
    setHeader({ title, backHref });
    return () => setHeader(null);
  }, [setHeader, title, backHref]);
}
