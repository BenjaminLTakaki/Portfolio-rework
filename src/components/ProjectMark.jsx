const motifs = {
  wave: "M12 52 C26 26, 42 78, 58 52 S90 26, 104 52",
  orbit: "M22 64 C36 28, 84 28, 98 64 C84 100, 36 100, 22 64Z",
  stack: "M26 36 H98 M26 64 H86 M26 92 H74",
  pulse: "M18 68 H38 L48 36 L64 100 L76 56 H106",
  lens: "M28 72 C42 34, 86 34, 100 72 M36 72 C50 48, 78 48, 92 72",
  grid: "M30 34 H94 V98 H30 Z M62 34 V98 M30 66 H94",
};

export default function ProjectMark({ project, compact = false }) {
  const logo = project.logo || {};
  const motif = motifs[logo.motif] || motifs.orbit;

  if (project.cover) {
    return (
      <div
        className={[
          "relative isolate overflow-hidden rounded-[1.75rem] bg-bg-card ring-1 ring-ink/[0.08]",
          compact ? "h-16 w-16 rounded-[1.25rem]" : "min-h-[220px] w-full",
        ].join(" ")}
      >
        <img
          src={project.cover}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.035]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(26,26,24,0)_40%,rgba(26,26,24,0.36))]" />
        <div className="absolute inset-2 rounded-[calc(1.75rem-0.5rem)] ring-1 ring-white/25" />
        <div className="absolute bottom-5 left-5 font-mono text-[11px] uppercase tracking-[0.2em] text-bg">
          {logo.code || project.title.slice(0, 2)}
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "relative isolate overflow-hidden rounded-[1.75rem]",
        "bg-[oklch(92%_0.012_82)] ring-1 ring-ink/[0.08]",
        compact ? "h-16 w-16 rounded-[1.25rem]" : "min-h-[220px] w-full",
      ].join(" ")}
      style={{
        "--mark": logo.mark || "#7f745f",
        "--wash": logo.wash || "#d8d0c2",
      }}
      aria-hidden="true"
    >
      <div className="absolute inset-2 rounded-[calc(1.75rem-0.5rem)] bg-[linear-gradient(135deg,var(--wash),rgba(232,230,225,0.72))] shadow-[inset_0_1px_0_rgba(255,255,255,0.58)]" />
      <svg
        viewBox="0 0 128 128"
        className="absolute inset-0 h-full w-full p-7 text-[color:var(--mark)] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.035]"
        fill="none"
      >
        <path
          d={motif}
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.78"
        />
      </svg>
      <div className="absolute bottom-5 left-5 font-mono text-[11px] uppercase tracking-[0.2em] text-ink/55">
        {logo.code || project.title.slice(0, 2)}
      </div>
    </div>
  );
}
