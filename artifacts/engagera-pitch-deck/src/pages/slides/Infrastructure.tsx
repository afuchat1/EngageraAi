import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

export default function Infrastructure() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Architecture" />
      <HeaderRule />
      <GhostNumber n="11" />

      <h2 className="absolute top-[20vh] left-[5vw] font-display font-bold text-[3.4vw] tracking-tight text-primary max-w-[75vw]">
        Built on modern, serverless infrastructure
      </h2>

      <div className="absolute top-[40vh] left-[5vw] w-[68vw] flex flex-col">
        <div className="flex items-start gap-[2vw] py-[2.4vh] border-t border-white/10">
          <span className="font-mono text-[1vw] text-muted pt-[0.3vh] w-[3vw]">01</span>
          <p className="font-body text-[2vw] leading-snug text-primary max-w-[58vw]">
            Supabase-backed: Postgres, auth, and storage in one platform
          </p>
        </div>
        <div className="flex items-start gap-[2vw] py-[2.4vh] border-t border-white/10">
          <span className="font-mono text-[1vw] text-muted pt-[0.3vh] w-[3vw]">02</span>
          <p className="font-body text-[2vw] leading-snug text-primary max-w-[58vw]">
            Business logic runs entirely in Supabase Edge Functions — no servers to manage
          </p>
        </div>
        <div className="flex items-start gap-[2vw] py-[2.4vh] border-t border-b border-white/10">
          <span className="font-mono text-[1vw] text-muted pt-[0.3vh] w-[3vw]">03</span>
          <p className="font-body text-[2vw] leading-snug text-primary max-w-[58vw]">
            Scales automatically with demand, with no idle infrastructure cost
          </p>
        </div>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="11" />
    </div>
  );
}
