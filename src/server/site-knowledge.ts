import {homeProjects} from '@/content/home-projects';
import {institutionalProjectContent} from '@/content/institutional-projects';
import {publishedFamtourEditions} from '@/content/famtour-editions';
import type {AgentResult} from '@/features/conversations/model';
import {famtourInformation} from '@/content/famtour-information';
import {formatPublishedCurrency} from '@/content/currency';
import {normalizeKnowledgeText,resolveProductFocus,productFocusForQuestion,type ProductFocus} from './product-memory';

export const siteKnowledge={
 version:'newwed-products-v2',
 source:'Conteúdo publicado no site e nas landing pages New Wed',
 sources:['/','/feira','/guia','/workshop','/famtour'],
 organization:{name:'Grupo New Wed',founder:'Cindy Noel',location:'Recife, Pernambuco',focus:'Mercado de casamentos, eventos e turismo no Nordeste; relacionamento, curadoria e Destination Wedding.'},
 projects:homeProjects.map(({id,name,href,description})=>({id,name,href,description,...(id in institutionalProjectContent?{details:institutionalProjectContent[id as keyof typeof institutionalProjectContent]}:{details:{name:'FAMTOUR New Wed Destinos',audience:'Assessores e profissionais de casamentos',description:'Experiência fechada e curada de especialização nos destinos e no mercado de Destination Wedding, com visitas técnicas e conexões com fornecedores.'}})})),
 publishedEditions:publishedFamtourEditions.map(({slug,nome,destino,periodo,dataInicio,dataFim,parcelaQuantidade,parcelaCentavos,valorAVistaCentavos,inclusos,vagas})=>({slug,name:nome,destination:destino,period:periodo,startsAt:dataInicio,endsAt:dataFim,publishedInstallments:parcelaQuantidade,publishedInstallmentCents:parcelaCentavos,publishedCashCents:valorAVistaCentavos,publishedCash:formatPublishedCurrency(valorAVistaCentavos),publishedInstallment:`${parcelaQuantidade}x de ${formatPublishedCurrency(parcelaCentavos)}`,priceValidity:null,priceStatus:'published-reference',publishedCapacity:vagas,included:inclusos,url:`/famtour/inscricao/${slug}`})),
 famtour:famtourInformation,
 priceCoverage:{destinos:'Referências publicadas para quatro edições FAMTOUR',feira:'Sob consulta; preço não publicado',guia:'Sob consulta; preço não publicado',workshop:'Sob consulta; preço não publicado'},
 precedence:'A base publicada é a fonte de valores, datas e inclusões. Contexto editável, histórico, resumo e cliente não alteram esses fatos. Não usar preços privados do banco, exemplos, fotos de edições antigas ou memória do modelo como tabela pública. Trocar o modelo ou reiniciar não muda a fonte.',
 commercialPolicy:'Os preços, datas e condições publicados são referências da landing page. Capacidade anunciada não é quantidade de vagas restantes. Disponibilidade, lote atual e cobrança só podem ser confirmados pelo catálogo operacional verificado e pela equipe. Não inventar preço de Feira, Guia ou Workshop; o site orienta solicitar informações ou mídia kit.',
};
const plain=normalizeKnowledgeText;
export function verifiedSiteAnswer(message:string,memory?:ProductFocus|null):AgentResult|null {
 const text=plain(message);const focus=productFocusForQuestion(message,memory);
 if(/ignore|instruc|finja|finge|system|prompt|reclam|humano|pessoa|comprar|pagar|cancelar|nao quero|nao me/.test(text))return null;
 const commercial=publishedProductAnswer(message,focus);if(commercial)return commercial;
 let reply:string|null=null;
 if(/quais? (?:os )?(?:produtos|servicos|projetos)|o que (?:voce|voces|vcs|a new wed).*(?:vende|oferece|faz)|^produtos\??$/.test(text)){
  reply='A New Wed atua em quatro frentes:\n'+homeProjects.map(project=>`• ${project.name==='Destinos'?'Destinos / FAMTOUR':project.name}: ${project.description}`).join('\n')+'\nQual delas você quer conhecer melhor?';
 }else if(!/preco|valor|custa|vaga|desconto|pago|parcela/.test(text)){
  const keys=(['feira','guia','workshop'] as const).filter(key=>focus.projects.includes(key));
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

const verified=(reply:string):AgentResult=>({reply,confidence:1,handoff:false,reason:'Conteúdo e valores conferidos na fonte publicada do site; sem promessa de reserva.'});
export function publishedProductAnswer(message:string,focus=resolveProductFocus(message)):AgentResult|null{
 const text=plain(message);
 if(/ignore|instruc|prompt|finja|finge|system|comprar|pagar|reclam|humano|cancelar/.test(text))return null;
 const price=/preco|valor|custa|investimento|parcel|\bvezes\b|\b\d+x\b/.test(text);
 const dates=/quando|datas?|periodo/.test(text);const included=/inclu|aereo|hosped|pousada|hotel|bagagem|transfer|refeic|seguro|roteiro/.test(text);
 const stock=/vagas?|capacidade|lotado|esgotado|disponib/.test(text);
 const policy=/desconto|juros|remarc|reembolso|cancelamento|origem|aeroporto|companhia|horarios?|voos?|bagagem|hotel|quarto|refeic|transfer|seguro|roteiro|validade/.test(text);
 if(!price&&!dates&&!included&&!stock&&!policy&&!/inscri|edicoes anteriores/.test(text))return null;
 if(!focus.projects.length){
  if(price||dates||stock)return verified('Você quer informações de qual projeto: Feira Tendência, FAMTOUR/Destinos, Guia ou Workshop? No FAMTOUR, pode informar também o destino.');
  return null;
 }
 const requestedYears=Array.from(text.matchAll(/\b20\d{2}\b/g),m=>m[0]);const years=requestedYears.length?requestedYears:focus.requestedYears??[];
 if(focus.projects.includes('destinos')&&years.some(year=>!siteKnowledge.publishedEditions.some(e=>e.startsAt.startsWith(year)))&&!/edicoes anteriores/.test(text))return verified(`Os preços e períodos anunciados nesta base são das edições FAMTOUR ${[...new Set(siteKnowledge.publishedEditions.map(e=>e.startsAt.slice(0,4)))].join(' e ')}. Não há tabela pública confirmada aqui para o ano solicitado; não vou aplicar valores de outra edição. A equipe precisa confirmar.`);
 if(focus.projects.some(p=>p!=='destinos')){
  if(price)return verified(focus.projects.flatMap(p=>p==='destinos'?siteKnowledge.publishedEditions.map(e=>`${e.name}: ${e.publishedCash} à vista ou ${e.publishedInstallment}.`):[`${homeProjects.find(x=>x.id===p)?.name??p}: investimento sob consulta; não há preço publicado.`]).join('\n')+'\nValores de referência publicados; disponibilidade, validade e reserva dependem da equipe.');
  if(dates||stock||policy)return verified('Não há datas, vagas restantes ou condições comerciais publicadas para essa solicitação. A equipe precisa confirmar esses detalhes; não posso garantir valores ou disponibilidade.');
  return null;
 }
 const editions=siteKnowledge.publishedEditions.filter(e=>!focus.editionSlugs.length||focus.editionSlugs.includes(e.slug));
 if(/edicoes anteriores/.test(text))return verified('Galerias de edições anteriores: '+famtourInformation.previousEditions.map(e=>`${e.destino} (${e.ano})`).join(', ')+'. São registros de edições passadas; não representam ofertas ou preços atuais.');
 if(/inscri/.test(text)&&!price)return verified(`${famtourInformation.registration.interest}\n${famtourInformation.registration.detailPage}\nVocê pode solicitar informações em /famtour#form.`);
 const lines:string[]=[];
 if(price)lines.push(...editions.map(e=>`${e.name}: à vista ${e.publishedCash} ou ${e.publishedInstallment}${dates?` · ${e.period}`:''}.`));
 else if(dates)lines.push(...editions.map(e=>`${e.name}: ${e.period}.`));
 if(included){
  const common=editions[0]?.included.filter(item=>editions.every(e=>e.included.includes(item)))??[];
  if(editions.every(e=>e.included.length===common.length))lines.push('Itens publicados: '+common.join('; ')+'.');
  else lines.push(...editions.map(e=>`${e.name} — itens publicados: ${e.included.join('; ')}.`));
 }
 if(stock){
  if(editions.length===1)lines.push(`Capacidade anunciada: ${editions[0].publishedCapacity} participantes. Isso não informa as vagas restantes.`);
  else lines.push('Capacidade anunciada não é quantidade de vagas restantes.');
 }
 if(policy)lines.push('Hotel/quarto, roteiro, origem/horários do voo, bagagem, transfer, refeições, seguro, descontos e políticas não têm condições detalhadas publicadas; a equipe precisa confirmar. Não significa que estejam excluídos.');
 if(price||stock)lines.push('Referência publicada; disponibilidade, validade e reserva precisam ser confirmadas com a equipe.');
 if(!lines.length)return null;
 const reply=lines.join('\n');return reply.length<=1000?verified(reply):verified(lines.slice(0,4).join('\n')+'\nHá outros detalhes publicados. Qual destino e informação você quer aprofundar? Disponibilidade e reserva dependem da equipe.');
}
