import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

export default function TrustControl() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Platform" />
      <HeaderRule />
      <GhostNumber n="08" />

      <h2 className="absolute top-[20vh] left-[5vw] font-display font-bold text-[3.8vw] tracking-tight text-primary max-w-[70vw]">
        Built for trust and control
      </h2>

      <div className="absolute top-[42vh] left-[5vw] w-[75vw] grid grid-cols-3 gap-[3vw]">
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">01</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Admin console: platform overview, analytics, and model management
          </p>
        </div>
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">02</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Dataset export and human reviewer tooling for quality control
          </p>
        </div>
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">03</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Account settings with granular notification and security controls
          </p>
        </div>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="08" />
    </div>
  );
}
