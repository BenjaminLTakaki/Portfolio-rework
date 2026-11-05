import { useEffect } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import ProjectMark from "../components/ProjectMark";
import { projects } from "../data/projects";

export default function ProjectPage() {
  const { id } = useParams();
  const index = projects.findIndex((project) => project.id === id);
  const project = projects[index];
  const next = projects[(index + 1) % projects.length];
  useEffect(() => {
    if (project) document.title = `${project.title} | Benjamin Takaki`;
    return () => { document.title = "Benjamin Takaki | Full-stack & AI/ML Developer"; };
  }, [project]);
  if (!project) return <Navigate to="/" replace />;

  return (
    <main id="main-content" className="page-container pt-28 pb-16">
      <Link to="/#work" className="text-link py-3">← All work</Link>
      <header className="case-header">
        <div>
          <p className="eyebrow">{project.category} / {project.year}</p>
          <h1>{project.title}</h1>
          <p className="text-base text-ink-muted leading-relaxed max-w-prose">{project.summary}</p>
          <div className="flex flex-wrap gap-3 mt-7">
            {project.id === "swipe-news" && <a href={project.url} className="action action-primary" target="_blank" rel="noreferrer">Open the app <span aria-hidden="true">↗</span></a>}
            {project.url && project.id !== "swipe-news" && <Link to={project.url} className="action action-primary">{project.id === "lol-forecaster" ? "Try the forecaster" : "Demo status"} <span aria-hidden="true">↗</span></Link>}
            {project.source && <a href={project.source} className="action" target="_blank" rel="noreferrer">View source code <span aria-hidden="true">↗</span></a>}
          </div>
        </div>
        <div><ProjectMark project={project} /></div>
      </header>
      <div className="case-body">
        <div>
          <section className="case-section"><p className="eyebrow mb-3">01 / The problem</p><h2>What it’s built to solve</h2><p>{project.problem}</p></section>
          <section className="case-section"><p className="eyebrow mb-3">02 / The approach</p><h2>How the pieces connect</h2><p>{project.description}</p><ol className="case-pipeline" aria-label="Project pipeline">{project.pipeline.map((step, i) => <li key={step}><span className="text-ink-muted mr-2">{String(i + 1).padStart(2, "0")}</span>{step}</li>)}</ol></section>
          <section className="case-section"><h2>Engineering decisions</h2><ul>{project.decisions.map((decision) => <li key={decision}>{decision}</li>)}</ul></section>
          <section className="case-section case-evidence"><p className="eyebrow mb-3">03 / Evidence</p><h2>What you can inspect</h2><p>{project.evidence}</p>{project.id === "lol-forecaster" && <a className="text-link mt-4" href="/forecaster/msi_2026.json" target="_blank" rel="noreferrer">Inspect the model export ↗</a>}</section>
          <section className="case-section"><h2>Limitations & next steps</h2><p>{project.limitations}</p></section>
        </div>
        <aside aria-label="Project technical details">
          <p className="eyebrow mb-4">Built with</p><div className="flex flex-wrap gap-2">{project.stack.map((item) => <span className="project-tag" key={item}>{item}</span>)}</div>
          <p className="eyebrow mt-8 mb-4">Technical focus</p><ul className="space-y-3 text-sm leading-relaxed text-ink-muted">{project.concepts.map((concept) => <li key={concept}>{concept}</li>)}</ul>
          <div className="border-t border-ink/15 mt-8 pt-6"><p className="text-sm leading-relaxed text-ink-muted">Want to discuss the implementation?</p><a className="text-link mt-3" href={`mailto:bentakaki7@gmail.com?subject=${encodeURIComponent(`Let’s talk about ${project.title}`)}`}>Get in touch →</a></div>
        </aside>
      </div>
      <nav aria-label="Project navigation" className="flex justify-between gap-8 border-t border-ink/15 pt-8 mt-8"><Link to="/#work" className="text-link">← All work</Link><Link to={`/project/${next.id}`} className="text-link text-right"><span className="eyebrow block mb-2">Next project</span>{next.title} →</Link></nav>
    </main>
  );
}
