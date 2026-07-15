/**
 * AfuBot finance — crawls real finance sites/outlets (Yahoo Finance, CNBC,
 * MarketWatch, Investopedia, etc. from the seed directory) directly and
 * ranks the pages against the query, plus pulls in matching AfuBot news.
 *
 * There is no third-party quote/search API here — every result is a page
 * AfuBot actually fetched. Free quote-data providers we evaluated (Stooq,
 * Yahoo's quote API) either required a key, blocked unauthenticated access,
 * or returned bot-challenge pages, so live tick-by-tick quotes are not
 * offered; the crawl-based context below stays honest about that.
 */
import { crawl, toWebResults } from "./crawler";
import { fetchAfuBotNews } from "./news";

export async function fetchAfuBotFinance(query: string) {
  const [pages, news] = await Promise.all([
    crawl(`${query} stock market`),
    fetchAfuBotNews(`${query} stock`, 5),
  ]);

  const webResults = toWebResults(pages, 8).map((r) => ({
    kind: "web" as const,
    title: r.title,
    url: r.url,
    description: r.description,
    thumbnail: r.thumbnail,
    source: (() => {
      try {
        return new URL(r.url).hostname;
      } catch {
        return "";
      }
    })(),
    age: r.age,
  }));

  const newsResults = news.map((n) => ({
    kind: "news" as const,
    title: n.title,
    url: n.url,
    description: n.description,
    thumbnail: n.thumbnail,
    source: n.source,
    age: n.age,
  }));

  // Interleave news ahead of general web context — it's usually more timely.
  return [...newsResults, ...webResults];
}
