"use client";

import { useCallback,useEffect,useState } from "react";
import { adminApi as get } from "@/features/admin/api";
import { AlertTriangle,RefreshCw } from "lucide-react";

type Metric = {label:string;total:number;amount_cents?:number};
type Report = {stages:Metric[];origins:Metric[];editions:Metric[];assignees:Metric[];checkouts:Metric[];payments:Metric[]};
type Failure = {id:string;type:string;entity_id:string;error:string;attempts:number;request_id?:string;created_at:string};


export function AdminReports() {
  const [report,setReport]=useState<Report|null>(null);const [failures,setFailures]=useState<Failure[]>([]);const [error,setError]=useState("");
  const [from,setFrom]=useState("");const [to,setTo]=useState("");
  const load=useCallback(async()=>{setError("");try{const query=new URLSearchParams();if(from)query.set("from",from);if(to)query.set("to",to);const [metrics,ops]=await Promise.all([get<Report>(`/api/admin/reports/funnel?${query}`),get<{items:Failure[]}>("/api/admin/operations/failures")]);setReport(metrics);setFailures(ops.items);}catch(reason){setError(reason instanceof Error?reason.message:"Falha ao carregar relatórios");}},[from,to]);
  useEffect(()=>{void load();},[load]);
  return <section className="mx-auto max-w-[1600px] space-y-8 px-5 py-7 md:px-8">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-[9px] uppercase tracking-[0.24em] text-[#2E8E8E]">Inteligência comercial</p><h1 className="serif mt-2 text-4xl font-light md:text-5xl">Funil e operação.</h1></div><div className="flex flex-wrap items-end gap-3"><DateField label="De" value={from} onChange={setFrom}/><DateField label="Até" value={to} onChange={setTo}/><button onClick={load} className="border border-black/15 p-2" aria-label="Atualizar relatórios"><RefreshCw size={17}/></button></div></div>
    {error&&<div className="border border-[#7A2535]/30 bg-white p-4 text-sm text-[#7A2535]">{error}</div>}
    {report&&<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><MetricCard title="Etapas" rows={report.stages}/><MetricCard title="Origens" rows={report.origins}/><MetricCard title="Edições" rows={report.editions}/><MetricCard title="Responsáveis" rows={report.assignees}/><MetricCard title="Checkouts" rows={report.checkouts}/><MetricCard title="Pagamentos" rows={report.payments} money/></div>}
    <section className="border border-black/10 bg-white p-5"><div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]"><AlertTriangle size={15} className="text-[#7A2535]"/> Falhas operacionais</h2><span className="text-xs text-black/40">{failures.length}</span></div>{failures.length?<div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead className="border-b border-black/10 text-[9px] uppercase tracking-[0.14em] text-black/45"><tr><th className="py-3">Serviço</th><th>Erro</th><th>Tentativas</th><th>requestId</th><th>Data</th></tr></thead><tbody>{failures.map((item)=><tr key={`${item.type}-${item.id}`} className="border-b border-black/5"><td className="py-3 pr-4 uppercase">{item.type}</td><td className="max-w-md pr-4">{item.error}</td><td>{item.attempts}</td><td className="font-mono text-[10px]">{item.request_id??"—"}</td><td>{new Date(item.created_at).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div>:<p className="text-sm text-black/40">Nenhuma falha pendente.</p>}</section>
  </section>;
}

function DateField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {return <label className="text-[9px] uppercase tracking-[0.14em] text-black/45">{label}<input type="date" value={value} onChange={(event)=>onChange(event.target.value)} className="mt-1 block border border-black/15 bg-white px-3 py-2 text-xs text-black"/></label>}
function MetricCard({title,rows,money=false}:{title:string;rows:Metric[];money?:boolean}) {return <section className="border border-black/10 bg-white p-5"><h2 className="mb-4 text-[10px] uppercase tracking-[0.18em] text-black/45">{title}</h2><div className="space-y-3">{rows.length?rows.map((row)=><div key={row.label} className="flex items-center justify-between border-b border-black/5 pb-2"><span className="text-xs uppercase">{row.label.replaceAll("_"," ")}</span><span className="text-sm font-medium">{row.total}{money&&row.amount_cents!==undefined?<small className="ml-2 font-normal text-black/45">{(row.amount_cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</small>:null}</span></div>):<p className="text-sm text-black/35">Sem dados.</p>}</div></section>}
