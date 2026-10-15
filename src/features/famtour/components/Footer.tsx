"use client";

import { usePathname } from "next/navigation";
import { FAMTOUR_NAVIGATION, famtourSectionHref } from "@/features/famtour/navigation";
import {
  WHATSAPP_URL,
  EMAIL,
  INSTAGRAM_FEIRA_URL,
  INSTAGRAM_GUIA_URL,
  INSTAGRAM_DESTINOS_URL,
  INSTAGRAM_WORKSHOP_URL,
  CITY,
} from "@/features/famtour/contact";

export function Footer() {
  const pathname = usePathname();
  const href = (id: string) => famtourSectionHref(pathname, id);
  const participation = [
    { id: "inicio", label: "Início" },
    { id: "form", label: "Falar com a equipe" },
  ];
  return (
    <footer className="bg-dark border-t border-cream/10">
      <div className="px-6 md:px-12 py-14 md:py-16 grid grid-cols-2 md:grid-cols-4 gap-10">
        <div className="col-span-2 md:col-span-1">
          <div className="serif text-cream text-xl tracking-[0.18em]">
            NEW WED
          </div>
          <p className="text-[11px] text-cream/45 leading-[1.7] mt-4 font-light max-w-[220px]">
            O maior ecossistema de conexões para o mercado de casamento no
            Nordeste. Curadoria e autoridade desde 2014.
          </p>
          <div className="text-[9px] tracking-[0.2em] uppercase text-cream/35 mt-5 font-light">
            {CITY}
          </div>
        </div>

        <div>
          <div className="text-[8px] tracking-[0.3em] uppercase text-cream/40 mb-4 font-light">
            FAMTOUR
          </div>
          <ul className="flex flex-col gap-2.5 text-[11px] text-cream/55 font-light">
            {FAMTOUR_NAVIGATION.map((l) => (
              <li key={l.id}>
                <a href={href(l.id)} className="hover:text-cream transition-colors">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-[8px] tracking-[0.3em] uppercase text-cream/40 mb-4 font-light">
            Participe
          </div>
          <ul className="flex flex-col gap-2.5 text-[11px] text-cream/55 font-light">
            <li><a href="/" className="hover:text-cream transition-colors">Grupo New Wed</a></li>
            <li><a href="/#projetos" className="hover:text-cream transition-colors">Projetos do grupo</a></li>
            {participation.map((l) => (
              <li key={l.id}>
                <a href={href(l.id)} className="hover:text-cream transition-colors">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-[8px] tracking-[0.3em] uppercase text-cream/40 mb-4 font-light">
            Contato
          </div>
          <ul className="flex flex-col gap-2.5 text-[11px] text-cream/55 font-light">
            <li>
              <a
                href={WHATSAPP_URL}
                className="hover:text-cream transition-colors"
              >
                WhatsApp
              </a>
            </li>
            <li>
              <a
                href={`mailto:${EMAIL}`}
                className="hover:text-cream transition-colors break-all"
              >
                {EMAIL}
              </a>
            </li>
            <li>
              <a
                href={INSTAGRAM_FEIRA_URL}
                className="hover:text-cream transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                @new_wed_feira
              </a>
            </li>
            <li>
              <a
                href={INSTAGRAM_GUIA_URL}
                className="hover:text-cream transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                @new_wed_guianordeste
              </a>
            </li>
            <li>
              <a
                href={INSTAGRAM_DESTINOS_URL}
                className="hover:text-cream transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                @new_wed_destinos
              </a>
            </li>
            <li>
              <a
                href={INSTAGRAM_WORKSHOP_URL}
                className="hover:text-cream transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                @new_wed_workshop
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-cream/10 px-6 md:px-12 py-5 flex flex-col md:flex-row items-center justify-between gap-3 text-[8px] tracking-[0.2em] uppercase text-cream/30 font-light">
        <div>© 2027 · Grupo New Wed · Todos os direitos reservados</div>
        <div className="flex gap-5">
          <a href={href("experiencia")} className="hover:text-cream/60 transition-colors">
            Sobre o FAMTOUR
          </a>
          <a href={href("form")} className="hover:text-cream/60 transition-colors">
            Contato
          </a>
        </div>
      </div>
    </footer>
  );
}
