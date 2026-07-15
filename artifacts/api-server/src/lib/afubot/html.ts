/**
 * Lightweight HTML parsing utilities used by AfuBot's own crawler.
 * No third-party parsing service — plain regex extraction, self-contained.
 */

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}

export function extractMeta(html: string, name: string): string | null {
  // Matches <meta name="X" content="Y"> or <meta property="X" content="Y"> in either attribute order.
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]).trim();
  }
  return null;
}

export function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export interface ExtractedLink {
  href: string;
  text: string;
}

/** Extracts same-site and cross-site anchor links with their visible text. */
export function extractLinks(html: string, baseUrl: string, maxLinks = 200): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const re = /<a\s[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && links.length < maxLinks) {
    const href = resolveUrl(m[1], baseUrl);
    const text = stripTags(m[2]);
    if (href && href.startsWith("http") && text.length > 2) {
      links.push({ href, text });
    }
  }
  return links;
}

export interface ExtractedImage {
  src: string;
  alt: string;
}

/** Extracts <img> sources, skipping obvious icons/tracking pixels. */
export function extractImages(html: string, baseUrl: string, maxImages = 40): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  const re = /<img\s[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && images.length < maxImages) {
    const tag = m[0];
    const srcMatch = tag.match(/\ssrc=["']([^"']+)["']/i) ?? tag.match(/\sdata-src=["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const rawSrc = srcMatch[1];
    if (/sprite|1x1|pixel|icon|logo|avatar|\.svg(\?|$)/i.test(rawSrc)) continue;
    const src = resolveUrl(rawSrc, baseUrl);
    if (!src) continue;
    const altMatch = tag.match(/\salt=["']([^"']*)["']/i);
    images.push({ src, alt: altMatch ? decodeEntities(altMatch[1]) : "" });
  }
  return images;
}

export interface VideoEmbed {
  platform: "youtube" | "vimeo";
  id: string;
  thumbnail: string;
  watchUrl: string;
}

/** Detects embedded YouTube/Vimeo players in a page's HTML. */
export function extractVideoEmbed(html: string): VideoEmbed | null {
  const yt = html.match(/(?:youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/watch\?v=)([\w-]{6,})/i);
  if (yt) {
    const id = yt[1];
    return {
      platform: "youtube",
      id,
      thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
    };
  }
  const vimeo = html.match(/vimeo\.com\/(?:video\/)?(\d{6,})/i);
  if (vimeo) {
    const id = vimeo[1];
    return {
      platform: "vimeo",
      id,
      thumbnail: "",
      watchUrl: `https://vimeo.com/${id}`,
    };
  }
  return null;
}

export function faviconFor(url: string): string {
  try {
    return `https://${new URL(url).hostname}/favicon.ico`;
  } catch {
    return "";
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
