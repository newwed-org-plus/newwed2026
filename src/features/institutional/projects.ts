import { institutionalProjectContent } from "@/content/institutional-projects";

export type { InstitutionalProjectId } from "@/content/institutional-projects";

export const institutionalProjects = {
  feira: {
    ...institutionalProjectContent.feira,
    image: "/assets/brand/feira-abertura.webp",
    imageAlt: "Profissional diante dos estandes da New Wed Feira",
    brand: { src: "/assets/brand/feira-tendencia.webp", alt: "New Wed Feira Tendência", width: 156, height: 44 },
  },
  guia: {
    ...institutionalProjectContent.guia,
    image: "/assets/brand/guia-home-horizontal.webp",
    imageAlt: "Duas capas do New Wed Guia Nordeste lado a lado",
    brand: { src: "/assets/brand/guia-nordeste.webp", alt: "New Wed Guia Nordeste", width: 106, height: 57 },
  },
  workshop: {
    ...institutionalProjectContent.workshop,
    image: "/assets/brand/workshop-abertura.webp",
    imageAlt: "Participantes reunidos à mesa no New Wed Workshop",
    brand: { src: "/assets/brand/workshop-nordeste.webp", alt: "New Wed Workshop Nordeste", width: 76, height: 112 },
  },
} as const;
