import feiraImage from "@/assets/feira.jpg";
import guiaImage from "@/assets/guia.jpg";
import workshopImage from "@/assets/workshop.jpg";
import {institutionalProjectContent} from "@/content/institutional-projects";
export type {InstitutionalProjectId} from "@/content/institutional-projects";
export const institutionalProjects={
 feira:{...institutionalProjectContent.feira,image:feiraImage.src},
 guia:{...institutionalProjectContent.guia,image:guiaImage.src},
 workshop:{...institutionalProjectContent.workshop,image:workshopImage.src},
} as const;
