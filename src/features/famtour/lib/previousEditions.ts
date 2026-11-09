import pipaCover from "@/assets/pipa.jpg";
import {famtourInformation} from '@/content/famtour-information';

const noronhaCover = "/assets/destinos/noronha-2026.webp";
const rioGrandeDoNorteCover = "/assets/destinos/rio-grande-do-norte-2026.webp";
const alagoasCover = "/assets/destinos/alagoas-2026.webp";

export type PreviousEditionMedia =
  | {
      type: "image";
      src: string;
      alt: string;
    }
  | {
      type: "video";
      src: string;
      title: string;
      poster?: string;
    };

export type PreviousEdition = {
  slug: string;
  destino: string;
  ano: number;
  capa: string;
  capaAlt: string;
  videoUrl?: string;
  galeria: readonly PreviousEditionMedia[];
};

export const PREVIOUS_EDITIONS: readonly PreviousEdition[] = [
  {
    ...famtourInformation.previousEditions[0],
    capa: noronhaCover,
    videoUrl: "/destinos/edicoes/fernando-de-noronha-2026#video",
    capaAlt: "Praia de Fernando de Noronha ao pôr do sol",
    galeria: [
      {
        type: "video",
        src: "/assets/destinos/videos/noronha-2026.mp4",
        title: "Trailer do Famtour Fernando de Noronha 2026",
        poster: noronhaCover,
      },
    ],
  },
  {
    ...famtourInformation.previousEditions[1],
    capa: rioGrandeDoNorteCover,
    capaAlt: "Praia com falésias no Rio Grande do Norte",
    galeria: [
      {
        type: "image",
        src: rioGrandeDoNorteCover,
        alt: "Praia com falésias no Rio Grande do Norte",
      },
    ],
  },
  {
    ...famtourInformation.previousEditions[2],
    capa: alagoasCover,
    videoUrl: "https://drive.google.com/file/d/1qXtoGNpkbzF71cIAC7oHeRJRLGRF552P/view",
    capaAlt: "Capela branca à beira-mar em Alagoas",
    galeria: [
      {
        type: "image",
        src: alagoasCover,
        alt: "Capela branca à beira-mar em Alagoas",
      },
    ],
  },
  {
    slug: "pipa-2025",
    destino: "Pipa",
    ano: 2025,
    capa: pipaCover.src,
    capaAlt: "Vista da costa de Pipa",
    videoUrl: "https://drive.google.com/file/d/1mnEmQ36A0sJ5eT9i6qeWhgcWfhqQnon-/view",
    galeria: [{ type: "image", src: pipaCover.src, alt: "Vista da costa de Pipa" }],
  },
];

export function getPreviousEditionBySlug(slug: string) {
  return PREVIOUS_EDITIONS.find((edition) => edition.slug === slug);
}
