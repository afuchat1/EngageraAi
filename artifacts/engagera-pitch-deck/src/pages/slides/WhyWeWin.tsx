import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

export default function WhyWeWin() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Differentiation" />
      <HeaderRule />
      <GhostNumber n="09" />

      <h2 className="absolute top-[20vh] left-[5vw] font-display font-bold text-[3.8vw] tracking-tight text-primary">
        Why Engagera wins
      </h2>

      <div className="absolute top-[40vh] left-[5vw] w-[75vw] grid grid-cols-2 gap-x-[4vw] gap-y-[4vh]">
        <div className="flex items-start gap-[1.4vw] border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted w-[2.4vw]">01</span>
          <p className="font-body text-[1.8vw] leading-snug text-primary max-w-[30vw]">
            Model-agnostic — never locked into one provider's roadmap or pricing
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw] border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted w-[2.4vw]">02</span>
          <p className="font-body text-[1.8vw] leading-snug text-primary max-w-[30vw]">
            Usage transparency competitors don't offer
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw] border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted w-[2.4vw]">03</span>
          <p className="font-body text-[1.8vw] leading-snug text-primary max-w-[30vw]">
            Guest-first onboarding removes the signup wall to first value
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw] border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted w-[2.4vw]">04</span>
          <p className="font-body text-[1.8vw] leading-snug text-primary max-w-[30vw]">
            Developer-ready from day one via first-class API keys
          </p>
        </div>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="09" />
    </div>
  );
}
