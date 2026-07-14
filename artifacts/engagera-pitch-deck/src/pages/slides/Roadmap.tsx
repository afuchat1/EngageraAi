import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

export default function Roadmap() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Roadmap" />
      <HeaderRule />
      <GhostNumber n="14" />

      <h2 className="absolute top-[20vh] left-[5vw] font-display font-bold text-[3.8vw] tracking-tight text-primary">
        Roadmap
      </h2>

      <div className="absolute top-[42vh] left-[5vw] w-[75vw] grid grid-cols-3 gap-[3vw]">
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">01</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Native mobile app for chat on the go
          </p>
        </div>
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">02</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Deeper analytics: cost forecasting and team-level budgets
          </p>
        </div>
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">03</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Expanded model catalog as new providers and models launch
          </p>
        </div>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="14" />
    </div>
  );
}
