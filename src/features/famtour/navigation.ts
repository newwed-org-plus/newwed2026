export const FAMTOUR_NAVIGATION = [
  { id: "experiencia", label: "Sobre o FAMTOUR" },
  { id: "edicoes-anteriores", label: "Edições anteriores" },
  { id: "famtours", label: "Edições abertas" },
  { id: "parceiros", label: "Parceiros" },
] as const;

export function famtourSectionHref(pathname: string, id: string) {
  return `${pathname === "/destinos" ? "" : "/destinos"}#${id}`;
}
