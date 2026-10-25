import alagoasImageAsset from "@/assets/dest-milagres.jpg";
import {publishedFamtourEditions} from "@/content/famtour-editions";
import type {FamtourEdition,LegacyFamTour} from "@/content/famtour-editions";
export type {FamtourEdition,LegacyFamTour} from "@/content/famtour-editions";
export const FAMTOUR_EDITIONS:readonly FamtourEdition[]=publishedFamtourEditions.map(edition=>edition.slug==='famtour-alagoas-fevereiro-2027'?{...edition,imagem:alagoasImageAsset.src}:edition);

export function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

export function getFamtourBySlug(slug: string): FamtourEdition | undefined {
  return FAMTOUR_EDITIONS.find((edition) => edition.slug === slug);
}

export function buildSuccessWhatsAppMessage(
  nome: string,
  famtourNome: string,
) {
  return `Oi! Acabei de fazer minha pré-inscrição no Famtour Newed Destinos. Meu nome é ${nome} e quero saber mais sobre a edição ${famtourNome}.`;
}

export function toLegacyFamTour(edition: FamtourEdition): LegacyFamTour {
  return {
    id: edition.id,
    slug: edition.slug,
    nome: edition.nome,
    label: edition.label,
    sub: `${edition.destino} • ${edition.periodo}`,
    data_inicio: edition.dataInicio,
    data_fim: edition.dataFim,
    vagas_restantes: edition.vagas,
    preco_a_partir_de: formatCurrency(edition.valorAVistaCentavos),
    imagem: edition.imagem ?? "",
    bullets: [...edition.inclusos],
  };
}
