/**
 * Resolves a small favicon image for a page URL via Google's public favicon
 * service — no API key needed, works for virtually any domain. Used so
 * links in chat can be represented by a clickable site icon instead of
 * ever showing the raw URL as text.
 */
export function faviconSrc(url: string, size = 64): string | null {
  try {
    const { hostname } = new URL(url);
    return `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(hostname)}`;
  } catch {
    return null;
  }
}
