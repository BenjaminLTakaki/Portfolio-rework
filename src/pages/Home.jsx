import { lazy, Suspense, useEffect, useRef, useState } from "react";
import ProjectGrid from "../components/ProjectGrid";
import { projects, places, skills } from "../data/projects";

const Globe = lazy(() => import("../components/Globe"));

function Divider() {
  return <div className="h-px bg-ink/[0.07] mx-6 lg:mx-12" />;
}

function RevealSection({ className, children, id }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      id={id}
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(18px)",
        transition: "opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {children}
    </section>
  );
}

export default function Home() {
  useEffect(() => {
    const target = sessionStorage.getItem("scrollTo");
    if (!target) return;
    sessionStorage.removeItem("scrollTo");
    const el = document.getElementById(target);
    if (!el) return;
    const t = setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="overflow-x-hidden">
      <section className="pt-32 pb-20 px-6 lg:px-12 max-w-screen-xl mx-auto animate-fade-up">
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-ink-muted mb-6">
          ICT Student / AI/ML Developer / Fontys University
        </p>
        <h1 className="text-[clamp(2.1rem,5.5vw,3.75rem)] font-light leading-[1.06] tracking-[-0.025em] text-ink max-w-3xl text-balance">
          Building systems that
          <br />
          <span className="text-ink-muted">listen, learn, and ship.</span>
        </h1>
        <div className="mt-10 flex flex-wrap gap-4">
          <a
            href="https://github.com/BenjaminLTakaki"
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-ink text-bg px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-ink/85 active:scale-[0.98]"
          >
            GitHub
          </a>
          <a
            href="https://linkedin.com/in/benjamin-takaki"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-ink/20 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-accent hover:bg-bg-card active:scale-[0.98]"
          >
            LinkedIn
          </a>
          <a
            href="mailto:bentakaki7@gmail.com"
            className="px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-ink"
          >
            bentakaki7@gmail.com
          </a>
        </div>
      </section>

      <Divider />

      <RevealSection className="pt-20 pb-32 px-6 lg:px-12 max-w-screen-xl mx-auto">
        <div className="mb-14 grid grid-cols-1 gap-6 md:grid-cols-[0.72fr_1.28fr_auto] md:items-end">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.26em] text-ink-muted">
            Selected Projects
          </h2>
          <p className="max-w-[54ch] text-sm leading-[1.75] text-ink-muted">
            A lean project index with dedicated marks, short technical context, and enough room for each system to be read without visual noise.
          </p>
          <span className="font-mono text-[11px] text-ink-faint md:text-right">
            {projects.length} projects
          </span>
        </div>
        <ProjectGrid projects={projects} />
      </RevealSection>

      <Divider />

      <RevealSection className="py-24 px-6 lg:px-12 max-w-screen-xl mx-auto">
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-ink-muted mb-14">
          Skills
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-10 gap-x-8">
          {skills.map((group) => (
            <div key={group.label}>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint mb-4">
                {group.label}
              </p>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item} className="text-sm text-ink/75 leading-none">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </RevealSection>

      <Divider />

      <RevealSection id="about" className="py-28 px-6 lg:px-12 max-w-screen-xl mx-auto">
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-ink-muted mb-12">
          About
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[5fr_4fr] gap-10 mb-8">
          <p className="text-[1.0625rem] leading-[1.75] font-light text-ink max-w-prose">
            ICT student at Fontys University of Applied Sciences, specialising in
            Machine Learning and AI. 3+ years building production-ready applications,
            from guitar transcription with CNNs to full-stack LLM platforms.
          </p>
          <div className="space-y-4 text-[0.9375rem] leading-[1.75] text-ink-muted">
            <p>
              Previously: International French Baccalaureate with Honours at
              Lycee Francais International de Tokyo.
            </p>
            <p>English C2 / French C2 / Japanese B1 / Dutch A1.</p>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
          <div className="border border-ink/[0.08] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint mb-3">Undergraduate</p>
            <p className="text-sm font-medium text-ink leading-snug">Bachelor of ICT</p>
            <p className="text-[13px] text-ink-muted mt-1">Fontys University / 2024 to Present</p>
          </div>
          <div className="border border-ink/[0.08] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint mb-3">Secondary</p>
            <p className="text-sm font-medium text-ink leading-snug">International French Baccalaureate, Honours</p>
            <p className="text-[13px] text-ink-muted mt-1">Lycee Francais International de Tokyo / 2024</p>
          </div>
        </div>

        <div className="mt-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-ink-faint mb-10">
            Places lived
          </p>
          <Suspense
            fallback={
              <div className="h-[420px] flex items-center justify-center">
                <span className="font-mono text-[11px] text-ink-faint uppercase tracking-widest">
                  Loading globe...
                </span>
              </div>
            }
          >
            <Globe places={places} />
          </Suspense>
        </div>
      </RevealSection>

      <Divider />

      <footer className="max-w-screen-xl mx-auto px-6 lg:px-12 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <span className="font-mono text-[11px] text-ink-faint">
          Copyright 2026 Benjamin Takaki
        </span>
        <div className="flex flex-wrap gap-6">
          <a
            href="mailto:bentakaki7@gmail.com"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-ink"
          >
            Email
          </a>
          <a
            href="https://github.com/BenjaminLTakaki"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-ink"
          >
            GitHub
          </a>
          <a
            href="https://linkedin.com/in/benjamin-takaki"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-ink"
          >
            LinkedIn
          </a>
        </div>
      </footer>
    </main>
  );
}
