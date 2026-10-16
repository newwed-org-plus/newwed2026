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
      <HomeMobileMenu />
    </header>
  );
}
