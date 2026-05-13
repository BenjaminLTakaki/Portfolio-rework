import ProjectCard from "./ProjectCard";

export default function ProjectGrid({ projects }) {
  return (
    <section className="w-full">
      <div className="space-y-0">
        {projects.map((project, i) => (
          <ProjectCard key={project.id} project={project} index={i} />
        ))}
      </div>
    </section>
  );
}
