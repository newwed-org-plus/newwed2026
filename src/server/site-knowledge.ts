import {homeProjects} from '@/content/home-projects';
import {institutionalProjectContent} from '@/content/institutional-projects';
import {publishedFamtourEditions} from '@/content/famtour-editions';
import type {AgentResult} from '@/features/conversations/model';

export const siteKnowledge={
 source:'Conteúdo publicado no site e nas landing pages New Wed',
 sources:['/','/feira','/guia','/workshop','/famtour'],
 organization:{name:'Grupo New Wed',founder:'Cindy Noel',location:'Recife, Pernambuco',focus:'Mercado de casamentos, eventos e turismo no Nordeste; relacionamento, curadoria e Destination Wedding.'},
 projects:homeProjects.map(({id,name,href,description})=>({id,name,href,description,...(id in institutionalProjectContent?{details:institutionalProjectContent[id as keyof typeof institutionalProjectContent]}:{details:{name:'FAMTOUR New Wed Destinos',audience:'Assessores e profissionais de casamentos',description:'Experiência fechada e curada de especialização nos destinos e no mercado de Destination Wedding, com visitas técnicas e conexões com fornecedores.'}})})),
 publishedEditions:publishedFamtourEditions.map(({slug,nome,destino,periodo,dataInicio,dataFim,parcelaQuantidade,parcelaCentavos,valorAVistaCentavos,inclusos,vagas})=>({slug,name:nome,destination:destino,period:periodo,startsAt:dataInicio,endsAt:dataFim,publishedInstallments:parcelaQuantidade,publishedInstallmentCents:parcelaCentavos,publishedCashCents:valorAVistaCentavos,publishedCapacity:vagas,included:inclusos,url:`/famtour/inscricao/${slug}`})),
 commercialPolicy:'Os preços, datas e condições publicados são referências da landing page. Capacidade anunciada não é quantidade de vagas restantes. Disponibilidade, lote atual e cobrança só podem ser confirmados pelo catálogo operacional verificado e pela equipe. Não inventar preço de Feira, Guia ou Workshop; o site orienta solicitar informações ou mídia kit.',
};
const plain=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function verifiedSiteAnswer(message:string):AgentResult|null {
 const text=plain(message);
 if(/ignore|instruc|finja|finge|system|prompt|reclam|humano|pessoa|comprar|pagar|cancelar|nao quero|nao me/.test(text))return null;
 let reply:string|null=null;
 if(/quais? (?:os )?(?:produtos|servicos|projetos)|o que (?:voce|voces|vcs|a new wed).*(?:vende|oferece|faz)|^produtos\??$/.test(text)){
  reply='A New Wed atua em quatro frentes:\n'+homeProjects.map(project=>`• ${project.name==='Destinos'?'Destinos / FAMTOUR':project.name}: ${project.description}`).join('\n')+'\nQual delas você quer conhecer melhor?';
 }else if(!/preco|valor|custa|vaga|desconto|pago|parcela/.test(text)){
  const keys=(['feira','guia','workshop'] as const).filter(key=>text.includes(key));
  if(keys.length===1&&(/o que|como|fale|explic|conhecer|formato|combo|oferec|funciona|quem/.test(text)||/^(?:a |o )?(?:feira(?: tendencia| new wed)?|guia(?: new wed)?|workshop(?: new wed)?)[.!?]*$/.test(text.trim()))){
   const project=institutionalProjectContent[keys[0]];
   const rows='formats' in project&&/formato|combo/.test(text)?project.formats:project.pillars;
   reply=`${project.name}: ${project.description}\n${rows.map(row=>`• ${row.title}: ${row.description}`).join('\n')}\nPosso ajudar com mais detalhes?`;
  }else if(/famtour|destinos/.test(text)&&/o que|como|quem|inclui|incluso|destino|edico|data|quando|aereo|hosped/.test(text)){
   if(/edico|destinos|data|quando/.test(text))reply='As edições anunciadas do FAMTOUR são:\n'+siteKnowledge.publishedEditions.map(edition=>`• ${edition.name}: ${edition.period}.`).join('\n')+'\nA disponibilidade atual deve ser confirmada com a equipe.';
   else reply='O FAMTOUR New Wed Destinos é uma experiência curada de especialização para assessores e profissionais de casamentos no mercado de Destination Wedding. As edições anunciadas incluem:\n'+publishedFamtourEditions[0].inclusos.map(item=>`• ${item}`).join('\n')+'\nQual destino você quer conhecer?';
  }
 }
 if(!reply||reply.length>1000)return null;
 return {reply,confidence:1,handoff:false,reason:'Informação obtida diretamente da base oficial compartilhada com o site.'};
}
