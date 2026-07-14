import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

export default function Vision() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Vision" />
      <HeaderRule />
      <GhostNumber n="16" />

      <div className="absolute inset-0 flex items-center justify-center px-[14vw]">
        <p className="font-display font-semibold text-[3.6vw] leading-[1.25] text-primary text-center">
          Engagera becomes the default front door to AI — the one interface
          people trust to route every question to the model best equipped to
          answer it.
        </p>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="16" />
    </div>
  );
}
