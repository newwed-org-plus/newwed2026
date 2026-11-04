const PARCEIROS = [
  { name: "Azul", src: "/azul- branca.webp", height: 32 },
  { name: "Empetur", src: "/empetur - Branca.webp", height: 42 },
] as const;

export function ParceirosLogos() {
  return (
    <section id="parceiros" aria-label="Marcas e Parceiros" className="bg-[#f7f4ee] px-6 py-8 md:px-12">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-5 text-center text-[10px] font-normal tracking-[0.22em] text-[var(--color-destinos-marsala)] uppercase">Marcas e parceiros</h2>
        <ul aria-label="Logomarcas parceiras" className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:gap-5">
          {PARCEIROS.map((partner) => (
            <li key={partner.name} className="flex min-w-0 items-center justify-center bg-destinos-turquoise px-4 py-5">
              <img src={partner.src} alt={partner.name} loading="lazy" style={{ height: partner.height, maxHeight: partner.height, width: "auto", maxWidth: "100%", objectFit: "contain" }} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
