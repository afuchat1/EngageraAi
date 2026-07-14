import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

export default function ProductApi() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Product — API" />
      <HeaderRule />
      <GhostNumber n="06" />

      <h2 className="absolute top-[20vh] left-[5vw] font-display font-bold text-[3.6vw] tracking-tight text-primary max-w-[70vw]">
        Product tour — Developer API
      </h2>

      <div className="absolute top-[42vh] left-[5vw] w-[75vw] grid grid-cols-3 gap-[3vw]">
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">01</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Create and manage API keys directly from the dashboard
          </p>
        </div>
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">02</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Programmatic access to the same multi-model routing
          </p>
        </div>
        <div className="border-t border-white/10 pt-[2.4vh]">
          <span className="font-mono text-[1vw] text-muted">03</span>
          <p className="mt-[1.4vh] font-body text-[1.7vw] leading-snug text-primary">
            Revoke or rotate keys anytime — full self-service control
          </p>
        </div>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="06" />
    </div>
  );
}
