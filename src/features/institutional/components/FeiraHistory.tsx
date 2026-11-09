"use client";

import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";

const editions = [
  { year: 2016, description: "Desfile e público na primeira edição da New Wed Feira", video: "klXztDGC380" },
  { year: 2017, description: "Encontro de noivos e fornecedores na New Wed Feira de 2017", video: "rYg0TpnerAg" },
  { year: 2018, description: "Decoração e espaços dos expositores na New Wed Feira de 2018", video: "-g3D2RjbQWo" },
  { year: 2019, description: "Público e expositores na New Wed Feira de 2019", video: "xhentgAI9pU" },
  { year: 2022, description: "Vista dos estandes da New Wed Feira de 2022, com uma profissional em primeiro plano", video: "37FaAgAqHnM" },
  { year: 2023, description: "Retrato em frente à entrada da New Wed Feira Tendência de 2023", video: "OqfXxlvGmyE" },
  { year: 2024, description: "Retrato diante do painel da New Wed Feira Tendência de 2024", video: "suBPxUvfBaw" },
  { year: 2025, description: "Retrato na entrada decorada da New Wed Feira Tendência de 2025", video: "L1gnu-51G1U" },
  { year: 2026, description: "Cindy Noel na New Wed Feira Tendência 2026", video: "juZ5xsOwPZs" },
] as const;

const subscribe = () => () => {};
const channelUrl = "https://www.youtube.com/@newwedfeiratendencia21/videos";
const imagePath = (year: number) => `/assets/feira/edicao-${year}.webp`;
const videoUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export function FeiraHistory() {
  const interactive = useSyncExternalStore(subscribe, () => true, () => false);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState(0);
  const edition = editions[selected]!;

  function moveEdition(direction: number) {
    setSelected(index => (index + direction + editions.length) % editions.length);
  }

  return (
    <section className="nw-detail-section nw-fair-history" id="edicoes-anteriores" aria-labelledby="fair-history-title">
      <p className="nw-eyebrow">Nossa história em encontros</p>
      <h2 id="fair-history-title">Inspirações que atravessam as edições.</h2>
      <p className="nw-history-intro">Desde 2016, a New Wed Feira reúne tendências, profissionais e histórias de quem faz o mercado de casamentos. Selecione uma edição para ver seu registro e, quando disponível, o vídeo oficial.</p>
      <ul className="nw-fair-mosaic" aria-label="Edições da Feira">
        {editions.map(({ year, description }, index) => (
          <li key={year} data-edition={year}>
            <button type="button" disabled={!interactive} aria-label={`Ver galeria da Feira ${year}`} onClick={event => {
              opener.current = event.currentTarget;
              setSelected(index);
              dialog.current?.showModal();
            }}>
              <img src={imagePath(year)} alt={description} width={500} height={375} loading="lazy" />
              <span>New Wed Feira <strong>{year}</strong></span>
            </button>
          </li>
        ))}
      </ul>
      <dialog
        ref={dialog}
        className="nw-fair-dialog"
        aria-labelledby="fair-edition-title"
        onClose={() => opener.current?.focus()}
        onKeyDown={event => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            moveEdition(event.key === "ArrowRight" ? 1 : -1);
          }
        }}
      >
        <div className="nw-fair-dialog-heading">
          <h3 id="fair-edition-title" aria-live="polite">New Wed Feira {edition.year}</h3>
          <button type="button" aria-label="Fechar galeria" onClick={() => dialog.current?.close()}><X aria-hidden="true" /></button>
        </div>
        <img src={imagePath(edition.year)} alt={edition.description} />
        <div className="nw-fair-dialog-actions">
          <button type="button" aria-label="Edição anterior" onClick={() => moveEdition(-1)}><ChevronLeft aria-hidden="true" /></button>
          {edition.video && <a href={videoUrl(edition.video)} target="_blank" rel="noopener noreferrer"><Play size={16} aria-hidden="true" /> Assistir ao vídeo de {edition.year}</a>}
          <button type="button" aria-label="Próxima edição" onClick={() => moveEdition(1)}><ChevronRight aria-hidden="true" /></button>
        </div>
      </dialog>
      <div className="nw-history-video">
        <iframe src="https://www.youtube-nocookie.com/embed/xhentgAI9pU" title="New Wed Feira Tendência 2019 — vídeo oficial" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
      <p className="nw-video-caption">Reviva a New Wed Feira Tendência 2019. <a href={channelUrl} target="_blank" rel="noopener noreferrer">Ver mais vídeos no canal oficial</a></p>
    </section>
  );
}
