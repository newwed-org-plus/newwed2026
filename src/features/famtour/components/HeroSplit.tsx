"use client";

import { useEffect, useRef, useState } from "react";

/**
 * CARROSSEL DE IMAGENS — painel direito do HeroSplit
 * Imagens servidas direto da pasta /public — sem import.
 * Para adicionar fotos, edite o array SLIDES abaixo.
 */
const SLIDES = [
  "/LE040347.webp",
  "/LE049367.webp",
  "/WhatsApp-Image-2018-12-26-at-10.03.03.webp",
  "/LE048829.webp",
];

/** Intervalo em ms entre cada slide */
const INTERVAL_MS = 5000;

export function HeroSplit({ onCta }: { onCta: () => void }) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = (index: number) => {
    setCurrent(index);
  };

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % SLIDES.length);
    }, INTERVAL_MS);
  };

  useEffect(() => {
    if (SLIDES.length <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <section
      id="inicio"
      className="relative grid min-h-[calc(100svh-4rem)] grid-cols-1 overflow-hidden md:min-h-[90vh] md:grid-cols-[36%_64%]"
    >
      {/* ── Painel esquerdo — branco ── */}
      <div className="absolute inset-x-0 top-0 z-[4] flex flex-col items-start px-5 pt-5 md:relative md:items-center md:justify-center md:bg-white md:px-8 md:py-16">
        <div
          className="w-full max-w-[230px] bg-white/95 px-4 py-3 shadow-[0_12px_36px_rgba(25,16,16,0.12)] md:max-w-[360px] md:bg-transparent md:p-0 md:shadow-none"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <img
            src="/logo-newed-destinos-transparent.png"
            alt="Newed Destinos"
            width={225}
            height={225}
            className="w-full max-w-[150px] md:max-w-[225px]"
            style={{
              display: "block",
              height: "auto",
              objectFit: "contain",
            }}
          />
          <div
            className="mt-1.5 text-[0.54rem] md:mt-5 md:text-[clamp(0.62rem,1.2vw,0.78rem)]"
            style={{
              fontFamily: "'Fedra Sans Std', sans-serif",
              fontWeight: 350,
              letterSpacing: "0.12em",
              color: "#2E8E8E",
              lineHeight: 1.6,
              textTransform: "uppercase",
            }}
          >
            RIO GRANDE DO NORTE • ALAGOAS • FERNANDO DE NORONHA • CEARÁ
          </div>
          <div
            className="mt-2 text-[0.56rem] md:mt-8 md:text-[0.7rem]"
            style={{
              fontFamily: "'Fedra Sans Std', sans-serif",
              fontWeight: 350,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#2E8E8E",
            }}
          >
            FAMTOUR • EDIÇÃO 2027
          </div>
        </div>
      </div>

      {/* ── Painel direito — carrossel com fade ── */}
      <div
        className="relative min-h-[calc(100svh-4rem)] overflow-hidden md:min-h-[90vh]"
        style={{ background: "#0a2b28" }}
      >
        {/* Camadas de imagem: todas absolutas, só a ativa tem opacity 1 */}
        {SLIDES.map((src, i) => (
          <div
            key={src}
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url('${src}')`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: i === current ? 1 : 0,
              transition: "opacity 1.2s ease",
              zIndex: 1,
            }}
          />
        ))}

        {/* Overlay escuro para contraste do texto */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(0,0,0,0.68) 0%, rgba(10,43,40,0.60) 100%)",
            zIndex: 2,
          }}
        />

        {/* Conteúdo textual — acima de tudo */}
        <div
          className="relative z-[3] flex min-h-[calc(100svh-4rem)] flex-col items-start justify-end px-6 pb-20 pt-52 sm:px-8 md:min-h-[90vh] md:justify-center md:px-16 md:py-20"
        >
          <div className="max-w-xl">
            <div
              style={{
                width: 80,
                height: 1,
                background: "rgba(255,255,255,0.5)",
                marginBottom: "1.5rem",
              }}
            />
            <h1
              style={{
                fontFamily: "'BlockGothicRR', sans-serif",
                fontWeight: 500,
                textTransform: "uppercase",
                fontSize: "clamp(3rem, 14vw, 5rem)",
                color: "#FFFFFF",
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              FAMTOUR
              <br />
              NORDESTE
              <br />
              EDIÇÃO 2027
            </h1>
            <div
              style={{
                width: 80,
                height: 1,
                background: "rgba(255,255,255,0.5)",
                margin: "1.5rem 0 2rem",
              }}
            />
            <button
              type="button"
              onClick={onCta}
              className="w-full max-w-[290px] md:w-auto"
              style={{
                background: "#FFFFFF",
                color: "#7A2535",
                padding: "1rem 2rem",
                borderRadius: 0,
                fontFamily: "'Fedra Sans Std', sans-serif",
                fontWeight: 350,
                fontSize: "0.85rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                border: "none",
                cursor: "pointer",
              }}
            >
              Ver edições abertas
            </button>
            <div
              style={{
                marginTop: "1rem",
                fontFamily: "'Fedra Sans Std', sans-serif",
                fontWeight: 350,
                fontSize: "0.75rem",
                color: "rgba(255,255,255,0.8)",
              }}
            >
              4 EDIÇÕES • VAGAS LIMITADAS
            </div>
          </div>

          {/* Indicadores de slide (bolinhas) */}
          {SLIDES.length > 1 && (
            <div className="absolute bottom-6 right-6 flex gap-2 md:left-16 md:right-auto">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Slide ${i + 1}`}
                  onClick={() => {
                    goTo(i);
                    resetTimer();
                  }}
                  style={{
                    width: i === current ? 24 : 8,
                    height: 8,
                    borderRadius: 4,
                    border: "none",
                    background:
                      i === current ? "#FFFFFF" : "rgba(255,255,255,0.4)",
                    cursor: "pointer",
                    padding: 0,
                    transition: "width 0.35s ease, background 0.35s ease",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
