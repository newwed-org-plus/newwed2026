"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { FAMTOUR_NAVIGATION, famtourSectionHref } from "@/features/famtour/navigation";

export function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const href = (id: string) => famtourSectionHref(pathname, id);
  return (
    <nav aria-label="Navegação FAMTOUR" className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-dark/80 border-b border-cream/10">
      <div className="flex items-center justify-between px-6 md:px-12 py-4">
        <a
          href={href("inicio")}
          onClick={() => setOpen(false)}
          className="serif whitespace-nowrap text-cream tracking-[0.18em] text-lg md:text-xl font-light"
        >
          NEW WED
        </a>
        <div className="hidden lg:flex gap-5 text-[10px] uppercase tracking-[0.2em] text-smoke font-light">
          {FAMTOUR_NAVIGATION.map((l) => (
            <a
              key={l.id}
              href={href(l.id)}
              className="hover:text-cream transition-colors"
            >
              {l.label}
            </a>
          ))}
          <a href={href("form")} className="hover:text-cream transition-colors">Contato</a>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" className="whitespace-nowrap text-[11px] text-cream underline underline-offset-4 hover:text-cream/75">
            Grupo New Wed
          </a>
          <a href="/#projetos" className="hidden lg:inline-flex text-[11px] text-smoke hover:text-cream">
            Projetos
          </a>
          <button
            aria-label="Abrir menu"
            aria-expanded={open}
            aria-controls="famtour-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden w-9 h-9 flex flex-col items-center justify-center gap-1.5 text-cream"
          >
            <span className={`block w-5 h-px bg-cream transition-transform ${open ? "translate-y-[3px] rotate-45" : ""}`} />
            <span className={`block w-5 h-px bg-cream transition-transform ${open ? "-translate-y-[3px] -rotate-45" : ""}`} />
          </button>
        </div>
      </div>
      {open && (
        <div id="famtour-mobile-menu" className="lg:hidden border-t border-cream/10 bg-dark/95 px-6 py-6 flex flex-col gap-5 text-[11px] uppercase tracking-[0.2em] text-smoke font-light">
          {FAMTOUR_NAVIGATION.map((l) => (
            <a
              key={l.id}
              href={href(l.id)}
              onClick={() => setOpen(false)}
              className="hover:text-cream transition-colors"
            >
              {l.label}
            </a>
          ))}
          <a href="/#projetos" onClick={() => setOpen(false)} className="hover:text-cream transition-colors">
            Projetos do grupo
          </a>
          <a
            href={href("form")}
            onClick={() => setOpen(false)}
            className="btn btn-solid !py-2 !px-4 text-[9px] self-start"
          >
            Falar com a equipe
          </a>
        </div>
      )}
    </nav>
  );
}
