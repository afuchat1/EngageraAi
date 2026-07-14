import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

export default function WhereWeAre() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Status" />
      <HeaderRule />
      <GhostNumber n="15" />

      <h2 className="absolute top-[20vh] left-[5vw] font-display font-bold text-[3.8vw] tracking-tight text-primary">
        Where we are today
      </h2>

      <div className="absolute top-[40vh] left-[5vw] w-[68vw] flex flex-col">
        <div className="flex items-start gap-[2vw] py-[2.4vh] border-t border-white/10">
          <span className="font-mono text-[1vw] text-muted pt-[0.3vh] w-[3vw]">—</span>
          <p className="font-body text-[2vw] leading-snug text-primary max-w-[58vw]">
            Core product is live: chat, guest mode, dashboard, usage analytics, API keys, docs
          </p>
        </div>
        <div className="flex items-start gap-[2vw] py-[2.4vh] border-t border-white/10">
          <span className="font-mono text-[1vw] text-muted pt-[0.3vh] w-[3vw]">—</span>
          <p className="font-body text-[2vw] leading-snug text-primary max-w-[58vw]">
            Admin and reviewer tooling in place for quality and moderation
          </p>
        </div>
        <div className="flex items-start gap-[2vw] py-[2.4vh] border-t border-b border-white/10">
          <span className="font-mono text-[1vw] text-muted pt-[0.3vh] w-[3vw]">—</span>
          <p className="font-body text-[2vw] leading-snug text-primary max-w-[58vw]">
            Ready to onboard early users and gather product feedback
          </p>
        </div>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="15" />
    </div>
  );
}
