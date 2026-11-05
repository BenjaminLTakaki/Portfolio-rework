import { lazy, Suspense, useEffect, useRef, useState } from "react";

const ProjectView = lazy(() => import("./ProjectScene").then((module) => ({ default: module.ProjectView })));

export default function ProjectMark({ project, hovered = false }) {
  const logo = project.logo || {};
  const root = useRef(null);
  const interaction = useRef({ x: 0, y: 0, invalidate: null });
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div
      ref={root}
      className="relative isolate min-h-[220px] w-full overflow-hidden rounded-[1.75rem] bg-[oklch(92%_0.012_82)] ring-1 ring-ink/[0.08]"
      style={{ "--wash": logo.wash || "#d8d0c2" }}
      aria-hidden="true"
    >
      <div className="absolute inset-2 rounded-[calc(1.75rem-0.5rem)] bg-[linear-gradient(135deg,var(--wash),rgba(232,230,225,0.72))]" />
      <Suspense fallback={null}><ProjectView project={project} interaction={interaction} visible={visible} reduced={reduced} /></Suspense>
      <div className="absolute bottom-5 left-5 font-mono text-[11px] uppercase tracking-[0.2em] text-ink/55">
        {logo.code || project.title.slice(0, 2)}
      </div>
    </div>
  );
}
