import { Instagram } from "lucide-react";
import { PROJECT_INSTAGRAM_URLS } from "../contact";
import Link from "next/link";
import { institutionalNavigation } from "../navigation";
import { HomeMobileMenu } from "./HomeMobileMenu";

export function InstitutionalHeader({ currentProject }: { currentProject?: string }) {
  return (
    <header className="nw-header">
      <Link href="/" className="nw-logo" aria-label="Grupo New Wed, página inicial">
        <img src="/assets/brand/new-wed-marsala.png" width={1167} height={927} alt="New Wed" />
      </Link>
      <nav className="nw-nav" aria-label="Navegação principal">
        {institutionalNavigation.map((item) => (
          <a href={item.href} key={item.id} aria-current={item.id === currentProject ? "page" : undefined}>{item.label}</a>
        ))}
      </nav>
      {currentProject === "feira" ? (
        <div className="nw-header-actions">
          <a className="nw-header-instagram" href={PROJECT_INSTAGRAM_URLS.feira} target="_blank" rel="noopener noreferrer" aria-label="Instagram New Wed Feira">
            <Instagram size={23} aria-hidden="true" />
          </a>
          <HomeMobileMenu />
        </div>
      ) : <HomeMobileMenu />}
    </header>
  );
}
