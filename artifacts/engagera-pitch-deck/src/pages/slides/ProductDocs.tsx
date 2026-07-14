import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

const base = import.meta.env.BASE_URL;

export default function ProductDocs() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Product — Docs" />
      <HeaderRule />
      <GhostNumber n="07" />

      <div className="absolute top-[20vh] left-[5vw] w-[38vw]">
        <h2 className="font-display font-bold text-[3.4vw] tracking-tight text-primary leading-tight">
          Product tour — Docs
        </h2>
        <div className="mt-[4vh] flex flex-col gap-[3vh]">
          <p className="font-body text-[1.7vw] leading-snug text-muted">
            In-product documentation with live model comparisons
          </p>
          <p className="font-body text-[1.7vw] leading-snug text-muted">
            Speed and quality ratings for every supported model
          </p>
          <p className="font-body text-[1.7vw] leading-snug text-muted">
            Code samples for direct API integration
          </p>
        </div>
      </div>

      <div className="absolute top-[18vh] right-[5vw] w-[36vw] h-[64vh] rounded-[0.6vw] border border-white/12 overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.5)]">
        <img
          src={`${base}screenshot-docs.jpg`}
          crossOrigin="anonymous"
          alt="Engagera developer documentation"
          className="w-full h-full object-cover"
        />
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="07" />
    </div>
  );
}
