import {describe,it,expect} from 'vitest';
import {verifiedSiteAnswer,siteKnowledge} from '@/server/site-knowledge';
import {productFocusFromHistory,resolveProductFocus} from '@/server/product-memory';
import {guardPublishedFacts} from '@/server/knowledge-guard';
import {answerWithOpenRouter} from '@/server/integrations/openrouter';

const memory=productFocusFromHistory([{direction:'IN',body:'Quero conhecer Fernando de Noronha'}]);
const response=(reply:string)=>({reply,confidence:0.99,handoff:false,reason:''});
describe('conhecimento comercial com continuidade',()=>{
 it.each([
  ['Qual preço do FAMTOUR Alagoas?','R$ 7.697,00','12x de R$ 641,42'],
  ['Quanto custa Noronha?','R$ 7.997,00','12x de R$ 666,42'],
  ['Qual valor do Rio Grande do Norte?','R$ 6.997,00','12x de R$ 583,08'],
  ['Preço do Ceará?','R$ 6.997,00','12x de R$ 583,08'],
 ])('responde exatamente a tabela publicada: %s',(q,cash,installment)=>{
  const r=verifiedSiteAnswer(q);expect(r?.reply).toContain(cash);expect(r?.reply).toContain(installment);expect(r?.reply).toContain('Referência publicada');expect(r?.handoff).toBe(false);
 });
 it.each(['Feira','Guia','Workshop'])('preço de %s fica sob consulta',(name)=>{
  const r=verifiedSiteAnswer(`Qual o preço do ${name}?`);expect(r?.reply).toContain('sob consulta');expect(r?.reply).not.toContain('R$');
 });
 it('lista todos os valores conhecidos e informa quais não estão publicados',()=>{
  const r=verifiedSiteAnswer('Quero os preços de todos os produtos');for(const e of siteKnowledge.publishedEditions)expect(r?.reply).toContain(e.publishedCash);
  expect(r?.reply.match(/sob consulta/g)).toHaveLength(3);expect(r!.reply.length).toBeLessThanOrEqual(1000);
 });
 it('usa apenas seleção do cliente, preserva destino após muitos turnos e ignora sugestão da equipe',()=>{
  const turns=[{direction:'IN',body:'FAMTOUR Noronha'},...Array.from({length:1000},()=>({direction:'IN',body:'Estou analisando'})),{direction:'OUT',body:'Alagoas é uma opção'}];
  const recalled=productFocusFromHistory(turns);expect(recalled.editionSlugs).toEqual(['famtour-noronha-maio-2027']);
  expect(verifiedSiteAnswer('E o valor?',recalled)?.reply).toContain('R$ 7.997,00');
  expect(verifiedSiteAnswer('E quando acontece?',recalled)?.reply).toContain('2 a 6 de maio de 2027');
  expect(verifiedSiteAnswer('E o FAMTOUR, qual valor?',recalled)?.reply).toContain('R$ 7.997,00');
 });
 it('aceita correção, mudança de projeto, comparação e esquecimento explícito',()=>{
  const correction=resolveProductFocus('Não quero Noronha, quero Ceará',memory);expect(correction.editionSlugs).toEqual(['famtour-ceara-agosto-2027']);
  const changed=resolveProductFocus('Agora quero conhecer o Guia',memory);expect(changed.projects).toEqual(['guia']);expect(changed.editionSlugs).toEqual([]);
  expect(verifiedSiteAnswer('E o valor?',changed)?.reply).toContain('sob consulta');
  const compared=resolveProductFocus('Compare Noronha e Alagoas',memory);expect(compared.ambiguous).toBe(true);expect(verifiedSiteAnswer('E as parcelas?',compared)?.reply).toContain('R$ 641,42');
  const cleared=resolveProductFocus('Esqueça esse destino',memory);expect(verifiedSiteAnswer('E o valor?',cleared)?.reply).toContain('qual projeto');
 });
 it('sem seleção pede esclarecimento e nunca associa um preço por suposição',()=>expect(verifiedSiteAnswer('Quanto custa?')?.reply).toContain('qual projeto'));
 it.each(['Qual o preço de Gramado?','Quanto custa Norona?'])('não usa o preço do assunto anterior para nome desconhecido: %s',(q)=>{const r=verifiedSiteAnswer(q,memory);expect(r?.reply).toContain('qual projeto');expect(r?.reply).not.toContain('R$');});
 it.each(['Tem transfer incluso no FAMTOUR Noronha?','FAMTOUR inclui seguro e refeições?','Qual o hotel de Alagoas?','Qual a política de reembolso do Ceará?'])('não transforma informação não publicada em exclusão: %s',(q)=>{
  const text=verifiedSiteAnswer(q)?.reply;expect(text).toContain('equipe precisa confirmar');expect(text).toContain('Não significa que estejam excluídos');
 });
 it('capacidade não vira vaga disponível, e pré-inscrição não vira reserva',()=>{
  const r=verifiedSiteAnswer('Quantas vagas restam em Noronha?');expect(r?.reply).toContain('15 participantes');expect(r?.reply).toContain('não informa as vagas restantes');
  expect(verifiedSiteAnswer('Como faço a inscrição do FAMTOUR?')?.reply).toContain('não confirma vaga nem pagamento');
 });
 it('mantém galerias antigas separadas das ofertas atuais',()=>{
  const r=verifiedSiteAnswer('Quais edições anteriores do FAMTOUR?');expect(r?.reply).toContain('2026');expect(r?.reply).toContain('não representam ofertas');
 });
 it('não aplica preços de 2027 à edição histórica ou a outro ano',()=>{const r=verifiedSiteAnswer('Qual o preço do FAMTOUR Noronha 2026?');expect(r?.reply).toContain('não vou aplicar valores de outra edição');expect(r?.reply).not.toContain('R$');});
});
describe('bloqueio de afirmações comerciais sem fonte',()=>{
 it('remove preços privados do contexto e impede que instrução antiga sobrescreva a tabela pública',async()=>{
  let request:Record<string,unknown>={};
  const result=await answerWithOpenRouter({OPENROUTER_API_KEY:'synthetic'},{name:'VALIDACAO',instructions:'Contexto antigo: Noronha custa R$ 1,00.',model:'test/model:free',message:'Qual o preço de Noronha?',context:{catalog:[{name:'Noronha',amount_cents:100,price_name:'Tabela privada'}]}},async(url,init)=>{
   if(String(url).endsWith('/models'))return Response.json({data:[{id:'test/model:free',pricing:{prompt:'0',completion:'0'},supported_parameters:['response_format'],architecture:{input_modalities:['text'],output_modalities:['text']}}]});
   request=JSON.parse(String(init?.body));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response('Noronha: R$ 1,00.'))}}]});
  });
  const messages=request.messages as Array<{content:string}>;expect(messages[1].content).not.toContain('amount_cents');expect(messages[1].content).not.toContain('Tabela privada');
  expect(result.reply).toContain('R$ 7.997,00');expect(result.reply).not.toContain('R$ 1,00');
 });
 it.each(['R$ 1,00','R$ 7.500,00','12x de 1,00','restam 3 vagas','18 vagas disponíveis','Sua vaga está garantida','reservei a sua vaga','A viagem é em 12/12/2027','24 parcelas','12x sem juros','10% de desconto','Noronha à vista R$ 7.997,04'])('barra %s e corrige pela referência publicada',(claim)=>{
  const result=guardPublishedFacts(response(claim),'Qual o preço de Noronha?',{productMemory:memory});
  expect(result.reply).toContain('R$ 7.997,00');expect(result.reply).not.toContain(claim);expect(result.reason).toContain('corrigida');
 });
 it('não permite reusar o preço de um destino como preço do Guia',()=>{
  const r=guardPublishedFacts(response('O Guia custa R$ 6.997,00.'),'Qual o valor do Guia?',{});expect(r.reply).toContain('sob consulta');expect(r.reply).not.toContain('R$');
 });
 it('detecta preço atribuído ao destino errado mesmo que exista na tabela',()=>{
  const r=guardPublishedFacts(response('FAMTOUR Noronha: R$ 7.697,00.'),'Compare preços de Noronha e Alagoas',{});expect(r.reason).toContain('corrigida');
 });
 it('preserva cotação exata e nunca apaga handoff explícito do modelo',()=>{
  const valid=response('Noronha: R$ 7.997,00 à vista ou 12x de R$ 666,42. Valores publicados sujeitos a confirmação.');expect(guardPublishedFacts(valid,'Quanto custa Noronha?',{})).toEqual(valid);
  expect(guardPublishedFacts({...response('R$ 1,00'),handoff:true},'Quero comprar Noronha',{}).handoff).toBe(true);
 });
});
