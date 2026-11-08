type Flight = {
  route: string;
  numbers: string;
  departure: string;
  arrival: string;
};

export const famtourPaymentMethods = ["PIX", "CREDIT_CARD"] as const;
export type FamtourPaymentMethod = (typeof famtourPaymentMethods)[number];

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
  valorCartaoCentavos: number;
  valorAVistaCentavos: number;
  imagem?: string;
  imagemAlt?: string;
  aereoIncluso: true;
  voos: { ida: Flight; volta: Flight };
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
  "Aéreo incluso com saída de Congonhas",
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
    parcelaCentavos: 66810,
    valorCartaoCentavos: 801729,
    valorAVistaCentavos: 769700,
    imagem: "/assets/destinos/alagoas-2027.webp",
    imagemAlt: "Grupo em uma área arborizada à beira-mar em Alagoas",
    aereoIncluso: true,
    voos: {
      ida: { route: "Congonhas (CGH) → Maceió (MCZ)", numbers: "2454", departure: "06:00", arrival: "08:55" },
      volta: { route: "Recife (REC) → Congonhas (CGH)", numbers: "4277", departure: "16:35", arrival: "20:05" },
    },
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
    parcelaCentavos: 60735,
    valorCartaoCentavos: 728824,
    valorAVistaCentavos: 699700,
    imagem: "/famtour-rn.webp",
    imagemAlt: "Paisagem do Rio Grande do Norte",
    aereoIncluso: true,
    voos: {
      ida: { route: "Congonhas (CGH) → Natal (NAT)", numbers: "2455", departure: "06:15", arrival: "09:40" },
      volta: { route: "Natal (NAT) → Congonhas (CGH)", numbers: "2562 / 6419", departure: "11:15", arrival: "17:20" },
    },
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
    parcelaCentavos: 69414,
    valorCartaoCentavos: 832976,
    valorAVistaCentavos: 799700,
    imagem: "/famtour-noronha.webp",
    imagemAlt: "Paisagem de Fernando de Noronha",
    aereoIncluso: true,
    voos: {
      ida: { route: "Congonhas (CGH) → Fernando de Noronha (FEN)", numbers: "4004 / 4255", departure: "07:40", arrival: "15:50" },
      volta: { route: "Fernando de Noronha (FEN) → Congonhas (CGH)", numbers: "4091 / 6085", departure: "16:30", arrival: "21:30" },
    },
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
    parcelaCentavos: 60735,
    valorCartaoCentavos: 728824,
    valorAVistaCentavos: 699700,
    imagem: "/assets/destinos/ceara-2027.webp",
    imagemAlt: "Praia do Cumbuco, no Ceará",
    aereoIncluso: true,
    voos: {
      ida: { route: "Congonhas (CGH) → Fortaleza (FOR)", numbers: "4004 / 4035", departure: "07:40", arrival: "14:40" },
      volta: { route: "Fortaleza (FOR) → Congonhas (CGH)", numbers: "4656 / 4145", departure: "10:15", arrival: "16:10" },
    },
    inclusos: INCLUSOS,
  },
] as const;

