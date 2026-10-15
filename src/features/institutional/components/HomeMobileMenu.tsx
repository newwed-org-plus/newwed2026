"use client";

import { useRef } from "react";
import { institutionalNavigation } from "../navigation";

export function HomeMobileMenu() {
  const menu = useRef<HTMLDetailsElement>(null);

  return (
    <details className="nw-mobile-menu" ref={menu}>
      <summary aria-label="Abrir menu"><span /><span /><span /></summary>
      <nav aria-label="Navegação principal mobile">
        {institutionalNavigation.map((item) => (
          <a
            href={item.href}
            key={item.id}
            onClick={() => { if (menu.current) menu.current.open = false; }}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </details>
  );
}
