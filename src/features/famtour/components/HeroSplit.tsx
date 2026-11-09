"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

const slides = [
  { image: "mergulho", alt: "Participantes mergulhando ao lado de uma embarcação" },
  { image: "chegada-noronha", alt: "Grupo diante do letreiro de Noronha" },
  { image: "almoco-famtour", alt: "Participantes reunidos à mesa durante o Famtour" },
  { image: "encontro-noronha", alt: "Grupo reunido em um terraço ao pôr do sol" },
  { image: "visita-famtour", alt: "Participantes durante uma visita técnica", position: "50% 45%" },
  { image: "grupo-praia", alt: "Grupo na praia com os morros de Noronha ao fundo" },
  { image: "grupo-coqueiros", alt: "Grupo em Alagoas entre coqueiros", position: "50% 74%" },
  { image: "grupo-piscina", alt: "Grupo à beira da piscina em Noronha", position: "50% 53%" },
  { image: "grupo-mirante", alt: "Participantes reunidos em um mirante de Noronha" },
  { image: "grupo-terraco", alt: "Grupo celebrando em um terraço de Noronha", position: "50% 49%" },
];

const intervalMs = 5000;
const wrapSlide = (index: number) => (index + slides.length) % slides.length;

export function HeroSplit() {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const previous = wrapSlide(current - 1);
  const next = wrapSlide(current + 1);

  useEffect(() => {
    if (!playing) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setTimeout(() => {
      if (!motion.matches) setCurrent(next);
    }, intervalMs);
    return () => window.clearTimeout(timer);
  }, [next, playing]);

  return (
    <section id="inicio" className="nw-home nw-detail-hero nw-destinos-hero" aria-labelledby="destinos-title">
      <div className="nw-detail-copy">
        <a className="nw-back-link" href="/#projetos">← Todos os projetos</a>
        <img src="/logo-newed-destinos-transparent.png" width={72} height={72} alt="New Wed Destinos" className="nw-detail-brand nw-destinos-hero-brand" />
        <p className="nw-eyebrow">New Wed Destinos</p>
        <h1 id="destinos-title">Famtour Nordeste <span>Edição 2027</span></h1>
        <p className="nw-detail-description">O Famtour é uma viagem de imersão para profissionais do mercado de casamentos. Em cada edição, você visita espaços para eventos, conhece fornecedores locais e vive experiências no destino para recomendar com segurança aos seus casais.</p>
        <div className="nw-detail-actions">
          <a href="#famtours" className="nw-button nw-destinos-cta">Ver edições abertas</a>
        </div>
      </div>

      <div className="nw-destinos-photo" role="region" aria-label="Fotos do FAMTOUR">
        {[previous, current, next].map(index => {
          const slide = slides[index]!;
          const active = index === current;
          return (
            <img key={slide.image} src={`/assets/destinos/abertura/${slide.image}.webp`}
              alt={active ? slide.alt : ""} aria-hidden={!active}
              className={active ? "is-active" : undefined}
              loading={active ? "eager" : "lazy"}
              style={{ objectPosition: slide.position }} />
          );
        })}
        <div className="nw-destinos-slide-controls">
          <button type="button" aria-label="Foto anterior" onClick={() => setCurrent(previous)}><ChevronLeft aria-hidden="true" size={18} /></button>
          <span aria-label={`Foto ${current + 1} de ${slides.length}`}>{current + 1} / {slides.length}</span>
          <button type="button" aria-label="Próxima foto" onClick={() => setCurrent(next)}><ChevronRight aria-hidden="true" size={18} /></button>
          <button type="button" className="nw-destinos-slide-playback" aria-label={playing ? "Pausar carrossel" : "Reproduzir carrossel"} onClick={() => setPlaying(value => !value)}>
            {playing ? <Pause aria-hidden="true" size={15} /> : <Play aria-hidden="true" size={15} />}
          </button>
        </div>
      </div>
    </section>
  );
}
