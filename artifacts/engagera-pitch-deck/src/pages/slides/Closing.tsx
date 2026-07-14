import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

export default function Closing() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Contact" />
      <HeaderRule />
      <GhostNumber n="17" />

      <div className="absolute top-[30vh] left-[5vw] w-[70vw]">
        <h2 className="font-display font-black text-[5.2vw] leading-[1] tracking-tight text-primary">
          Let's talk
        </h2>
        <p className="mt-[4vh] font-body text-[2vw] leading-snug text-muted max-w-[48vw]">
          We're looking for early adopters, design partners, and
          collaborators to help shape what's next.
        </p>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="17" />
    </div>
  );
}
