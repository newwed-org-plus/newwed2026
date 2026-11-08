import { redirect } from "next/navigation";
import { Instagram } from "lucide-react";
import { INSTAGRAM_URL, WHATSAPP_URL } from "@/features/institutional/contact";
import { InstitutionalHeader } from "@/features/institutional/components/InstitutionalHeader";

import {homeProjects as projects} from "@/content/home-projects";

function HomeContent() {
  return (
    <main className="nw-home">
      <section className="nw-hero" aria-labelledby="nw-hero-title">
        <InstitutionalHeader />

        <div className="nw-hero-content">
          <h1 id="nw-hero-title">
            O maior ecossistema de conexões para o mercado de casamentos do Nordeste.
          </h1>
          <p>FamTours · Feira · Workshop · Guia</p>
          <a className="nw-button nw-button-dark" href="#projetos">Conheça nossos projetos</a>
        </div>
      </section>

      <section className="nw-projects" id="projetos" aria-labelledby="nw-projects-title">
        <div className="nw-section-heading">
          <h2 id="nw-projects-title">Nosso ecossistema</h2>
          <p>Quatro plataformas. Um propósito: conectar, fortalecer e impulsionar o mercado de casamentos.</p>
        </div>
        <div className="nw-project-grid">
          {projects.map((project) => (
            <article className="nw-project-card" id={project.id} key={project.id}>
              <img src={project.image} alt="" width={1080} height={1920} loading="lazy" />
              <div className="nw-project-copy">
                {project.id === "feira" && <img className="nw-project-brand" src="/assets/brand/feira-tendencia-negativo.png" alt="" loading="lazy" />}
                <h3 className="sr-only">New Wed {project.name}</h3>
                <div className="nw-project-bottom">
                  <p>{project.description}</p>
                  <a href={project.href} className="nw-button nw-button-outline" aria-label={project.id === "destinos" ? "Conheça o FAMTOUR New Wed Destinos" : `Conheça New Wed ${project.name}`}>
                    {project.id === "destinos" ? "Conheça o FAMTOUR" : "Conheça o projeto"}
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="nw-home-partners" aria-labelledby="nw-home-partners-title">
        <h2 id="nw-home-partners-title">Marcas e parceiros</h2>
        <ul>
          <li><img src="/azul- branca.webp" alt="Azul" loading="lazy" /></li>
          <li><img src="/empetur - Branca.webp" alt="Empetur" loading="lazy" /></li>
          <li><img src="/assets/brand/governo-pernambuco-branca.webp" alt="Governo de Pernambuco" loading="lazy" /></li>
        </ul>
      </section>

      <section id="sobre" className="nw-story" aria-labelledby="nw-story-title">
        <picture className="nw-story-image">
          <source media="(max-width: 700px)" srcSet="/assets/brand/cindy-vertical.webp" />
          <img src="/assets/brand/cindy-horizontal.webp" width={1920} height={1080} alt="Cindy Noel, empresária e fundadora do Grupo New Wed" loading="lazy" />
        </picture>
        <div className="nw-story-copy">
          <div>
            <h2 id="nw-story-title">A visão por trás do Grupo New Wed</h2>
            <p className="nw-story-role">Cindy Noel | Empresária e estrategista de conexões</p>
            <p>Com mais de 20 anos de experiência em eventos, comunicação e live marketing, Cindy Noel construiu uma trajetória marcada pela criatividade, inovação e visão estratégica.</p>
            <p>Empresária e fundadora da Agência Yule e do Grupo New Wed, atua nos mercados corporativo, de turismo e casamentos, conectando marcas, pessoas e oportunidades.</p>
            <p>Desde 2014, contribui para o fortalecimento do mercado de casamentos no Nordeste, idealizando projetos que valorizam destinos, aproximam profissionais e impulsionam negócios.</p>
          </div>
        </div>
      </section>

      <section id="contato" className="nw-closing" aria-labelledby="nw-closing-title">
        <div className="nw-closing-copy">
          <h2 id="nw-closing-title">“Conectamos pessoas, empresas e destinos. Criamos experiências, aproximamos mercados e impulsionamos negócios.”</h2>
          <p className="nw-quote-author">— Cindy Noel</p>
          <a href={WHATSAPP_URL} className="nw-button nw-button-light-outline" target="_blank" rel="noopener noreferrer">Fale conosco</a>
        </div>
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="nw-social" aria-label="Instagram do Grupo New Wed"><Instagram size={23} strokeWidth={1.5} /></a>
      </section>
      <footer className="nw-footer">
        <span>© 2026 Grupo New Wed</span>
        <span>Pernambuco · Alagoas · Rio Grande do Norte · Ceará</span>
      </footer>
    </main>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (typeof query.edicao === "string") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string") params.set(key, value);
    }
    redirect(`/destinos?${params.toString()}`);
  }
  return <HomeContent />;
}
