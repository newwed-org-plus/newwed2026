"use client";

const PARCEIROS = [
  {
    name: "Azul",
    src: "/azul- branca.webp",
    height: 32,
  },
  {
    name: "Casar.com",
    src: "/casar-logo-white.svg",
    height: 34,
  },
  {
    name: "Assessoria VIP",
    src: "/assessoria-vip-white.png",
    height: 48,
  },
  {
    name: "Empetur",
    src: "/empetur - Branca.webp",
    height: 42,
  },
] as const;

const dividerStyle = {
  width: 1,
  height: 40,
  margin: "0 clamp(12px, 1.7vw, 22px)",
  flex: "0 0 auto",
  background: "rgba(231, 200, 138, 0.58)",
} as const;

type Partner = (typeof PARCEIROS)[number];

function PartnerLogo({
  partner,
  decorative,
  showDivider,
}: {
  partner: Partner;
  decorative: boolean;
  showDivider: boolean;
}) {
  const { name, src, height } = partner;

  return (
    <li
      role={decorative ? undefined : "listitem"}
      style={{
        display: "flex",
        flex: "0 0 auto",
        alignItems: "center",
      }}
    >
      <img
        src={src}
        alt={decorative ? "" : name}
        loading="lazy"
        style={{
          display: "block",
          width: "auto",
          height,
          maxHeight: height,
          objectFit: "contain",
          flex: "0 0 auto",
        }}
        onError={(event) => {
          event.currentTarget.style.display = "none";
          const fallback = event.currentTarget
            .nextElementSibling as HTMLElement | null;
          if (fallback) fallback.style.display = "inline-block";
        }}
      />
      <span
        aria-hidden={decorative || undefined}
        style={{
          display: "none",
          color: "#FFFFFF",
          fontFamily: "'Fedra Sans Std', sans-serif",
          fontSize: "0.78rem",
          fontWeight: 350,
          letterSpacing: "0.08em",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
      {showDivider ? <span aria-hidden="true" style={dividerStyle} /> : null}
    </li>
  );
}

function PartnerList({ decorative = false }: { decorative?: boolean }) {
  return (
    <ul
      aria-label={decorative ? undefined : "Logomarcas parceiras"}
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "list"}
      className={`partners-logo-list${decorative ? " partners-logo-list--duplicate" : ""}`}
      style={{
        margin: 0,
        padding: 0,
        display: "flex",
        flex: "0 0 auto",
        flexWrap: "nowrap",
        alignItems: "center",
        listStyle: "none",
      }}
    >
      {PARCEIROS.map((partner, index) => (
        <PartnerLogo
          key={`${decorative ? "duplicate" : "primary"}-${partner.name}`}
          partner={partner}
          decorative={decorative}
          showDivider={index < PARCEIROS.length - 1}
        />
      ))}
    </ul>
  );
}

/** Faixa compacta de marcas parceiras, com ticker contínuo no mobile. */
export function ParceirosLogos() {
  return (
    <section
      id="parceiros"
      aria-label="Marcas e Parceiros"
      style={{
        width: "100%",
        margin: 0,
        overflow: "hidden",
        background: "linear-gradient(100deg, #8A2638 0%, #5A1020 100%)",
      }}
    >
      <div
        className="partners-logo-ticker"
        style={{
          width: "100%",
          maxWidth: 1320,
          margin: "0 auto",
          padding: "20px clamp(16px, 4vw, 48px)",
          display: "flex",
          flexWrap: "nowrap",
          alignItems: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            flex: "0 0 auto",
            color: "#E7C88A",
            fontFamily: "'Fedra Sans Std', sans-serif",
            fontSize: "0.62rem",
            fontWeight: 350,
            letterSpacing: "0.22em",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          MARCAS E PARCEIROS
        </p>

        <span aria-hidden="true" style={dividerStyle} />

        <div
          aria-label="Logomarcas parceiras em movimento; mantenha o foco para pausar"
          className="partners-marquee-viewport min-w-0 flex-1 overflow-hidden"
          tabIndex={0}
        >
          <div className="partners-marquee-track">
            <PartnerList />
            <PartnerList decorative />
          </div>
        </div>
      </div>
      <style>{`
        @keyframes partners-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }

        .partners-marquee-track {
          display: flex;
          width: max-content;
          animation: partners-marquee 18s linear infinite;
          will-change: transform;
        }

        .partners-marquee-viewport:hover .partners-marquee-track,
        .partners-marquee-viewport:focus-within .partners-marquee-track {
          animation-play-state: paused;
        }

        .partners-logo-list {
          padding-right: 24px !important;
        }

        @media (min-width: 768px) {
          .partners-marquee-track {
            width: 100%;
            animation: none;
          }

          .partners-logo-list {
            width: 100%;
            flex: 1 1 auto !important;
            justify-content: space-between;
            padding-right: 0 !important;
          }

          .partners-logo-list--duplicate {
            display: none !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .partners-marquee-track {
            animation: none;
          }

          .partners-marquee-viewport {
            overflow-x: auto;
            scrollbar-width: none;
          }

          .partners-logo-list--duplicate {
            display: none !important;
          }
        }
      `}</style>
    </section>
  );
}
