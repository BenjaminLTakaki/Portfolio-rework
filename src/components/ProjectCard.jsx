import { useState } from "react";
import { Link } from "react-router-dom";
import ProjectMark from "./ProjectMark";

export default function ProjectCard({ project }) {
  const [hovered, setHovered] = useState(false);
  return (
    <article className="project-row" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <Link to={`/project/${project.id}`} aria-label={`Explore ${project.title}`} className="project-art-link" tabIndex={-1}><ProjectMark project={project} hovered={hovered} /></Link>
      <div className="project-row-copy">
        <div className="flex flex-wrap justify-between gap-3"><p className="eyebrow">{project.category}</p><span className="eyebrow">{project.year}</span></div>
        <h3><Link to={`/project/${project.id}`}>{project.title} <span aria-hidden="true">↗</span></Link></h3>
        <p className="text-sm leading-relaxed text-ink-muted max-w-prose">{project.summary}</p>
        <div className="flex flex-wrap gap-2 mt-5">{project.tags.slice(0, 4).map((tag) => <span key={tag} className="project-tag">{tag}</span>)}</div>
        <div className="flex flex-wrap items-center gap-6 mt-5"><Link to={`/project/${project.id}`} className="text-link">Explore project →</Link>{project.source && <a href={project.source} target="_blank" rel="noreferrer" className="text-link">View code ↗<span className="sr-only"> for {project.title}</span></a>}</div>
      </div>
    </article>
  );
}
