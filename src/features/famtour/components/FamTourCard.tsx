"use client";

import { Check, Plane } from "lucide-react";
import { formatCurrency, type FamtourEdition } from "@/features/famtour/lib/famtours";

type Props = {
  famtour: FamtourEdition;
  onRequestInformation: (slug: string) => void;
  onViewEdition: (slug: string) => void;
};

export function FamTourCard({ famtour, onRequestInformation, onViewEdition }: Props) {
  return (
    <article className="group flex h-full flex-col border border-black/10 bg-white shadow-[0_14px_40px_rgba(25,16,16,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#2E8E8E]/40 hover:shadow-[0_20px_48px_rgba(25,16,16,0.1)]">
      {famtour.imagem ? (
        <img
          src={famtour.imagem}
          alt={famtour.imagemAlt ?? `Edição ${famtour.destino}`}
          loading="lazy"
          className="h-52 w-full object-cover md:h-56"
        />
      ) : (
        <div
          role="img"
          aria-label={`Imagem da edição ${famtour.destino} em atualização`}
          className="flex h-52 w-full items-end bg-gradient-to-br from-[#F7F4EE] to-[#E8DDDA] p-5 text-[#7A2535] md:h-56 md:p-6"
        >
          <span className="font-sans text-[0.68rem] uppercase tracking-[0.16em] text-[#7A2535]/75">
            Imagem da edição em atualização
          </span>
        </div>
      )}

      <div className="flex flex-1 flex-col px-5 pb-5 pt-5 md:px-6 md:pb-6">
        <p className="font-sans text-[0.65rem] uppercase tracking-[0.18em] text-[#2E8E8E]">
          {famtour.label}
        </p>
        <h3 className="mt-2 font-serif text-[1.8rem] font-normal leading-[1.05] text-[#191010]">
          {famtour.destino}
        </h3>
        <p className="mt-2 font-sans text-sm text-black/65">
          {famtour.periodo}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 border border-[#2E8E8E]/25 bg-[#EAF4F2] px-3 py-2 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#2E8E8E]">
            <Plane aria-hidden="true" size={16} strokeWidth={1.8} />
            AÉREO INCLUSO
          </span>
          <span className="px-1 font-sans text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[#7A2535]">
            {famtour.vagas} VAGAS
          </span>
        </div>

        <ul className="my-4 flex flex-col gap-1.5">
          {famtour.inclusos
            .filter((item) => item !== "Aéreo incluso")
            .map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 font-sans text-sm leading-relaxed text-[#191010]"
              >
                <Check
                  aria-hidden="true"
                  size={16}
                  color="#2E8E8E"
                  strokeWidth={2.5}
                  className="mt-1 shrink-0"
                />
                <span>{item}</span>
              </li>
            ))}
        </ul>

        <div className="mt-auto border-t border-black/10 pt-4">
          <div className="text-left sm:text-right">
            <p className="font-sans text-[0.62rem] font-medium uppercase tracking-[0.18em] text-black/45">
              Investimento
            </p>
            <p className="mt-2 font-serif text-[clamp(2.1rem,8vw,2.5rem)] font-medium leading-none text-[#7A2535]">
              {famtour.parcelaQuantidade}x de{" "}
              {formatCurrency(famtour.parcelaCentavos)}
            </p>
            <p className="mt-2 font-sans text-sm text-black/65">
              ou {formatCurrency(famtour.valorAVistaCentavos)} à vista
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            <button
              type="button"
              onClick={() => onRequestInformation(famtour.slug)}
              className="min-h-11 border border-black/20 bg-white px-4 py-2.5 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-[#7A2535] transition-colors hover:border-[#7A2535] hover:bg-[#F7F4EE] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2E8E8E] sm:min-h-12 sm:py-3"
            >
              Solicitar informações
            </button>
            <button
              type="button"
              onClick={() => onViewEdition(famtour.slug)}
              className="min-h-14 border border-[#7A2535] bg-[#7A2535] px-4 py-3 font-sans text-xs font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[#641D2C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2E8E8E] sm:min-h-12"
            >
              Ver informações da edição
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
