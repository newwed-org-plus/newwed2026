"use client";

import { Check, Plane } from "lucide-react";
import { formatCurrency, type FamtourEdition } from "@/features/famtour/lib/famtours";

type Props = {
  edition: FamtourEdition;
};

export function RegistrationSummary({ edition }: Props) {
  return (
    <aside
      aria-label={`Resumo da inscrição para ${edition.destino}`}
      className="border border-black/10 bg-[#F7F4EE] p-6 lg:sticky lg:top-24"
    >
      <p className="font-sans text-[0.65rem] uppercase tracking-[0.18em] text-[var(--color-destinos-turquoise)]">
        Resumo da edição
      </p>
      <h2 className="mt-3 font-serif text-3xl font-normal leading-none text-[#191010]">
        {edition.destino}
      </h2>
      <p className="mt-3 font-sans text-sm leading-relaxed text-black/65">
        {edition.periodo}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <span className="border border-[var(--color-destinos-marsala)]/30 px-3 py-2 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-destinos-marsala)]">
          {edition.vagas} VAGAS
        </span>
        <span className="inline-flex items-center gap-2 border border-[var(--color-destinos-turquoise)]/30 px-3 py-2 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-destinos-turquoise)]">
          <Plane aria-hidden="true" size={15} strokeWidth={1.8} />
          AÉREO INCLUSO
        </span>
      </div>

      <div className="my-6 border-y border-black/10 py-6">
        <p className="font-serif text-[2.25rem] leading-none text-[var(--color-destinos-marsala)]">
          {edition.parcelaQuantidade}x de{" "}
          {formatCurrency(edition.parcelaCentavos)}
        </p>
        <p className="mt-2 font-sans text-xs uppercase tracking-[0.08em] text-black/55">
          {formatCurrency(edition.valorAVistaCentavos)} à vista
        </p>
      </div>

      <ul className="space-y-3">
        {edition.inclusos.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2 font-sans text-sm leading-relaxed text-black/70"
          >
            <Check
              aria-hidden="true"
              size={16}
              strokeWidth={2}
              className="mt-1 shrink-0 text-[var(--color-destinos-turquoise)]"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="mt-6 border-t border-black/10 pt-5 font-sans text-xs leading-relaxed text-black/55">
        Nenhuma cobrança será realizada nesta etapa.
      </p>
    </aside>
  );
}
