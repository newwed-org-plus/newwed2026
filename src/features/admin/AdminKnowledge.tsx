"use client";
import {useState} from 'react';
import {adminApi} from './api';
import type {KnowledgeOverview} from '@/features/conversations/knowledge';

export function AdminKnowledge(){
 const [open,setOpen]=useState(false);const [data,setData]=useState<KnowledgeOverview|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function load(){setBusy(true);setError('');try{setData(await adminApi<KnowledgeOverview>('/api/admin/knowledge'));}catch(error){setError(error instanceof Error?error.message:'Não foi possível consultar a base.');}finally{setBusy(false);}}
 return <section className="mb-6 border border-black/10 bg-white p-5">
  <button type="button" aria-expanded={open} className="text-left text-sm font-medium underline underline-offset-4" onClick={()=>{setOpen(!open);if(!open&&!data)void load();}}>Ver conhecimento dos produtos</button>
  {open&&<div className="mt-5 space-y-5">
   <p className="max-w-3xl text-sm leading-relaxed text-black/60">A IA consulta esta base em cada resposta. O assunto da conversa é recuperado do histórico individual. Trocar de modelo ou reiniciar o ambiente preserva as informações publicadas.</p>
   {busy&&<p role="status" className="text-sm">Carregando conhecimento…</p>}
   {error&&<p role="alert" className="text-sm text-red-800">{error}<button className="ml-3 underline" onClick={()=>void load()}>Tentar novamente</button></p>}
   {data&&<>
    <div className="grid gap-3 sm:grid-cols-2">{data.projects.map(p=><article key={p.id} className="min-w-0 border border-black/10 p-4"><h2 className="text-lg">{p.name}</h2><p className="mt-2 text-sm text-black/65">{p.description}</p><p className="mt-2 text-sm font-medium text-[#7A2535]">{p.priceStatus}</p>{p.formats.length>0&&<p className="mt-2 text-xs leading-relaxed text-black/60">{p.formats.map(f=>`${f.title}: ${f.description}`).join(' · ')}</p>}<a href={p.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs underline">Ver fonte publicada</a></article>)}</div>
    <h2 className="text-lg">Preços publicados do FAMTOUR</h2>
    <div className="overflow-x-auto"><table className="w-full min-w-[620px] border-collapse text-left text-sm"><thead><tr className="border-b border-black/15"><th className="p-3">Edição</th><th className="p-3">Período</th><th className="p-3">À vista</th><th className="p-3">Parcelas anunciadas</th></tr></thead><tbody>{data.editions.map(e=><tr key={e.url} className="border-b border-black/10"><td className="p-3"><a className="underline" href={e.url} target="_blank" rel="noreferrer">{e.name}</a></td><td className="p-3">{e.period}</td><td className="p-3 whitespace-nowrap">{e.cash}</td><td className="p-3 whitespace-nowrap">{e.installments}</td></tr>)}</tbody></table></div>
    <p className="text-sm leading-relaxed text-black/65">{data.policy}</p><p className="text-sm leading-relaxed text-black/65">{data.registration}</p>
    <div><h2 className="text-lg">Informações que exigem confirmação</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-black/65">{data.unpublished.map(item=><li key={item}>{item}</li>)}</ul></div>
    <p className="break-all text-xs text-black/45">Versão {data.version} · Referência {data.fingerprint.slice(0,12)}</p><button type="button" className="text-xs underline" onClick={()=>void load()} disabled={busy}>Atualizar base publicada</button>
   </>}
  </div>}
 </section>;
}
