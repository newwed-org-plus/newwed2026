"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PREVIOUS_EDITIONS } from "@/features/famtour/lib/previousEditions";

export function PreviousEditionsCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;

    track.scrollBy({
      left: direction * Math.max(280, track.clientWidth * 0.9),
      behavior: "smooth",
    });
  };

  return (
    <div>
      <div className="mb-5 hidden justify-end gap-2 md:flex">
        <button
          type="button"
          aria-label="Edição anterior"
          onClick={() => scroll(-1)}
          className="inline-flex size-11 items-center justify-center border border-black/15 bg-white text-[var(--color-destinos-marsala)] transition-colors hover:border-[var(--color-destinos-marsala)] hover:bg-[#F7F4EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-destinos-turquoise)] focus-visible:ring-offset-2"
        >
          <ChevronLeft aria-hidden="true" size={20} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          aria-label="Próxima edição"
          onClick={() => scroll(1)}
          className="inline-flex size-11 items-center justify-center border border-black/15 bg-white text-[var(--color-destinos-marsala)] transition-colors hover:border-[var(--color-destinos-marsala)] hover:bg-[#F7F4EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-destinos-turquoise)] focus-visible:ring-offset-2"
        >
          <ChevronRight aria-hidden="true" size={20} strokeWidth={1.6} />
        </button>
      </div>

      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 md:gap-5 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {PREVIOUS_EDITIONS.map((edicao) => (
          <Link
            key={edicao.slug}
            href={edicao.videoUrl ?? `/destinos/edicoes/${edicao.slug}`}
            target={edicao.videoUrl?.startsWith("https://") ? "_blank" : undefined}
            rel={edicao.videoUrl?.startsWith("https://") ? "noopener noreferrer" : undefined}
            aria-label={`Ver ${edicao.videoUrl ? "vídeo" : "galeria"} da edição ${edicao.destino} ${edicao.ano}`}
            className="group relative block aspect-[4/5] min-w-0 flex-[0_0_86%] snap-start overflow-hidden bg-[#0A2B28] text-left shadow-[0_16px_36px_rgba(10,43,40,0.12)] sm:flex-[0_0_60%] lg:flex-[0_0_calc((100%_-_2.5rem)/3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-destinos-turquoise)] focus-visible:ring-offset-2"
          >
            <img
              src={edicao.capa}
              alt={edicao.capaAlt}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] group-focus-visible:scale-[1.04]"
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,43,40,0.92)_0%,rgba(10,43,40,0.08)_68%)] transition-opacity duration-500 group-hover:opacity-95"
            />
            <span className="absolute inset-x-0 bottom-0 block p-5 text-white transition-transform duration-500 md:p-6 group-hover:-translate-y-1 group-focus-visible:-translate-y-1">
              <span className="block font-serif text-[clamp(1.7rem,3vw,2.2rem)] font-normal uppercase leading-[1.02]">
                {edicao.destino}
              </span>
              <span className="mt-3 block font-sans text-[0.65rem] font-medium uppercase tracking-[0.18em] text-white/75">
                EDIÇÃO {edicao.ano}
              </span>
              <span className="mt-2 block font-sans text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#F1D89F]">
                {edicao.videoUrl ? "VER VÍDEO" : "VER GALERIA"} →
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
