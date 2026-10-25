import type {AgentResult} from '@/features/conversations/model';
import {siteKnowledge,publishedProductAnswer} from './site-knowledge';
import {normalizeKnowledgeText,productFocusForContext,focusFromMessage} from './product-memory';

function moneyCents(value:string){
 const text=value.includes(',')?value.replace(/\./g,'').replace(',','.'):value.replace(/\.(?=\d{3}(?:\D|$))/g,'');
 const number=Number(text);return Number.isFinite(number)?Math.round(number*100):NaN;
}
export function guardPublishedFacts(result:AgentResult,message:string,context:unknown):AgentResult{
 const focus=productFocusForContext(message,context);const answer=normalizeKnowledgeText(result.reply);
 const editions=siteKnowledge.publishedEditions.filter(e=>!focus.editionSlugs.length||focus.editionSlugs.includes(e.slug));
 const canQuoteFamtour=focus.projects.includes('destinos');
 const allowed=new Set(canQuoteFamtour?editions.flatMap(e=>[e.publishedCashCents,e.publishedInstallmentCents]):[]);
 const matches=Array.from(result.reply.matchAll(/R\$\s*([\d.,]+)|(\d[\d.,]*)\s*reais\b|\b\d{1,2}\s*(?:x|parcelas)(?:\s+de)?\s*(?:R\$\s*)?([\d.,]+)/gi));
 const unknownMoney=matches.some(match=>!allowed.has(moneyCents(match[1]??match[2]??match[3])));
 const falseInstitutionalPrice=result.reply.split(/[\n;]|(?<=[.!?])\s+(?=[A-Z])/).some(line=>/\bguia\b|\bworkshop\b|\bfeira\b/i.test(line)&&/R\$|\breais\b/.test(line));
 const promise=/vaga (?:esta )?garantida|reservei|reserva confirmada|pagamento (?:esta )?(?:aprovado|confirmado)|inscricao (?:esta )?confirmada/.test(answer);
 const inventedStock=/\b\d+\s+vagas?\s+(?:disponiveis|restantes|livres)|(?:restam|temos|sobram)\s+(?:somente\s+)?\d+\s+vagas?/.test(answer);
 const inventedTerms=/\bsem juros\b|\d+(?:[.,]\d+)?\s*%\s*(?:de\s*)?(?:desconto|juros|off)|(?:desconto|juros)\s*(?:de\s*)?\d+(?:[.,]\d+)?\s*%/.test(answer)
  ||Array.from(answer.matchAll(/\b(\d{1,2})\s*(?:x|parcelas)\b/g)).some(m=>Number(m[1])!==12);
 const allowedDates=new Set(canQuoteFamtour?editions.flatMap(e=>[e.startsAt,e.endsAt]):[]);
 const inventedDate=Array.from(result.reply.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g)).some(m=>!allowedDates.has(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`));
 const wrongBinding=result.reply.split('\n').some(line=>{
  const named=focusFromMessage(line).editionSlugs;if(named.length!==1)return false;
  const edition=siteKnowledge.publishedEditions.find(e=>e.slug===named[0])!;
  const values=new Set([edition.publishedCashCents,edition.publishedInstallmentCents]);
  const money=Array.from(line.matchAll(/R\$\s*([\d.,]+)/g));
  return money.some(m=>!values.has(moneyCents(m[1])))||money.length>0&&Array.from(line.matchAll(/\b20\d{2}\b/g),m=>m[0]).some(year=>!edition.startsAt.startsWith(year));
 });
 if(!unknownMoney&&!falseInstitutionalPrice&&!promise&&!inventedStock&&!inventedDate&&!wrongBinding&&!inventedTerms)return result;
 const corrected=publishedProductAnswer(message,focus);
 if(corrected&&!result.handoff)return {...corrected,reason:'Resposta conferida e corrigida pela base publicada; afirmação sem fonte descartada.'};
 return {reply:'Preciso confirmar essas informações com a equipe New Wed para não informar valores, condições ou disponibilidade sem confirmação.',confidence:1,handoff:true,reason:'Afirmação comercial sem suporte na base publicada bloqueada.'};
}
