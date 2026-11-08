"use client";

import { useEffect, useRef, useState } from "react";

/**
 * CARROSSEL DE IMAGENS — painel direito do HeroSplit
 * Imagens servidas direto da pasta /public — sem import.
 * Para adicionar fotos, edite o array SLIDES abaixo.
 */
const SLIDES = [
  "/LE040347.webp",
  "/LE049367.webp",
  "/WhatsApp-Image-2018-12-26-at-10.03.03.webp",
  "/LE048829.webp",
];

/** Intervalo em ms entre cada slide */
const INTERVAL_MS = 5000;

export function HeroSplit() {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = (index: number) => {
    setCurrent(index);
  };

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % SLIDES.length);
    }, INTERVAL_MS);
  };

  useEffect(() => {
    if (SLIDES.length <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <section id="inicio" className="nw-home nw-detail-hero nw-destinos-hero" aria-labelledby="destinos-title">
      <div className="nw-detail-copy">
        <a className="nw-back-link" href="/#projetos">← Todos os projetos</a>
        <img src="/logo-newed-destinos-transparent.png" width={95} height={95} alt="New Wed Destinos" className="nw-destinos-hero-brand" />
        <p className="nw-eyebrow">New Wed Destinos · Edição 2027</p>
        <h1 id="destinos-title">FAMTOUR Nordeste <span>Edição 2027</span></h1>
        <p className="nw-detail-description">Uma imersão para profissionais de casamentos conhecerem destinos, espaços e fornecedores do Nordeste.</p>
        <div className="nw-detail-actions">
          <a href="#famtours" className="nw-button nw-destinos-cta">Ver edições abertas</a>
        </div>
      </div>

      <div className="nw-destinos-photo">
        {SLIDES.map((src, index) => (
          <img key={src} src={src} alt="" className={index === current ? "is-active" : undefined} loading={index === 0 ? "eager" : "lazy"} />
        ))}
        <div className="nw-destinos-slide-controls" aria-label="Fotos do FAMTOUR" role="group">
          {SLIDES.map((_, index) => (
            <button key={index} type="button" aria-label={`Slide ${index + 1}`} aria-pressed={index === current} onClick={() => {
              goTo(index);
              if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) resetTimer();
            }} />
          ))}
        </div>
      </div>
    </section>
  );
}
