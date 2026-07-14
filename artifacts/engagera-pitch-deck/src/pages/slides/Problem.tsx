import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

export default function Problem() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Problem" />
      <HeaderRule />
      <GhostNumber n="02" />

      <h2 className="absolute top-[20vh] left-[5vw] font-display font-bold text-[4vw] tracking-tight text-primary">
        The problem
      </h2>

      <div className="absolute top-[38vh] left-[5vw] w-[68vw] flex flex-col">
        <div className="flex items-start gap-[2vw] py-[2.4vh] border-t border-white/10">
          <span className="font-mono text-[1vw] text-muted pt-[0.3vh] w-[3vw]">01</span>
          <p className="font-body text-[2.1vw] leading-snug text-primary max-w-[58vw]">
            Teams juggle separate subscriptions for ChatGPT, Claude, Gemini, and more
          </p>
        </div>
        <div className="flex items-start gap-[2vw] py-[2.4vh] border-t border-white/10">
          <span className="font-mono text-[1vw] text-muted pt-[0.3vh] w-[3vw]">02</span>
          <p className="font-body text-[2.1vw] leading-snug text-primary max-w-[58vw]">
            Switching models means switching tabs, accounts, and billing
          </p>
        </div>
        <div className="flex items-start gap-[2vw] py-[2.4vh] border-t border-b border-white/10">
          <span className="font-mono text-[1vw] text-muted pt-[0.3vh] w-[3vw]">03</span>
          <p className="font-body text-[2.1vw] leading-snug text-primary max-w-[58vw]">
            No unified view of usage, cost, or API access across providers
          </p>
        </div>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="02" />
    </div>
  );
}
