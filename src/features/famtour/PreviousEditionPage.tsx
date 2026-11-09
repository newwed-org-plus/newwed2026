import { ArrowLeft } from "lucide-react";
import { SiteShell } from "@/features/famtour/components/SiteShell";
import {
  type PreviousEdition,
} from "@/features/famtour/lib/previousEditions";

export function EditionGallery({ edition }: { edition: PreviousEdition }) {
  const hasVideo = edition.galeria.some(media => media.type === "video");
  return (
    <SiteShell>
      <main className="bg-white text-[#191010]">
        <section className="relative min-h-[62vh] overflow-hidden bg-[#0A2B28] text-white">
          <img
            src={edition.capa}
            alt={edition.capaAlt}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,43,40,0.94)_0%,rgba(10,43,40,0.46)_62%,rgba(10,43,40,0.2)_100%)]" />
          <div className="relative mx-auto flex min-h-[62vh] max-w-7xl flex-col justify-end px-6 py-14 md:px-10 md:py-20">
            <a
              href="/destinos#edicoes-anteriores"
              className="mb-auto inline-flex w-fit items-center gap-2 font-sans text-xs uppercase tracking-[0.14em] text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ArrowLeft aria-hidden="true" size={16} />
              Voltar para edições anteriores
            </a>
            <p className="font-sans text-xs uppercase tracking-[0.2em] text-[#F1D89F]">
              EDIÇÃO {edition.ano}
            </p>
            <h1 className="mt-4 max-w-4xl font-serif text-[clamp(3.25rem,8vw,7rem)] font-light uppercase leading-[0.86]">
              {edition.destino}
            </h1>
          </div>
        </section>

        <section id={hasVideo ? "video" : undefined} className="mx-auto max-w-7xl px-6 py-14 md:px-10 md:py-20">
          <div className="mb-10 max-w-2xl">
            <p className="font-sans text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-destinos-turquoise)]">
              {hasVideo ? "Vídeo da edição" : "Galeria da edição"}
            </p>
            <h2 className="mt-4 font-serif text-[clamp(2.5rem,5vw,4rem)] font-light leading-none">
              Memórias da experiência
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {edition.galeria.map((media) =>
              media.type === "image" ? (
                <figure
                  key={media.src}
                  className="overflow-hidden bg-[#F7F4EE]"
                >
                  <img
                    src={media.src}
                    alt={media.alt}
                    loading="lazy"
                    className="aspect-[4/3] h-full w-full object-cover"
                  />
                </figure>
              ) : (
                <video
                  key={media.src}
                  controls
                  preload="none"
                  poster={media.poster}
                  aria-label={media.title}
                  className="aspect-video w-full bg-black"
                >
                  <source src={media.src} />
                </video>
              ),
            )}
          </div>
        </section>
      </main>
    </SiteShell>
  );
}

export function EditionNotFound() {
  return (
    <SiteShell>
      <main className="flex min-h-[70vh] items-center justify-center bg-[#0A2B28] px-6 text-center text-white">
        <div className="max-w-xl py-20">
          <p className="font-sans text-xs uppercase tracking-[0.2em] text-[#F1D89F]">
            Edição não encontrada
          </p>
          <h1 className="mt-5 font-serif text-5xl font-light leading-none">
            Esta galeria ainda não está disponível.
          </h1>
          <a
            href="/destinos#edicoes-anteriores"
            className="mt-8 inline-flex min-h-12 items-center justify-center border border-white bg-white px-7 py-3 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-destinos-marsala)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A2B28]"
          >
            Voltar para edições anteriores
          </a>
        </div>
      </main>
    </SiteShell>
  );
}
