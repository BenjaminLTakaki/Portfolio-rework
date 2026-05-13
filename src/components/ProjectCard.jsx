import { Link } from "react-router-dom";
import ProjectMark from "./ProjectMark";

export default function ProjectCard({ project, index }) {
  return (
    <Link
      to={`/project/${project.id}`}
      className="group grid grid-cols-1 gap-6 border-t border-ink/[0.08] py-8 transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-ink/20 md:grid-cols-[minmax(220px,0.72fr)_minmax(0,1.28fr)_auto]"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <ProjectMark project={project} />

      <div className="flex min-w-0 flex-col justify-between gap-8">
        <div>
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.24em] text-ink-faint">
            {project.category}
          </p>
          <h3 className="max-w-[10ch] text-[clamp(2rem,5vw,4.75rem)] font-light leading-[0.92] tracking-[-0.045em] text-ink transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:text-ink/68">
            {project.title}
          </h3>
        </div>
        <p className="max-w-[62ch] text-sm leading-[1.75] text-ink-muted">
          {project.summary || project.description}
        </p>
      </div>

      <div className="flex flex-row justify-between gap-6 md:min-w-44 md:flex-col md:items-end">
        <span className="font-mono text-[11px] text-ink-faint">{project.year}</span>
        <div className="flex max-w-52 flex-wrap justify-end gap-1.5">
          {project.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-ink/[0.1] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
