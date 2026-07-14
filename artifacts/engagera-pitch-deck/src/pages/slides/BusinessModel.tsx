import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

export default function BusinessModel() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Business Model" />
      <HeaderRule />
      <GhostNumber n="13" />

      <h2 className="absolute top-[20vh] left-[5vw] font-display font-bold text-[3.8vw] tracking-tight text-primary">
        Business model
      </h2>

      <div className="absolute top-[40vh] left-[5vw] w-[75vw] grid grid-cols-3 gap-[3vw]">
        <div className="border border-white/12 rounded-[0.5vw] p-[2.2vw]">
          <span className="font-mono text-[0.95vw] uppercase tracking-[0.15em] text-muted">
            Individual
          </span>
          <p className="mt-[2vh] font-body text-[1.6vw] leading-snug text-primary">
            Freemium entry: guest messages convert to signed-up users
          </p>
        </div>
        <div className="border border-white/12 rounded-[0.5vw] p-[2.2vw]">
          <span className="font-mono text-[0.95vw] uppercase tracking-[0.15em] text-muted">
            Team
          </span>
          <p className="mt-[2vh] font-body text-[1.6vw] leading-snug text-primary">
            Subscription tiers for individuals and teams
          </p>
        </div>
        <div className="border border-white/12 rounded-[0.5vw] p-[2.2vw]">
          <span className="font-mono text-[0.95vw] uppercase tracking-[0.15em] text-muted">
            Developer
          </span>
          <p className="mt-[2vh] font-body text-[1.6vw] leading-snug text-primary">
            Usage-based API pricing for developers building on the platform
          </p>
        </div>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="13" />
    </div>
  );
}
