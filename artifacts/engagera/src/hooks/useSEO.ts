import { useEffect } from "react";

interface SEOOptions {
  title: string;
  description?: string;
  path?: string;
}

const DEFAULT_TITLE = "Engagera — AI Platform by AfuAI | AfuChat Technologies";
const DEFAULT_DESCRIPTION =
  "Engagera is an advanced AI platform built by AfuAI, the AI division of AfuChat Technologies Limited. Chat with a powerful AI assistant, access developer APIs, and build AI-powered products. Trained and owned by the AfuAI team.";
const SITE_URL = "https://engagera.afuchat.com";

function setMetaByName(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaByProperty(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Updates document.title and the description/canonical/OG/Twitter meta tags
 * for the current route, then restores the site-wide defaults on unmount.
 * Engagera is a single-page app, so every route otherwise inherits the same
 * <title>/meta from index.html -- this gives public routes (docs, sign-in,
 * sign-up, etc.) their own distinct, crawlable metadata.
 */
export function useSEO({ title, description, path = "/" }: SEOOptions) {
  useEffect(() => {
    const desc = description ?? DEFAULT_DESCRIPTION;
    const url = `${SITE_URL}${path === "/" ? "/" : path}`;

    document.title = title;
    setMetaByName("description", desc);
    setCanonical(url);

    setMetaByProperty("og:title", title);
    setMetaByProperty("og:description", desc);
    setMetaByProperty("og:url", url);

    setMetaByName("twitter:title", title);
    setMetaByName("twitter:description", desc);

    return () => {
      document.title = DEFAULT_TITLE;
      setMetaByName("description", DEFAULT_DESCRIPTION);
      setCanonical(SITE_URL);
      setMetaByProperty("og:title", DEFAULT_TITLE);
      setMetaByProperty("og:description", DEFAULT_DESCRIPTION);
      setMetaByProperty("og:url", SITE_URL);
      setMetaByName("twitter:title", DEFAULT_TITLE);
      setMetaByName("twitter:description", DEFAULT_DESCRIPTION);
    };
  }, [title, description, path]);
}
