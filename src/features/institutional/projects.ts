import feiraImage from "@/assets/feira.jpg";
import workshopImage from "@/assets/workshop.jpg";
import {institutionalProjectContent} from "@/content/institutional-projects";
export type {InstitutionalProjectId} from "@/content/institutional-projects";
export const institutionalProjects={
 feira:{...institutionalProjectContent.feira,image:feiraImage.src},
 guia:{...institutionalProjectContent.guia,image:"/assets/brand/guia-duas-revistas.webp",imageAlt:"Duas capas do New Wed Guia Nordeste lado a lado"},
 workshop:{...institutionalProjectContent.workshop,image:workshopImage.src},
} as const;
