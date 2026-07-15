/**
 * Search — powered entirely by AfuBot, Engagera's own web crawler.
 *
 * No third-party search API is used anywhere here. AfuBot picks which
 * real sites to visit from its own seed directory (src/lib/afubot/seeds.ts),
 * fetches their HTML directly, follows relevant links, and scores/ranks
 * the pages itself. See src/lib/afubot/crawler.ts for the crawl logic.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { crawl, toWebResults, toImageResults, toVideoResults, looksLikeDomain } from "../lib/afubot/crawler";
import { fetchAfuBotNews } from "../lib/afubot/news";
import { fetchAfuBotFinance } from "../lib/afubot/finance";
import { SEEDS } from "../lib/afubot/seeds";

const router: IRouter = Router();

// GET /api/search/resolve?q=...
// Lets the client check whether the input is a bare domain (e.g. "afuchat.com")
// that should be opened directly instead of searched.
router.get("/search/resolve", (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim();
  const domainUrl = looksLikeDomain(q);
  return res.json({ domainUrl });
});

// GET /api/search/suggestions?q=...
router.get("/search/suggestions", (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim().toLowerCase();
  if (!q || q.length < 2) return res.json({ suggestions: [] });

  const suggestions = new Set<string>();
  for (const seed of SEEDS) {
    if (seed.name.toLowerCase().startsWith(q)) suggestions.add(seed.name);
    for (const kw of seed.keywords) {
      if (kw.startsWith(q) && kw !== q) suggestions.add(kw);
    }
  }
  return res.json({ suggestions: Array.from(suggestions).slice(0, 8) });
});

// GET /api/search/web?q=...
router.get("/search/web", async (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q) return res.json({ results: [] });
  const pages = await crawl(q);
  return res.json({ results: toWebResults(pages) });
});

// GET /api/search/images?q=...
router.get("/search/images", async (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q) return res.json({ results: [] });
  const pages = await crawl(q);
  return res.json({ results: toImageResults(pages) });
});

// GET /api/search/videos?q=...
router.get("/search/videos", async (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q) return res.json({ results: [] });
  const pages = await crawl(q);
  return res.json({ results: toVideoResults(pages) });
});

// GET /api/search/news?q=...
router.get("/search/news", async (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q) return res.json({ results: [] });
  const results = await fetchAfuBotNews(q);
  return res.json({ results });
});

// GET /api/search/finance?q=...
router.get("/search/finance", async (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q) return res.json({ results: [] });
  const results = await fetchAfuBotFinance(q);
  return res.json({ results });
});

export default router;
