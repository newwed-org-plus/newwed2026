"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { SiteShell } from "@/features/famtour/components/SiteShell";
import { HeroSplit } from "@/features/famtour/components/HeroSplit";
import { ParceirosLogos } from "@/features/famtour/components/Parceiros";
import { PreviousEditionsCarousel } from "@/features/famtour/components/PreviousEditionsCarousel";
import { FamTourCard } from "@/features/famtour/components/FamTourCard";
import {
  InterestFormHeading,
  OpenEditionsHeading,
} from "@/features/famtour/components/FamtourLandingCopy";
import { PreInscricaoForm } from "@/features/famtour/components/PreInscricaoForm";
import { SuccessScreen } from "@/features/famtour/components/SuccessScreen";
import { FAMTOUR_EDITIONS, toLegacyFamTour } from "@/features/famtour/lib/famtours";
import type { PreInscricaoData } from "@/features/famtour/lib/schemas/preInscricao";
import {famtourInformation} from '@/content/famtour-information';
import {EbookPopup} from './components/EbookPopup';

function Divisor({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        maxWidth: 320,
        margin: "0 auto 1.5rem",
      }}
    >
      <div style={{ flex: 1, height: 1, background: "rgba(25,16,16,0.1)" }} />
      <span
        style={{
          fontFamily: "'Fedra Sans Std', sans-serif",
          fontSize: "0.65rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--color-destinos-marsala)",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: "rgba(25,16,16,0.1)" }} />
    </div>
  );
}

export function FamtourLanding() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const source = searchParams.get("origem");
  const fromEbook = source === "ebook";
  const edicao = searchParams.get("edicao") ?? undefined;

  const famtours = FAMTOUR_EDITIONS;
  const formFamtours = FAMTOUR_EDITIONS.map(toLegacyFamTour);

  const [success, setSuccess] = useState<{
    data: PreInscricaoData;
    famtourNome: string;
  } | null>(null);

  const scrollTo = useCallback((id: string) => {
    if (typeof document !== "undefined") {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    }
  },[]);

  useEffect(()=>{
    if (!edicao && !fromEbook) return;
    const frame = requestAnimationFrame(() => {
      const anchor = window.location.hash.slice(1);
      scrollTo(anchor && document.getElementById(anchor) ? anchor : edicao ? "form" : "famtours");
    });
    return()=>cancelAnimationFrame(frame);
  }, [edicao, fromEbook, scrollTo]);

  const handleRequestInformation = (slug: string) => {
    router.push(`/destinos?edicao=${encodeURIComponent(slug)}#form`,{scroll:false});
    scrollTo("form");
  };

  return (
    <SiteShell>
      <EbookPopup openOnEntry={!fromEbook && source !== "inscricao"} />
      <Toaster position="top-center" richColors />
      <main
        className="famtour-landing bg-white"
        style={{
          color: "#191010",
          scrollBehavior: "smooth",
          paddingTop: "64px", // offset for fixed nav
        }}
      >
        {!success ? (
          <>
            <HeroSplit onCta={() => scrollTo("famtours")} />

            {/* Parceiros e marcas apoiadoras */}
            <ParceirosLogos />

            {/* O que é */}
            <section id="experiencia" className="mx-auto max-w-[720px] px-6 py-12 text-center md:py-16">
              <Divisor>O que é</Divisor>
              <h2
                style={{
                  fontFamily: "'Fedra Sans Std', sans-serif",
                  fontWeight: 300,
                  fontSize: "clamp(2rem, 4vw, 2.8rem)",
                  color: "var(--color-destinos-marsala)",
                  lineHeight: 1.15,
                  margin: 0,
                }}
              >
                Não é uma viagem.
                <br />
                <em style={{ fontStyle: "italic", fontWeight: 300 }}>
                  É uma especialização no destino.
                </em>
              </h2>
              <p
                style={{
                  fontFamily: "'Fedra Sans Std', sans-serif",
                  fontWeight: 350,
                  fontSize: "0.92rem",
                  lineHeight: "1.8",
                  marginTop: "1.5rem",
                  color: "#191010",
                  textAlign: "center",
                }}
              >
                {famtourInformation.landingDescription}
              </p>
              <button
                type="button"
                onClick={() => scrollTo("edicoes-anteriores")}
                style={{
                  marginTop: "2rem",
                  background: "var(--color-destinos-turquoise)",
                  color: "var(--color-destinos-ink)",
                  border: "1px solid var(--color-destinos-turquoise)",
                  padding: "1rem 1.75rem",
                  fontFamily: "'Fedra Sans Std', sans-serif",
                  fontWeight: 350,
                  fontSize: "0.78rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  borderRadius: 0,
                  cursor: "pointer",
                }}
              >
                CONFIRA EDIÇÕES ANTERIORES
              </button>
            </section>

            {/* Edições anteriores */}
            <section
              id="edicoes-anteriores"
              className="mx-auto max-w-[1100px] px-6 pb-8 pt-0 md:pb-12 md:pt-4"
              style={{
                scrollMarginTop: 80,
              }}
            >
              <Divisor>EDIÇÕES ANTERIORES</Divisor>
              <PreviousEditionsCarousel />
            </section>

            {/* Edições abertas */}
            <section
              id="famtours"
              className="mx-auto max-w-[1100px] scroll-mt-20 px-6 pb-10 pt-10 md:pb-12 md:pt-12"
            >
              <OpenEditionsHeading />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
                {famtours.map((f) => (
                  <FamTourCard
                    key={f.id}
                    famtour={f}
                    onRequestInformation={handleRequestInformation}
                  />
                ))}
              </div>
            </section>

            {/* Form */}
            <section
              id="form"
              className="mx-auto max-w-[720px] px-6 pb-12 pt-10 md:py-16"
            >
              <InterestFormHeading />
              <PreInscricaoForm
                famtours={formFamtours}
                preSelectedSlug={edicao}
                onSuccess={(data, famtourNome) =>
                  setSuccess({ data, famtourNome })
                }
              />
            </section>
          </>
        ) : (
          <SuccessScreen
            nome={success.data.nome}
            telefoneFormatado={success.data.telefone}
            famtourNome={success.famtourNome}
          />
        )}
      </main>
    </SiteShell>
  );
}
