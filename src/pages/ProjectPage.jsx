import { useParams, Link, Navigate } from "react-router-dom";
import ProjectMark from "../components/ProjectMark";
import { projects } from "../data/projects";

export default function ProjectPage() {
  const { id } = useParams();
  const project = projects.find((p) => p.id === id);
  const currentIndex = projects.findIndex((p) => p.id === id);
  const prev = projects[currentIndex - 1];
  const next = projects[currentIndex + 1];

  if (!project) return <Navigate to="/" replace />;

  return (
    <main className="pt-28 pb-24 px-6 lg:px-12 max-w-screen-xl mx-auto">
      <Link
        to="/"
        className="mb-16 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-ink"
      >
        <span className="text-base leading-none">{"<-"}</span>
        All projects
      </Link>

      <div className="mb-14 grid grid-cols-1 items-end gap-10 lg:grid-cols-[1.08fr_0.92fr]">
        <div>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.26em] text-ink-muted">
            {project.category}
          </p>
          <h1 className="max-w-[11ch] text-[clamp(2.6rem,7vw,6.4rem)] font-light tracking-[-0.055em] leading-[0.9] text-ink">
            {project.title}
          </h1>
          {project.metric && (
            <p className="mt-6 font-mono text-[11px] text-ink-muted">
              <span className="text-ink font-medium">{project.metric}</span>
            </p>
          )}
          {project.url && (
            <Link
              to={project.url}
              className="mt-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted border border-ink/20 px-4 py-2.5 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-ink hover:border-ink/40"
            >
              View Live
              <span className="text-base leading-none">{"->"}</span>
            </Link>
          )}
        </div>
        <div className="lg:translate-y-6">
          <ProjectMark project={project} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-12 border-t border-ink/[0.08] pt-12 lg:grid-cols-[2fr_1fr]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint mb-4">
            Overview
          </p>
          <p className="text-base leading-[1.75] text-ink font-light max-w-prose">
            {project.description}
          </p>
        </div>

        <div className="space-y-10">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint mb-4">
              Stack
            </p>
            <div className="flex flex-wrap gap-2">
              {(project.stack || project.tags).map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-ink/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-muted"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          {project.concepts && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint mb-4">
                Key concepts
              </p>
              <ul className="space-y-3">
                {project.concepts.map((concept) => (
                  <li
                    key={concept}
                    className="grid grid-cols-[1.5rem_1fr] text-[13px] leading-snug text-ink-muted"
                  >
                    <span className="font-mono text-[10px] text-ink-faint">/</span>
                    {concept}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-ink/[0.07] my-16" />
      <div className="flex items-center justify-between gap-8">
        {prev ? (
          <Link to={`/project/${prev.id}`} className="group flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
              {"<- Prev"}
            </span>
            <span className="text-sm font-medium text-ink transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:text-ink-muted">
              {prev.title}
            </span>
          </Link>
        ) : (
          <div />
        )}
        {next ? (
          <Link
            to={`/project/${next.id}`}
            className="group flex flex-col gap-1.5 text-right"
          >
            <span className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
              {"Next ->"}
            </span>
            <span className="text-sm font-medium text-ink transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:text-ink-muted">
              {next.title}
            </span>
          </Link>
        ) : (
          <div />
        )}
      </div>
    </main>
  );
}
