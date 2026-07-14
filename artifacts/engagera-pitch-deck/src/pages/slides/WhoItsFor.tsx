import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

export default function WhoItsFor() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Audience" />
      <HeaderRule />
      <GhostNumber n="10" />

      <h2 className="absolute top-[20vh] left-[5vw] font-display font-bold text-[3.8vw] tracking-tight text-primary">
        Who it's for
      </h2>

      <div className="absolute top-[42vh] left-[5vw] w-[75vw] grid grid-cols-3 gap-[3vw]">
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">01</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Individuals who want the best model for every task, without juggling five apps
          </p>
        </div>
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">02</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Teams that need shared visibility into AI spend
          </p>
        </div>
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">03</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Developers building on top of multiple models through one API
          </p>
        </div>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="10" />
    </div>
  );
}
