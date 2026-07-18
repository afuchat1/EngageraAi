/**
 * BrowserContext
 *
 * Global singleton for the in-app browser. Any component anywhere in the app
 * can call `useBrowser().open(url)` to show a URL in the InAppBrowser without
 * needing to lift state or pass callbacks through props.
 *
 * The InAppBrowser itself is mounted once at the root layout so it sits above
 * all screens and can be summoned from any route.
 */
import React, { createContext, useCallback, useContext, useState } from 'react';
import { InAppBrowser } from '@/components/InAppBrowser';

interface BrowserContextValue {
  /** Open a URL in the in-app browser. Pass null/empty string to close. */
  open: (url: string) => void;
  close: () => void;
}

const BrowserContext = createContext<BrowserContextValue>({
  open: () => {},
  close: () => {},
});

export function BrowserProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);

  const open = useCallback((u: string) => {
    if (!u) return;
    // Ensure the URL has a scheme
    const normalised = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    setUrl(normalised);
  }, []);

  const close = useCallback(() => setUrl(null), []);

  return (
    <BrowserContext.Provider value={{ open, close }}>
      {children}
      {/* Mounted here so it floats above every screen */}
      <InAppBrowser
        url={url}
        onClose={close}
        // If the user types a non-URL in the address bar while the browser was
        // opened from outside the search engine, just navigate to a search.
        onSearchFallback={(q) => {
          setUrl(`https://www.google.com/search?q=${encodeURIComponent(q)}`);
        }}
      />
    </BrowserContext.Provider>
  );
}

/** Hook — call this anywhere to get `open(url)` and `close()`. */
export function useBrowser(): BrowserContextValue {
  return useContext(BrowserContext);
}
