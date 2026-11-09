import feiraImage from "@/assets/feira.jpg";
import workshopImage from "@/assets/workshop.jpg";
import { institutionalProjectContent } from "@/content/institutional-projects";

export type { InstitutionalProjectId } from "@/content/institutional-projects";

export const institutionalProjects = {
  feira: {
    ...institutionalProjectContent.feira,
    image: feiraImage.src,
    brand: { src: "/assets/brand/feira-tendencia.webp", alt: "New Wed Feira Tendência", width: 156, height: 44 },
  },
  guia: {
    ...institutionalProjectContent.guia,
    image: "/assets/brand/guia-duas-revistas.webp",
    imageAlt: "Duas capas do New Wed Guia Nordeste lado a lado",
    brand: { src: "/assets/brand/guia-nordeste.webp", alt: "New Wed Guia Nordeste", width: 106, height: 57 },
  },
  workshop: {
    ...institutionalProjectContent.workshop,
    image: workshopImage.src,
  },
} as const;
