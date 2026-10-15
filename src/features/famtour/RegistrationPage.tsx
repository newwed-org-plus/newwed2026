import { Plane } from "lucide-react";
import { RegistrationFormPreview } from "@/features/famtour/components/inscricao/RegistrationFormPreview";
import { RegistrationSummary } from "@/features/famtour/components/inscricao/RegistrationSummary";
import {
  formatCurrency,
  type FamtourEdition,
} from "@/features/famtour/lib/famtours";

type PageProps = {
  edition: FamtourEdition;
};

export function InscricaoPage({ edition }: PageProps) {
  return (
    <div className="min-h-screen bg-white text-[#191010]">
      <header className="border-b border-white/10 bg-[#191010] px-5 py-4 text-white md:px-10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <a
            href="/famtour"
            className="whitespace-nowrap font-serif text-xl uppercase tracking-[0.18em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            New Wed
          </a>
          <nav aria-label="Retorno ao institucional" className="flex gap-4 font-sans text-xs text-white/75">
            <a href="/" className="underline underline-offset-4 hover:text-white">Grupo New Wed</a>
            <a href="/#projetos" className="hover:text-white">Projetos</a>
          </nav>
          <a
            href="/famtour#famtours"
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
              <p className="font-sans text-[0.68rem] uppercase tracking-[0.18em] text-[#2E8E8E]">
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

        <section className="bg-[#7A2535] px-6 py-12 text-white md:px-10 md:py-16">
          <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-7 md:flex-row md:items-end">
            <div>
              <p className="font-sans text-[0.68rem] uppercase tracking-[0.18em] text-white/65">
                Investimento
              </p>
              <p className="mt-3 font-serif text-[clamp(2.8rem,7vw,5rem)] font-light leading-none">
                {edition.parcelaQuantidade}x de{" "}
                {formatCurrency(edition.parcelaCentavos)}
              </p>
              <p className="mt-3 font-sans text-sm uppercase tracking-[0.08em] text-white/70">
                {formatCurrency(edition.valorAVistaCentavos)} à vista
              </p>
            </div>
            <p className="max-w-sm font-sans text-sm leading-relaxed text-white/75">
              Nenhuma cobrança será realizada nesta etapa. O ambiente de
              inscrição online será disponibilizado posteriormente.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-14 md:px-10 md:py-20">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div>
              <p className="font-sans text-[0.68rem] uppercase tracking-[0.18em] text-[#2E8E8E]">
                Formulário de inscrição
              </p>
              <h2 className="mb-10 mt-4 font-serif text-[clamp(2.4rem,5vw,4rem)] font-light leading-none">
                Seus dados
              </h2>
              <RegistrationFormPreview />
            </div>
            <RegistrationSummary edition={edition} />
          </div>
        </section>

        <section className="border-t border-black/10 bg-[#F7F4EE] px-6 py-14 md:px-10 md:py-16">
          <div className="mx-auto max-w-4xl">
            <p className="font-sans text-[0.68rem] uppercase tracking-[0.18em] text-[#2E8E8E]">
              Perguntas frequentes
            </p>
            <h2 className="mt-4 font-serif text-4xl font-light">
              Informações confirmadas
            </h2>
            <dl className="mt-8 divide-y divide-black/10 border-y border-black/10">
              <div className="py-6">
                <dt className="font-sans text-sm font-semibold uppercase tracking-[0.08em] text-[#7A2535]">
                  O aéreo está incluso?
                </dt>
                <dd className="mt-3 font-sans text-sm leading-relaxed text-black/65">
                  Sim. Esta edição está cadastrada com aéreo incluso.
                </dd>
              </div>
              <div className="py-6">
                <dt className="font-sans text-sm font-semibold uppercase tracking-[0.08em] text-[#7A2535]">
                  A inscrição já pode ser enviada?
                </dt>
                <dd className="mt-3 font-sans text-sm leading-relaxed text-black/65">
                  Ainda não. Esta página apresenta a estrutura da inscrição, mas
                  não envia dados e não realiza cobrança nesta etapa.
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
          href="/famtour#famtours"
          className="mt-9 inline-flex min-h-12 items-center justify-center border border-white bg-white px-7 py-3 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-[#7A2535] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          VOLTAR PARA EDIÇÕES ABERTAS
        </a>
      </div>
    </main>
  );
}
