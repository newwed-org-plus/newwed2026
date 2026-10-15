import Link from "next/link";
import { InstitutionalHeader } from "./InstitutionalHeader";
import { institutionalProjects, type InstitutionalProjectId } from "../projects";
import { waLink } from "../contact";

export function ProjectPage({ projectId }: { projectId: InstitutionalProjectId }) {
  const project = institutionalProjects[projectId];
  return (
    <div className="nw-home nw-project-page">
      <InstitutionalHeader currentProject={projectId} />
      <main>
        <section className="nw-detail-hero" aria-labelledby="project-title">
          <div className="nw-detail-copy">
            <Link className="nw-back-link" href="/#projetos">← Todos os projetos</Link>
            <p className="nw-eyebrow">{project.name} · {project.eyebrow}</p>
            <h1 id="project-title">{project.title}</h1>
            <p className="nw-detail-description">{project.description}</p>
            <div className="nw-detail-actions">
              <a className="nw-button nw-button-dark" href="#contato">{project.primary}</a>
              <a className="nw-button nw-button-light-outline" href={project.secondary.href}>{project.secondary.label}</a>
            </div>
          </div>
          <img className="nw-detail-image" src={project.image} alt={project.imageAlt} />
        </section>
        <section className="nw-detail-section" aria-labelledby="project-overview">
          <p className="nw-eyebrow">{project.intro}</p>
          <h2 id="project-overview">{project.heading}</h2>
          <div className="nw-detail-grid">
            {project.pillars.map((pillar, index) => (
              <article key={pillar.title}>
                <span className="nw-eyebrow">{String(index + 1).padStart(2, "0")}</span>
                <h3>{pillar.title}</h3>
                <p>{pillar.description}</p>
              </article>
            ))}
          </div>
        </section>
        {projectId === "feira" && (
          <section className="nw-numbers" aria-label="A feira em números">
            <div className="nw-numbers-inner">
              {[["2016", "Desde"], ["+5 mil", "Visitantes por edição"], ["+100", "Expositores"], ["+8 milhões", "Em contratos movimentados"]].map(([value, label]) => (
                <div className="nw-number" key={label}><strong>{value}</strong><span>{label}</span></div>
              ))}
            </div>
          </section>
        )}
        {"formats" in project && (
          <section className="nw-detail-section nw-detail-formats" id="formatos" aria-labelledby="project-formats">
            <p className="nw-eyebrow">Formatos de participação</p>
            <h2 id="project-formats">{project.formatsHeading}</h2>
            <div className="nw-detail-grid">
              {project.formats.map((format) => (
                <article key={format.title}><h3>{format.title}</h3><p>{format.description}</p></article>
              ))}
            </div>
          </section>
        )}
        <section className="nw-detail-contact" id="contato" aria-labelledby="project-contact">
          <p className="nw-eyebrow">Fale com a equipe · {project.name}</p>
          <h2 id="project-contact">{project.closing}</h2>
          <p>{project.closingDescription}</p>
          <a className="nw-button nw-button-dark" href={waLink(`Olá! Gostaria de informações sobre ${project.name}.`)} target="_blank" rel="noopener noreferrer">{project.contact}</a>
        </section>
      </main>
      <footer className="nw-footer">
        <span>© 2026 Grupo New Wed</span>
        <Link href="/#projetos">Todos os projetos</Link>
        <span>Recife · Pernambuco</span>
      </footer>
    </div>
  );
}
