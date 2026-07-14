const base = import.meta.env.BASE_URL;

export function SlideHeader({ section }: { section: string }) {
  return (
    <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-[5vw] pt-[5vh]">
      <div className="flex items-center gap-[1vw]">
        <img
          src={`${base}logo.png`}
          crossOrigin="anonymous"
          alt="Engagera"
          className="w-[2.4vw] h-[2.4vw] rounded-[0.5vw] object-cover"
        />
        <span className="font-display font-bold text-[1.3vw] tracking-tight text-primary">
          Engagera
        </span>
      </div>
      <span className="font-mono text-[0.95vw] uppercase tracking-[0.15em] text-muted">
        {section}
      </span>
    </div>
  );
}

export function HeaderRule() {
  return (
    <div className="absolute top-[11vh] left-[5vw] right-[5vw] h-px bg-white/10" />
  );
}

export function GhostNumber({ n }: { n: string }) {
  return (
    <div
      className="absolute -bottom-[6vh] left-[2vw] font-display font-black text-[26vw] leading-none text-white/[0.035] select-none pointer-events-none"
      aria-hidden="true"
    >
      {n}
    </div>
  );
}

export function SlideFooter({
  date,
  preparedBy,
  thirdLabel,
  thirdValue,
}: {
  date: string;
  preparedBy: string;
  thirdLabel: string;
  thirdValue: string;
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-[5vw] pb-[4vh]">
      <div className="flex gap-[3vw]">
        <div className="flex flex-col gap-[0.4vh]">
          <span className="font-mono text-[0.75vw] uppercase tracking-[0.15em] text-muted">
            Date
          </span>
          <span className="font-mono text-[0.9vw] text-primary/80">
            {date}
          </span>
        </div>
        <div className="flex flex-col gap-[0.4vh]">
          <span className="font-mono text-[0.75vw] uppercase tracking-[0.15em] text-muted">
            Prepared By
          </span>
          <span className="font-mono text-[0.9vw] text-primary/80">
            {preparedBy}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-[0.4vh] items-end">
        <span className="font-mono text-[0.75vw] uppercase tracking-[0.15em] text-muted">
          {thirdLabel}
        </span>
        <span className="font-mono text-[0.9vw] text-primary/80">
          {thirdValue}
        </span>
      </div>
    </div>
  );
}
