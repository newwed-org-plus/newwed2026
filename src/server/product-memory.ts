import {publishedFamtourEditions} from '@/content/famtour-editions';

export const normalizeKnowledgeText=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export type ProductFocus={projects:string[];editionSlugs:string[];source:'current-message'|'conversation-history'|'none';ambiguous:boolean;cleared?:true;incomplete?:true};
const empty=():ProductFocus=>({projects:[],editionSlugs:[],source:'none',ambiguous:false});
function isProductFocus(raw:unknown):raw is ProductFocus{
 if(!raw||typeof raw!=='object')return false;const value=raw as Partial<ProductFocus>;
 return Array.isArray(value.projects)&&value.projects.length<=4&&value.projects.every(p=>['feira','destinos','guia','workshop'].includes(p))
  &&Array.isArray(value.editionSlugs)&&value.editionSlugs.length<=4&&value.editionSlugs.every(s=>publishedFamtourEditions.some(e=>e.slug===s))
  &&(!value.editionSlugs.length||value.projects.includes('destinos'));
}
export function focusFromMessage(message:string):ProductFocus{
 const text=normalizeKnowledgeText(message);
 if(/ignore|instruc|prompt|system|finja|finge/.test(text))return empty();
 if(/quais? (?:os |sao os )?(?:produtos|servicos|projetos)|o que (?:voce|voces|vcs).*(?:vende|oferece)|todos (?:os )?(?:produtos|servicos|projetos)/.test(text))return {projects:['feira','destinos','guia','workshop'],editionSlugs:[],source:'current-message',ambiguous:true};
 const projects=['feira','guia','workshop'].filter(key=>new RegExp(`(?:^|[^a-z-])${key}(?:$|[^a-z])`).test(text));
 const positive=text.replace(/(?:nao (?:quero|tenho interesse (?:em|no))|esqueca|desconsidere)\s+(?:o |a )?(?:famtour\s+)?(?:de\s+)?(?:fernando de noronha|noronha|alagoas|ceara|rio grande do norte|rn|feira|guia|workshop|famtour|destinos)/g,'');
 const editionSlugs=publishedFamtourEditions.filter(e=>{
  const name=normalizeKnowledgeText(e.destino);
  return positive.includes(name)||e.destino==='Fernando de Noronha'&&/\bnoronha\b/.test(positive)||e.destino==='Rio Grande do Norte'&&/\brn\b/.test(positive);
 }).map(e=>e.slug);
 const filtered=projects.filter(key=>new RegExp(`(?:^|[^a-z-])${key}(?:$|[^a-z])`).test(positive));
 if(editionSlugs.length||/\bfamtour\b|\bdestinos\b/.test(positive))filtered.push('destinos');
 if(!filtered.length&&(positive!==text||/mudar de assunto|esqueca (?:isso|o destino|esse destino|o produto)/.test(text)))return {...empty(),cleared:true};
 return {projects:filtered,editionSlugs,source:filtered.length?'current-message':'none',ambiguous:filtered.length>1||editionSlugs.length>1};
}
export function resolveProductFocus(message:string,memory?:ProductFocus|null):ProductFocus{
 const current=focusFromMessage(message);
 if(current.cleared)return current;
 if(current.projects.length){
  // A general FAMTOUR follow-up retains the selected edition. Explicit lists do not.
  if(current.projects.length===1&&current.projects[0]==='destinos'&&!current.editionSlugs.length&&!/todos|todas|quais|edicoes|destinos/.test(normalizeKnowledgeText(message))&&memory?.projects.length===1&&memory.projects[0]==='destinos')return {...current,editionSlugs:memory.editionSlugs};
  return current;
 }
 return memory?.projects.length?{...memory,source:'conversation-history'}:empty();
}
export function productFocusForQuestion(message:string,memory?:ProductFocus|null):ProductFocus{
 const focus=resolveProductFocus(message,memory);const text=normalizeKnowledgeText(message);
 if(focus.source!=='conversation-history'||!/preco|valor|custa|parcel|quando|data|vaga/.test(text))return focus;
 const common=new Set('e o a os as um uma qual quais quanto quantos quantas custa custam custo valor valores preco precos investimento parcela parcelas parcelamento vezes x vista de do da dos das em no na nos nas com sem para por mim voce voces vc vcs esse essa este esta isso isto aquele aquela desse dessa dele dela destino destinos viagem edicao produto projeto famtour quando data datas periodo acontece acontecer sera seria fica ficaria sai sair tem temos ha vagas capacidade inclusa incluso inclusos incluidas inclui incluido aereo hospedagem pousada hotel transfer seguro refeicoes roteiro origem voo bagagem quarto desconto juros validade agora hoje ainda publicado publicada publicados publicadas anunciado anunciada anunciados anunciadas me fale diga saber quero gostaria favor pode informar explicar como saber mesmo tambem afinal ate'.split(' '));
 const words=text.replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
 if(words.some(word=>!common.has(word)&&!/^\d+(?:x)?$/.test(word)))return {...empty(),ambiguous:true};
 return focus;
}
export function productFocusFromHistory(messages:readonly {body:string;direction?:string}[],initial:ProductFocus=empty()):ProductFocus{
 // Never infer customer selection from suggestions or invented values in OUT.
 let memory=initial;
 for(const message of messages){
  if(message.direction&&message.direction!=='IN')continue;
  memory=resolveProductFocus(message.body,memory);
 }
 return memory.projects.length?{...memory,source:'conversation-history'}:memory;
}
export async function loadProductMemory(env:Pick<Env,'DB'>,conversationId:string):Promise<ProductFocus>{
 for(let attempt=0;attempt<3;attempt++){
  const saved=await env.DB.prepare('SELECT focus_json,last_message_at,last_message_id,revision FROM conversation_product_memory WHERE conversation_id=?').bind(conversationId).first<{focus_json:string;last_message_at:string;last_message_id:string;revision:number}>();
  const latest=await env.DB.prepare("SELECT id,created_at FROM messages WHERE conversation_id=? AND direction='IN' ORDER BY created_at DESC,id DESC LIMIT 1").bind(conversationId).first<{id:string;created_at:string}>();
  if(!latest)return empty();
  let initial=empty();let afterAt='';let afterId='';
  if(saved){try{const raw:unknown=JSON.parse(saved.focus_json);if(!isProductFocus(raw))throw new Error('Invalid memory snapshot');initial=productFocusForContext('',{productMemory:raw});afterAt=saved.last_message_at;afterId=saved.last_message_id;}catch{/* Rebuild corrupt snapshots from messages; never infer prices. */}}
  if(saved&&afterAt===latest.created_at&&afterId===latest.id)return initial;
  // Bounded reconstruction persists progress. After bootstrapping, only new
  // topic-bearing customer messages are read, regardless of conversation length.
  const rows=await env.DB.prepare(`SELECT id,created_at,body,direction FROM messages WHERE conversation_id=? AND direction='IN' AND body IS NOT NULL
  AND (created_at>? OR (created_at=? AND id>?)) AND (created_at<? OR (created_at=? AND id<=?))
  AND (lower(body) LIKE '%famtour%' OR lower(body) LIKE '%destinos%' OR lower(body) LIKE '%noronha%' OR lower(body) LIKE '%alagoas%'
   OR lower(body) LIKE '%cear%' OR lower(body) LIKE '%rio grande do norte%' OR lower(body) LIKE '% rn%' OR lower(body)='rn'
   OR lower(body) LIKE '%feira%' OR lower(body) LIKE '%guia%' OR lower(body) LIKE '%workshop%' OR lower(body) LIKE '%assunto%' OR lower(body) LIKE '%esque%' OR lower(body) LIKE '%desconsidere%'
   OR lower(body) LIKE '%produtos%' OR lower(body) LIKE '%servi%' OR lower(body) LIKE '%projetos%')
  ORDER BY created_at,id LIMIT 129`).bind(conversationId,afterAt,afterAt,afterId,latest.created_at,latest.created_at,latest.id).all<{id:string;created_at:string;body:string;direction:string}>();
  const more=rows.results.length>128;const page=rows.results.slice(0,128);const focus=productFocusFromHistory(page,initial);const cursor=more?page.at(-1)!:latest;
  const changed=await env.DB.prepare(`INSERT INTO conversation_product_memory(conversation_id,focus_json,last_message_at,last_message_id,updated_at)
    SELECT id,?,?,?,? FROM conversations WHERE id=? ON CONFLICT(conversation_id) DO UPDATE SET focus_json=excluded.focus_json,
    last_message_at=excluded.last_message_at,last_message_id=excluded.last_message_id,revision=conversation_product_memory.revision+1,updated_at=excluded.updated_at
    WHERE conversation_product_memory.revision=?`)
    .bind(JSON.stringify(focus),cursor.created_at,cursor.id,new Date().toISOString(),conversationId,saved?.revision??0).run();
  if(changed.meta.changes)return {...focus,...(more?{incomplete:true as const}:{})};
 }
 return {...empty(),incomplete:true};
}
export function productFocusForContext(message:string,context:unknown):ProductFocus{
 const data=context&&typeof context==='object'?context as Record<string,unknown>:{};
 const raw=data.productMemory as Partial<ProductFocus>|undefined;
 const valid=isProductFocus(raw);
 const recent=Array.isArray(data.recentMessages)?data.recentMessages.filter((row):row is {body:string;direction?:string}=>row&&typeof row==='object'&&typeof row.body==='string'):[];
 return productFocusForQuestion(message,valid?{projects:raw.projects!,editionSlugs:raw.editionSlugs!,ambiguous:raw.projects!.length>1||raw.editionSlugs!.length>1,source:'conversation-history',...(raw.cleared?{cleared:true as const}:{})}:productFocusFromHistory(recent));
}
