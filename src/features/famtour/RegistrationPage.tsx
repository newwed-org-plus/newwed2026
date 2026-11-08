import { Plane } from "lucide-react";
import {famtourInformation} from '@/content/famtour-information';
import {
  formatCurrency,
  type FamtourEdition,
} from "@/features/famtour/lib/famtours";

type PageProps = {
  edition: FamtourEdition;
};

export function InscricaoPage({ edition }: PageProps) {
  const interestHref = `/destinos?edicao=${encodeURIComponent(edition.slug)}&origem=inscricao#form`;

  return (
    <div className="min-h-screen bg-white text-[#191010]">
      <header className="border-b border-white/10 bg-[#191010] px-5 py-4 text-white md:px-10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <a
            href="/"
            aria-label="New Wed, página inicial"
            className="whitespace-nowrap font-serif text-xl uppercase tracking-[0.18em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <img src="/assets/brand/new-wed-marsala.png" width={1167} height={927} alt="New Wed" className="h-12 w-auto brightness-0 invert" />
          </a>
          <nav aria-label="Retorno ao institucional" className="flex gap-4 font-sans text-xs text-white/75">
            <a href="/" className="underline underline-offset-4 hover:text-white">Grupo New Wed</a>
            <a href="/#projetos" className="hover:text-white">Projetos</a>
          </nav>
          <a
            href="/destinos#famtours"
            className="font-sans text-[0.68rem] uppercase tracking-[0.14em] text-white/75 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            Voltar para edições abertas
          </a>
        </div>
      </header>

      <main>
        <section className="grid min-h-[34rem] grid-cols-1 bg-[#191010] text-white lg:grid-cols-2">
          <div className="order-2 flex items-center px-6 py-12 md:px-12 lg:order-1 lg:px-[clamp(3rem,7vw,7rem)]">
            <div className="max-w-xl">
              <p className="font-sans text-xs uppercase tracking-[0.2em] text-[#D9BE83]">
                FAMTOUR NEW WED 2027
              </p>
              <h1 className="mt-5 font-serif text-[clamp(3rem,7vw,5.5rem)] font-light leading-[0.9]">
                {edition.destino}
              </h1>
              <p className="mt-6 font-sans text-base text-white/75">
                {edition.periodo}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <span className="border border-white/25 px-4 py-2 font-sans text-xs font-semibold uppercase tracking-[0.12em]">
                  {edition.vagas} VAGAS
                </span>
                <span className="inline-flex items-center gap-2 border border-[#D9BE83]/50 px-4 py-2 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-[#F1D89F]">
                  <Plane aria-hidden="true" size={17} strokeWidth={1.8} />
                  AÉREO INCLUSO
                </span>
              </div>
              <a href="#condicoes" className="mt-7 inline-flex min-h-11 items-center underline underline-offset-4">
                Ver condições de pagamento
              </a>
            </div>
          </div>
          <div className="order-1 min-h-72 overflow-hidden lg:order-2 lg:min-h-full">
            {edition.imagem ? (
              <img
                src={edition.imagem}
                alt={edition.imagemAlt ?? `Edição ${edition.destino}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                role="img"
                aria-label={`Imagem da edição ${edition.destino} em atualização`}
                className="flex h-full min-h-72 items-end bg-gradient-to-br from-[#8A2638] to-[#191010] p-8 text-white lg:min-h-full"
              >
                <span className="font-sans text-xs uppercase tracking-[0.16em] text-white/75">
                  Imagem da edição em atualização
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-14 md:px-10 md:py-20">
          <div className="max-w-4xl">
            <div>
              <p className="font-sans text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-destinos-turquoise)]">
                Resumo da experiência
              </p>
              <h2 className="mt-4 max-w-3xl font-serif text-[clamp(2.4rem,5vw,4rem)] font-light leading-[1.02]">
                Uma especialização no destino, com curadoria New Wed.
              </h2>
              <p className="mt-6 max-w-3xl font-sans text-base leading-relaxed text-black/65">
                Uma experiência fechada para profissionais de casamentos que
                querem conhecer o destino, seus bastidores e fornecedores com
                profundidade.
              </p>

              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                {edition.inclusos.map((item) => (
                  <div
                    key={item}
                    className="border border-black/10 bg-[#F7F4EE] px-5 py-5 font-sans text-sm leading-relaxed text-black/70"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="condicoes" aria-labelledby="condicoes-title" className="bg-[#F7F4EE] px-6 py-12 text-[var(--color-destinos-marsala)] md:px-10 md:py-16">
          <div className="mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-2">
            <div>
              <p className="font-sans text-xs">{edition.destino} · {edition.periodo}</p>
              <h2 id="condicoes-title" className="mt-2 font-serif text-4xl">Condições de pagamento</h2>
              <p className="mt-4 font-serif text-[clamp(2.5rem,6vw,4.5rem)] font-light leading-none">
                {edition.parcelaQuantidade}x de {formatCurrency(edition.parcelaCentavos)}
              </p>
              <p className="mt-3 font-sans text-sm">ou {formatCurrency(edition.valorAVistaCentavos)} à vista</p>
            </div>
            <div>
              <p className="max-w-sm font-sans text-sm leading-relaxed text-[#191010]">
                Consulte a equipe New Wed para confirmar a disponibilidade e receber as instruções de pagamento.
              </p>
              <a href={interestHref} className="mt-4 inline-flex min-h-12 items-center bg-[var(--color-destinos-turquoise)] px-5 py-3 font-sans text-sm font-semibold text-[var(--color-destinos-ink)] hover:bg-[#8AB8B7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-destinos-ink)]">
                Solicitar minha pré-inscrição
              </a>
            </div>
          </div>
        </section>

        <section className="border-t border-black/10 bg-[#F7F4EE] px-6 py-14 md:px-10 md:py-16">
          <div className="mx-auto max-w-4xl">
            <p className="font-sans text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-destinos-turquoise)]">
              Perguntas frequentes
            </p>
            <h2 className="mt-4 font-serif text-4xl font-light">
              Informações confirmadas
            </h2>
            <dl className="mt-8 divide-y divide-black/10 border-y border-black/10">
              <div className="py-6">
                <dt className="font-sans text-sm font-semibold uppercase tracking-[0.08em] text-[var(--color-destinos-marsala)]">
                  O aéreo está incluso?
                </dt>
                <dd className="mt-3 font-sans text-sm leading-relaxed text-black/65">
                  {famtourInformation.airfareAnswer}
                </dd>
              </div>
              <div className="py-6">
                <dt className="font-sans text-sm font-semibold uppercase tracking-[0.08em] text-[var(--color-destinos-marsala)]">
                  A inscrição já pode ser enviada?
                </dt>
                <dd className="mt-3 font-sans text-sm leading-relaxed text-black/65">
                  {famtourInformation.registration.detailPageAnswer}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </main>
    </div>
  );
}

export function EditionNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#191010] px-6 py-20 text-center text-white">
      <div className="max-w-xl">
        <p className="font-sans text-xs uppercase tracking-[0.2em] text-[#D9BE83]">
          EDIÇÃO NÃO ENCONTRADA
        </p>
        <h1 className="mt-5 font-serif text-5xl font-light leading-none">
          Esta edição não está disponível.
        </h1>
        <p className="mt-6 font-sans text-sm leading-relaxed text-white/65">
          Confira as edições 2027 cadastradas na página principal.
        </p>
        <a
          href="/destinos#famtours"
          className="mt-9 inline-flex min-h-12 items-center justify-center border border-white bg-white px-7 py-3 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-destinos-marsala)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          VOLTAR PARA EDIÇÕES ABERTAS
        </a>
      </div>
    </main>
  );
}
