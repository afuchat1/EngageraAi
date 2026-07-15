/**
 * AfuBot seed directory — real, independent websites AfuBot crawls directly.
 *
 * This is not a proxy for any third-party search engine. AfuBot decides
 * which of these sites are relevant to a query, fetches their HTML itself,
 * follows links, and ranks the results with its own scoring — no Bing,
 * Google, Brave, or DuckDuckGo API calls anywhere in this pipeline.
 */

export interface Seed {
  name: string;
  host: string;
  url: string;
  category:
    | "news"
    | "tech"
    | "business"
    | "sports"
    | "entertainment"
    | "science"
    | "reference"
    | "gaming"
    | "health";
  keywords: string[];
}

export const SEEDS: Seed[] = [
  // Reference / general knowledge
  { name: "Wikipedia", host: "en.wikipedia.org", url: "https://en.wikipedia.org/wiki/Main_Page", category: "reference", keywords: ["wiki", "wikipedia", "encyclopedia", "definition", "who is", "what is", "history of"] },
  { name: "Britannica", host: "www.britannica.com", url: "https://www.britannica.com", category: "reference", keywords: ["encyclopedia", "history", "biography"] },
  { name: "Investopedia", host: "www.investopedia.com", url: "https://www.investopedia.com", category: "business", keywords: ["investing", "finance", "economics", "definition", "stock", "market"] },

  // News
  { name: "BBC News", host: "www.bbc.com", url: "https://www.bbc.com/news", category: "news", keywords: ["news", "world", "breaking"] },
  { name: "NPR", host: "www.npr.org", url: "https://www.npr.org", category: "news", keywords: ["news", "us", "politics", "culture"] },
  { name: "Al Jazeera", host: "www.aljazeera.com", url: "https://www.aljazeera.com", category: "news", keywords: ["news", "world", "middle east"] },
  { name: "Reuters", host: "www.reuters.com", url: "https://www.reuters.com", category: "news", keywords: ["news", "world", "business"] },
  { name: "AP News", host: "apnews.com", url: "https://apnews.com", category: "news", keywords: ["news", "world", "breaking"] },

  // Tech
  { name: "TechCrunch", host: "techcrunch.com", url: "https://techcrunch.com", category: "tech", keywords: ["tech", "startup", "app", "ai", "software"] },
  { name: "The Verge", host: "www.theverge.com", url: "https://www.theverge.com", category: "tech", keywords: ["tech", "gadget", "review", "ai", "phone"] },
  { name: "Ars Technica", host: "arstechnica.com", url: "https://arstechnica.com", category: "tech", keywords: ["tech", "science", "security", "software"] },
  { name: "Wired", host: "www.wired.com", url: "https://www.wired.com", category: "tech", keywords: ["tech", "culture", "science", "gear"] },
  { name: "Engadget", host: "www.engadget.com", url: "https://www.engadget.com", category: "tech", keywords: ["tech", "gadget", "review"] },
  { name: "GitHub Blog", host: "github.blog", url: "https://github.blog", category: "tech", keywords: ["developer", "code", "programming", "open source"] },
  { name: "Stack Overflow", host: "stackoverflow.com", url: "https://stackoverflow.com/questions", category: "tech", keywords: ["programming", "code", "error", "developer", "how to"] },
  { name: "MDN Web Docs", host: "developer.mozilla.org", url: "https://developer.mozilla.org/en-US/", category: "tech", keywords: ["javascript", "css", "html", "web", "api", "developer"] },

  // Business / finance
  { name: "CNBC", host: "www.cnbc.com", url: "https://www.cnbc.com", category: "business", keywords: ["stock", "market", "finance", "economy", "business"] },
  { name: "MarketWatch", host: "www.marketwatch.com", url: "https://www.marketwatch.com", category: "business", keywords: ["stock", "market", "finance", "investing"] },
  { name: "Yahoo Finance", host: "finance.yahoo.com", url: "https://finance.yahoo.com", category: "business", keywords: ["stock", "market", "finance", "quote", "ticker"] },
  { name: "Forbes", host: "www.forbes.com", url: "https://www.forbes.com", category: "business", keywords: ["business", "money", "billionaire", "entrepreneur"] },

  // Sports
  { name: "ESPN", host: "www.espn.com", url: "https://www.espn.com", category: "sports", keywords: ["sports", "football", "basketball", "score", "game", "nfl", "nba"] },
  { name: "BBC Sport", host: "www.bbc.com", url: "https://www.bbc.com/sport", category: "sports", keywords: ["sports", "football", "soccer", "score"] },
  { name: "Sky Sports", host: "www.skysports.com", url: "https://www.skysports.com", category: "sports", keywords: ["sports", "football", "soccer", "score"] },

  // Entertainment
  { name: "Rolling Stone", host: "www.rollingstone.com", url: "https://www.rollingstone.com", category: "entertainment", keywords: ["music", "celebrity", "movie", "culture"] },
  { name: "IMDb", host: "www.imdb.com", url: "https://www.imdb.com", category: "entertainment", keywords: ["movie", "film", "actor", "tv show", "cast", "rating"] },
  { name: "Variety", host: "variety.com", url: "https://variety.com", category: "entertainment", keywords: ["movie", "hollywood", "celebrity", "box office"] },
  { name: "Pitchfork", host: "pitchfork.com", url: "https://pitchfork.com", category: "entertainment", keywords: ["music", "album", "review", "artist"] },

  // Science
  { name: "Scientific American", host: "www.scientificamerican.com", url: "https://www.scientificamerican.com", category: "science", keywords: ["science", "research", "space", "health", "biology", "physics"] },
  { name: "NASA", host: "www.nasa.gov", url: "https://www.nasa.gov", category: "science", keywords: ["space", "nasa", "planet", "rocket", "astronomy"] },
  { name: "Nature News", host: "www.nature.com", url: "https://www.nature.com/news", category: "science", keywords: ["science", "research", "study", "biology"] },

  // Gaming
  { name: "IGN", host: "www.ign.com", url: "https://www.ign.com", category: "gaming", keywords: ["game", "gaming", "review", "playstation", "xbox", "nintendo"] },
  { name: "Polygon", host: "www.polygon.com", url: "https://www.polygon.com", category: "gaming", keywords: ["game", "gaming", "review"] },

  // Health
  { name: "Mayo Clinic", host: "www.mayoclinic.org", url: "https://www.mayoclinic.org", category: "health", keywords: ["health", "symptom", "disease", "medicine", "treatment"] },
  { name: "WebMD", host: "www.webmd.com", url: "https://www.webmd.com", category: "health", keywords: ["health", "symptom", "disease", "medicine"] },
];

/** Static fallback ticker map for common companies (used by the Finance tab). */
export const TICKER_MAP: Record<string, string> = {
  apple: "AAPL.US",
  tesla: "TSLA.US",
  google: "GOOGL.US",
  alphabet: "GOOGL.US",
  microsoft: "MSFT.US",
  amazon: "AMZN.US",
  meta: "META.US",
  facebook: "META.US",
  netflix: "NFLX.US",
  nvidia: "NVDA.US",
  intel: "INTC.US",
  amd: "AMD.US",
  disney: "DIS.US",
  coinbase: "COIN.US",
  uber: "UBER.US",
  spotify: "SPOT.US",
  boeing: "BA.US",
  walmart: "WMT.US",
  starbucks: "SBUX.US",
};

/** Real news outlets' own official RSS feeds — read directly, not via a search aggregator. */
export const NEWS_FEEDS: { source: string; url: string }[] = [
  { source: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "NPR", url: "https://feeds.npr.org/1001/rss.xml" },
  { source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { source: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { source: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { source: "ESPN", url: "https://www.espn.com/espn/rss/news" },
  { source: "NASA", url: "https://www.nasa.gov/news-release/feed/" },
];
