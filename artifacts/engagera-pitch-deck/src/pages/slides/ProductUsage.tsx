import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

export default function ProductUsage() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Product — Analytics" />
      <HeaderRule />
      <GhostNumber n="05" />

      <h2 className="absolute top-[20vh] left-[5vw] font-display font-bold text-[3.6vw] tracking-tight text-primary max-w-[70vw]">
        Product tour — Usage &amp; analytics
      </h2>

      <div className="absolute top-[42vh] left-[5vw] w-[75vw] grid grid-cols-3 gap-[3vw]">
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">01</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Token usage dashboard: total tokens, requests, input/output breakdown
          </p>
        </div>
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">02</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Usage-over-time chart and model distribution chart
          </p>
        </div>
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">03</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Full visibility into cost drivers, per model and per day
          </p>
        </div>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="05" />
    </div>
  );
}
