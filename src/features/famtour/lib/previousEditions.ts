import noronhaCoverAsset from "@/assets/fantour-noronha.jpg";
import {famtourInformation} from '@/content/famtour-information';
const noronhaCover = noronhaCoverAsset.src;
import rioGrandeDoNorteCoverAsset from "@/assets/dest-rn.jpg";
const rioGrandeDoNorteCover = rioGrandeDoNorteCoverAsset.src;
import alagoasCoverAsset from "@/assets/dest-milagres.jpg";
const alagoasCover = alagoasCoverAsset.src;

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
    capaAlt: "Edição anterior em Fernando de Noronha",
    galeria: [
      {
        type: "image",
        src: noronhaCover,
        alt: "Edição anterior em Fernando de Noronha",
      },
    ],
  },
  {
    ...famtourInformation.previousEditions[1],
    capa: rioGrandeDoNorteCover,
    capaAlt: "Edição anterior no Rio Grande do Norte",
    galeria: [
      {
        type: "image",
        src: rioGrandeDoNorteCover,
        alt: "Edição anterior no Rio Grande do Norte",
      },
    ],
  },
  {
    ...famtourInformation.previousEditions[2],
    capa: alagoasCover,
    capaAlt: "Edição anterior em Alagoas",
    galeria: [
      {
        type: "image",
        src: alagoasCover,
        alt: "Edição anterior em Alagoas",
      },
    ],
  },
] as const satisfies readonly PreviousEdition[];

export function getPreviousEditionBySlug(slug: string) {
  return PREVIOUS_EDITIONS.find((edition) => edition.slug === slug);
}
