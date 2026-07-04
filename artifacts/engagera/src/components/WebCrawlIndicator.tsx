import { Link } from "lucide-react";

function domain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url.slice(0, 40); }
}

interface WebCrawlIndicatorProps {
  urls: string[];
}

export function WebCrawlIndicator({ urls }: WebCrawlIndicatorProps) {
  if (!urls.length) return null;
  return (
    <div className="mb-2.5 flex flex-wrap gap-1.5">
      {urls.map((url, i) => (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-none border border-white/20 bg-white/5 hover:bg-white/10 transition-colors w-fit max-w-xs"
        >
          <Link className="h-3 w-3 text-white shrink-0" />
          <span className="text-[11px] text-white/60 font-medium truncate">
            Read:&nbsp;
            <span className="text-white font-semibold">{domain(url)}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
