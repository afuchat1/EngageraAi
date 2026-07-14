import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

export default function Security() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Security" />
      <HeaderRule />
      <GhostNumber n="12" />

      <h2 className="absolute top-[20vh] left-[5vw] font-display font-bold text-[3.8vw] tracking-tight text-primary">
        Security by design
      </h2>

      <div className="absolute top-[40vh] left-[5vw] w-[68vw] flex flex-col">
        <div className="flex items-start gap-[2vw] py-[2.4vh] border-t border-white/10">
          <span className="font-mono text-[1vw] text-muted pt-[0.3vh] w-[3vw]">01</span>
          <p className="font-body text-[2vw] leading-snug text-primary max-w-[58vw]">
            Row-level security enforced at the database layer
          </p>
        </div>
        <div className="flex items-start gap-[2vw] py-[2.4vh] border-t border-white/10">
          <span className="font-mono text-[1vw] text-muted pt-[0.3vh] w-[3vw]">02</span>
          <p className="font-body text-[2vw] leading-snug text-primary max-w-[58vw]">
            Guest sessions are isolated and rate-limited before sign-up
          </p>
        </div>
        <div className="flex items-start gap-[2vw] py-[2.4vh] border-t border-b border-white/10">
          <span className="font-mono text-[1vw] text-muted pt-[0.3vh] w-[3vw]">03</span>
          <p className="font-body text-[2vw] leading-snug text-primary max-w-[58vw]">
            Admin and reviewer roles are permission-gated separately from regular users
          </p>
        </div>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="12" />
    </div>
  );
}
