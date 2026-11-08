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
  galeria: readonly PreviousEditionMedia[];
};

export const PREVIOUS_EDITIONS = [
  {
    ...famtourInformation.previousEditions[0],
    capa: noronhaCover,
    capaAlt: "Praia de Fernando de Noronha ao pôr do sol",
    galeria: [
      {
        type: "image",
        src: noronhaCover,
        alt: "Praia de Fernando de Noronha ao pôr do sol",
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
    capaAlt: "Capela branca à beira-mar em Alagoas",
    galeria: [
      {
        type: "image",
        src: alagoasCover,
        alt: "Capela branca à beira-mar em Alagoas",
      },
    ],
  },
] as const satisfies readonly PreviousEdition[];

export function getPreviousEditionBySlug(slug: string) {
  return PREVIOUS_EDITIONS.find((edition) => edition.slug === slug);
}
