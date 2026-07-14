import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

const base = import.meta.env.BASE_URL;

export default function Title() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Pitch Deck" />
      <HeaderRule />
      <GhostNumber n="01" />

      <div className="absolute top-[20vh] left-[5vw] w-[46vw]">
        <h1 className="font-display font-black text-[7.2vw] leading-[0.95] tracking-tight text-primary text-wrap:balance">
          Engagera
        </h1>
        <p className="mt-[3vh] font-body text-[2.1vw] leading-snug text-muted max-w-[40vw]">
          One chat interface. Every leading AI model.
        </p>
      </div>

      <div className="absolute top-[18vh] right-[5vw] w-[38vw] h-[62vh] rounded-[0.6vw] border border-white/12 overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.5)]">
        <img
          src={`${base}screenshot-chat.jpg`}
          crossOrigin="anonymous"
          alt="Engagera chat interface"
          className="w-full h-full object-cover"
        />
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Status" thirdValue="Confidential" />
    </div>
  );
}
