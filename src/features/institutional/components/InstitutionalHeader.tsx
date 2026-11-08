import { Instagram } from "lucide-react";
import { INSTAGRAM_URL, PROJECT_INSTAGRAM_URLS } from "../contact";
import Link from "next/link";
import { institutionalNavigation } from "../navigation";
import { HomeMobileMenu } from "./HomeMobileMenu";

export function InstitutionalHeader({ currentProject }: { currentProject?: keyof typeof PROJECT_INSTAGRAM_URLS }) {
  const instagramUrl = currentProject ? PROJECT_INSTAGRAM_URLS[currentProject] : INSTAGRAM_URL;
  const instagramLabel = currentProject === "feira" ? "Feira" : currentProject === "guia" ? "Guia Nordeste" : currentProject === "workshop" ? "Workshop" : currentProject === "destinos" ? "Destinos" : "Grupo";
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
      <div className="nw-header-actions">
        <a className="nw-header-instagram" href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label={`Instagram New Wed ${instagramLabel}`}>
          <Instagram size={23} aria-hidden="true" />
        </a>
        <HomeMobileMenu />
      </div>
    </header>
  );
}

export function DestinosSiteHeader() {
  return <div className="nw-home"><InstitutionalHeader currentProject="destinos" /></div>;
}
