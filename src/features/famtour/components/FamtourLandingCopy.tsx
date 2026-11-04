"use client";

type DividerProps = {
  children: string;
};

function EditorialDivider({ children }: DividerProps) {
  return (
    <div
      className="mx-auto mb-8 flex max-w-md items-center gap-5"
      aria-label={children}
    >
      <span className="h-px flex-1 bg-black/10" />
      <span className="whitespace-nowrap font-sans text-[0.65rem] uppercase tracking-[0.22em] text-[var(--color-destinos-turquoise)]">
        {children}
      </span>
      <span className="h-px flex-1 bg-black/10" />
    </div>
  );
}

export function OpenEditionsHeading() {
  return (
    <header className="mb-10 text-center">
      <EditorialDivider>FAMTOUR 2027</EditorialDivider>
      <h2 className="m-0 font-serif text-[2.5rem] font-light text-[#191010]">
        Edições abertas
      </h2>
    </header>
  );
}

export function InterestFormHeading() {
  return (
    <header className="mb-10 text-center">
      <EditorialDivider>PRÉ-INSCRIÇÃO</EditorialDivider>
      <h2 className="m-0 font-serif text-[clamp(2rem,4vw,2.8rem)] font-light leading-[1.15] text-[#191010]">
        Pronto para viver essa experiência?
      </h2>
      <p className="mt-5 font-sans text-[0.92rem] leading-[1.72] text-black/75">
        Selecione a edição que mais combina com você e conte um pouco sobre seu
        perfil. Nossa equipe entrará em contato para apresentar os detalhes,
        esclarecer dúvidas e orientar os próximos passos.
      </p>
    </header>
  );
}
