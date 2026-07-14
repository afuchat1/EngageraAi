import { SlideHeader, HeaderRule, GhostNumber, SlideFooter } from '@/components/SlideChrome';

const base = import.meta.env.BASE_URL;

export default function ProductChat() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <SlideHeader section="Product — Chat" />
      <HeaderRule />
      <GhostNumber n="04" />

      <div className="absolute top-[18vh] left-[5vw] w-[36vw] h-[64vh] rounded-[0.6vw] border border-white/12 overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.5)]">
        <img
          src={`${base}screenshot-chat.jpg`}
          crossOrigin="anonymous"
          alt="Engagera chat interface"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="absolute top-[20vh] right-[5vw] w-[38vw]">
        <h2 className="font-display font-bold text-[3.4vw] tracking-tight text-primary leading-tight">
          Product tour — Chat
        </h2>
        <div className="mt-[4vh] flex flex-col gap-[3vh]">
          <p className="font-body text-[1.7vw] leading-snug text-muted">
            Clean, focused chat interface — "How can I help you today?"
          </p>
          <p className="font-body text-[1.7vw] leading-snug text-muted">
            Model picker with per-model speed and quality ratings
          </p>
          <p className="font-body text-[1.7vw] leading-snug text-muted">
            Conversation history, saved and searchable
          </p>
          <p className="font-body text-[1.7vw] leading-snug text-muted">
            Guest mode: 5 free messages before sign-up
          </p>
        </div>
      </div>

      <SlideFooter date="July 2026" preparedBy="Engagera Team" thirdLabel="Page" thirdValue="04" />
    </div>
  );
}
