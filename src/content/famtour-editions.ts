export type FamtourEdition = {
  id: string;
  slug: string;
  destino: string;
  nome: string;
  label: string;
  periodo: string;
  dataInicio: string;
  dataFim: string;
  vagas: number;
  parcelaQuantidade: 12;
  parcelaCentavos: number;
  valorAVistaCentavos: number;
  imagem?: string;
  imagemAlt?: string;
  aereoIncluso: true;
  inclusos: readonly string[];
};

export type LegacyFamTour = {
  id: string;
  slug: string;
  nome: string;
  label: string;
  sub: string;
  data_inicio: string;
  data_fim: string;
  vagas_restantes: number;
  preco_a_partir_de: string;
  imagem: string;
  bullets: string[];
};

const INCLUSOS = [
  "Aéreo incluso",
  "Hospedagem em pousada selecionada",
  "Visitas técnicas e experiências imersivas no destino",
  "Bastidores com fornecedores locais selecionados",
] as const;

export const publishedFamtourEditions: readonly FamtourEdition[] = [
  {
    id: "famtour-alagoas-fevereiro-2027",
    slug: "famtour-alagoas-fevereiro-2027",
    destino: "Alagoas",
    nome: "Famtour Alagoas",
    label: "EDIÇÃO • FEVEREIRO 2027",
    periodo: "21 a 25 de fevereiro de 2027",
    dataInicio: "2027-02-21",
    dataFim: "2027-02-25",
    vagas: 18,
    parcelaQuantidade: 12,
    parcelaCentavos: 64142,
    valorAVistaCentavos: 769700,
    imagemAlt: "Paisagem de São Miguel dos Milagres, em Alagoas",
    aereoIncluso: true,
    inclusos: INCLUSOS,
  },
  {
    id: "famtour-rn-abril-2027",
    slug: "famtour-rn-abril-2027",
    destino: "Rio Grande do Norte",
    nome: "Famtour Rio Grande do Norte",
    label: "EDIÇÃO • ABRIL 2027",
    periodo: "4 a 8 de abril de 2027",
    dataInicio: "2027-04-04",
    dataFim: "2027-04-08",
    vagas: 18,
    parcelaQuantidade: 12,
    parcelaCentavos: 58308,
    valorAVistaCentavos: 699700,
    imagem: "/famtour-rn.webp",
    imagemAlt: "Paisagem do Rio Grande do Norte",
    aereoIncluso: true,
    inclusos: INCLUSOS,
  },
  {
    id: "famtour-noronha-maio-2027",
    slug: "famtour-noronha-maio-2027",
    destino: "Fernando de Noronha",
    nome: "Famtour Fernando de Noronha",
    label: "EDIÇÃO • MAIO 2027",
    periodo: "2 a 6 de maio de 2027",
    dataInicio: "2027-05-02",
    dataFim: "2027-05-06",
    vagas: 15,
    parcelaQuantidade: 12,
    parcelaCentavos: 66642,
    valorAVistaCentavos: 799700,
    imagem: "/famtour-noronha.webp",
    imagemAlt: "Paisagem de Fernando de Noronha",
    aereoIncluso: true,
    inclusos: INCLUSOS,
  },
  {
    id: "famtour-ceara-agosto-2027",
    slug: "famtour-ceara-agosto-2027",
    destino: "Ceará",
    nome: "Famtour Ceará",
    label: "EDIÇÃO • AGOSTO 2027",
    periodo: "15 a 19 de agosto de 2027",
    dataInicio: "2027-08-15",
    dataFim: "2027-08-19",
    vagas: 18,
    parcelaQuantidade: 12,
    parcelaCentavos: 58308,
    valorAVistaCentavos: 699700,
    aereoIncluso: true,
    inclusos: INCLUSOS,
  },
] as const;

