import { redirect } from "next/navigation";
import { Instagram } from "lucide-react";
import { INSTAGRAM_URL, WHATSAPP_URL } from "@/features/institutional/contact";
import { InstitutionalHeader } from "@/features/institutional/components/InstitutionalHeader";

const projects = [
  {
    id: "feira",
    href: "/feira",
    name: "Feira Tendência",
    description: "A maior feira de tendências e destinos para casamentos do Nordeste.",
    image: "/assets/brand/banner-feira.webp",
  },
  {
    id: "destinos",
    href: "/famtour",
    name: "Destinos",
    description: "Famtours imersivos que apresentam destinos e criam conexões reais de negócios.",
    image: "/assets/brand/banner-destinos.webp",
  },
  {
    id: "guia",
    href: "/guia",
    name: "Guia",
    description: "Publicação de referência com fornecedores, destinos e conteúdo exclusivo.",
    image: "/assets/brand/banner-guia.webp",
  },
  {
    id: "workshop",
    href: "/workshop",
    name: "Workshop",
    description: "Encontro estratégico que conecta destinos aos principais profissionais do país.",
    image: "/assets/brand/banner-workshop.webp",
  },
] as const;

function HomeContent() {
  return (
    <main className="nw-home">
      <section className="nw-hero" aria-labelledby="nw-hero-title">
        <InstitutionalHeader />

        <div className="nw-hero-content">
          <h1 id="nw-hero-title">
            Conectamos<br />
            pessoas, destinos<br />
            e experiências
          </h1>
          <p>para celebrar o amor</p>
          <a className="nw-button nw-button-dark" href="#projetos">Conheça nossos projetos</a>
        </div>
      </section>

      <section className="nw-projects" id="projetos" aria-labelledby="nw-projects-title">
        <div className="nw-section-heading">
          <h2 id="nw-projects-title">Nosso ecossistema</h2>
          <p>Soluções completas para o mercado de casamentos</p>
        </div>
        <div className="nw-project-grid">
          {projects.map((project) => (
            <article className="nw-project-card" id={project.id} key={project.id}>
              <img src={project.image} alt="" width={1080} height={1920} loading="lazy" />
              <div className="nw-project-copy">
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

      <section className="nw-numbers" aria-label="O Grupo New Wed em números">
        <div className="nw-numbers-inner">
          <div className="nw-number nw-number-since"><span>Desde</span><strong>2016</strong></div>
          <div className="nw-number"><strong>+5 mil</strong><span>Visitantes<br />por edição</span></div>
          <div className="nw-number"><strong>+100</strong><span>Expositores</span></div>
          <div className="nw-number"><strong>+8 milhões</strong><span>Em contratos<br />movimentados</span></div>
        </div>
      </section>

      <section id="sobre" className="nw-story" aria-labelledby="nw-story-title">
        <div className="nw-story-image">
          <img src="/assets/brand/cindy-noel.webp" width={1600} height={900} alt="Cindy Noel, idealizadora do Grupo New Wed" loading="lazy" />
        </div>
        <div className="nw-story-copy">
          <div>
            <h2 id="nw-story-title">Por trás do New Wed</h2>
            <p>Idealizado por Cindy Noel, o Grupo New Wed une visão criativa, experiência em live marketing, atuação estratégica no mercado de casamentos, eventos e turismo no Nordeste.</p>
            <a href="#contato" className="nw-button nw-button-dark">Fale com nossa equipe</a>
          </div>
        </div>
      </section>

      <section id="contato" className="nw-closing" aria-labelledby="nw-closing-title">
        <span className="nw-quote-mark" aria-hidden="true">“</span>
        <div className="nw-closing-copy">
          <h2 id="nw-closing-title">Seja como for,<br />quem faz a festa é o amor.</h2>
          <a href={WHATSAPP_URL} className="nw-button nw-button-light-outline" target="_blank" rel="noopener noreferrer">Fale conosco</a>
        </div>
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="nw-social" aria-label="Instagram do Grupo New Wed"><Instagram size={23} strokeWidth={1.5} /></a>
      </section>
      <footer className="nw-footer">
        <span>© 2026 Grupo New Wed</span>
        <span>Recife · Pernambuco</span>
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
    redirect(`/famtour?${params.toString()}`);
  }
  return <HomeContent />;
}
