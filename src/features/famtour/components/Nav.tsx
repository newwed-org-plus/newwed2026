"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { FAMTOUR_NAVIGATION, famtourSectionHref } from "@/features/famtour/navigation";

export function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const href = (id: string) => famtourSectionHref(pathname, id);
  const links = [...FAMTOUR_NAVIGATION, { id: "form", label: "Falar com a equipe" }];

  return (
    <nav aria-label="Navegação FAMTOUR" className="border-b border-[#7c2341]/15 bg-[#f5faf9] text-destinos-ink">
      <div className="mx-auto max-w-[1440px] px-6 md:px-12">
        <button
          type="button"
          aria-label="Abrir seções de Destinos"
          aria-expanded={open}
          aria-controls="famtour-section-menu"
          onClick={() => setOpen(value => !value)}
          className="min-h-11 font-sans text-xs font-semibold lg:hidden"
        >
          Seções de Destinos <span aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
        <div id="famtour-section-menu" className={`${open ? "flex" : "hidden"} flex-wrap gap-x-6 gap-y-1 pb-3 lg:flex lg:justify-end lg:pb-0`}>
          {links.map(link => (
            <a key={link.id} href={href(link.id)} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center font-sans text-xs hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
              {link.label}
            </a>
          ))}
          <a href="/#projetos" className="inline-flex min-h-11 items-center font-sans text-xs hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">Projetos do grupo</a>
        </div>
      </div>
    </nav>
  );
}
