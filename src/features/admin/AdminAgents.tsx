"use client";

import { useCallback,useEffect,useState } from "react";
import { Bot,LoaderCircle,Plus,RefreshCw,Save,Send } from "lucide-react";
import { adminApi } from "@/features/admin/api";
import { defaultAgentInstructions,type AgentConfigInput,type FreeModel,type WhatsAppAgent } from "@/features/conversations/agent-config";
import type { AgentResult } from "@/features/conversations/model";
import {AdminKnowledge} from './AdminKnowledge';

type Line={id:string;name:string;state:string;phone:string|null};
type Data={configured:boolean;lines:Line[];items:WhatsAppAgent[]};
const blank=():AgentConfigInput=>({instanceId:null,name:"Atendimento New Wed",instructions:defaultAgentInstructions,model:"openrouter/free",enabled:false,version:0});
const field="mt-2 w-full border border-black/15 bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-black outline-none focus:border-[#7A2535]";
const button="inline-flex items-center justify-center gap-2 border border-black/15 px-4 py-2.5 text-[10px] uppercase tracking-[0.12em] disabled:opacity-40";

export function AdminAgents() {
  const [data,setData]=useState<Data>({configured:false,lines:[],items:[]});
  const [selected,setSelected]=useState("");
  const [models,setModels]=useState<FreeModel[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [modelError,setModelError]=useState("");
  const [refreshing,setRefreshing]=useState(false);
  const refreshModels=useCallback(async()=>{
    setRefreshing(true);
    try {setModels((await adminApi<{items:FreeModel[]}>("/api/admin/agents/models")).items);setModelError("");}
    catch(reason){setModelError(reason instanceof Error?reason.message:"Não foi possível atualizar os modelos.");}
    finally{setRefreshing(false);}
  },[]);
  const load=useCallback(async()=>{
    setLoading(true);
    try {const result=await adminApi<Data>("/api/admin/agents");setData(result);setSelected(current=>current || result.items[0]?.id || "");setError("");}
    catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível carregar os atendentes.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();void refreshModels();},[load,refreshModels]);
  const current=data.items.find(item=>item.id===selected);
  return <section className="mx-auto max-w-[1400px] px-5 py-7 md:px-8">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-[#7A2535]">OpenRouter · Modelos gratuitos</div><h1 className="text-2xl font-light">Atendentes virtuais</h1><p className="mt-2 max-w-2xl text-sm text-black/55">Defina como cada atendente conversa e vincule uma linha de WhatsApp quando estiver pronta.</p></div><button className={button} onClick={()=>{setSelected(crypto.randomUUID());setError("");}} disabled={loading}><Plus size={14}/>Novo atendente</button></div>
    <AdminKnowledge/>
    {error&&<p role="alert" className="mb-5 border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button className="ml-3 underline" onClick={()=>void load()}>Tentar novamente</button></p>}
    {!data.configured&&<p className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">OpenRouter ainda não conectado. Você pode preparar os atendentes; testar e ativar exige configurar a chave da API no servidor.</p>}
    {loading?<div className="flex items-center gap-2 text-sm text-black/50"><LoaderCircle className="animate-spin" size={16}/>Carregando atendentes...</div>:<div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="space-y-2">{data.items.map(agent=><button key={agent.id} onClick={()=>setSelected(agent.id)} className={`w-full border p-4 text-left ${agent.id===selected?"border-[#7A2535] bg-[#7A2535]/5":"border-black/10"}`}><span className="block text-sm font-medium">{agent.name}</span><span className="mt-2 block text-xs text-black/50">{agent.enabled?"Ativo":"Pausado"} · {data.lines.find(line=>line.id===agent.instance_id)?.name || "Sem linha"}</span></button>)}{!data.items.length&&<p className="border border-dashed border-black/15 p-4 text-sm text-black/50">Crie seu primeiro atendente para configurar o contexto e testar as respostas.</p>}</aside>
      {selected?<AgentEditor key={`${selected}:${current?.version??0}`} id={selected} agent={current} data={data} models={models} modelError={modelError} refreshing={refreshing} refreshModels={refreshModels} onSaved={agent=>setData(value=>({...value,items:value.items.some(item=>item.id===agent.id)?value.items.map(item=>item.id===agent.id?agent:item):[...value.items,agent]}))}/>:<div className="flex min-h-72 flex-col items-center justify-center border border-black/10 p-8 text-center"><Bot size={28} strokeWidth={1}/><h2 className="mt-4 text-lg">Atendimento com o contexto da New Wed</h2><p className="mt-2 max-w-sm text-sm text-black/50">O histórico da Inbox acompanha cada conversa. Uma pessoa pode assumir o atendimento a qualquer momento.</p></div>}
    </div>}
  </section>;
}
function AgentEditor({id,agent,data,models,modelError,refreshing,refreshModels,onSaved}:{id:string;agent?:WhatsAppAgent;data:Data;models:FreeModel[];modelError:string;refreshing:boolean;refreshModels:()=>Promise<void>;onSaved:(agent:WhatsAppAgent)=>void}) {
  const initial=agent?{instanceId:agent.instance_id,name:agent.name,instructions:agent.instructions,model:agent.model,enabled:agent.enabled===1,version:agent.version}:blank();
  const [form,setForm]=useState<AgentConfigInput>(initial);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(false);
  const [message,setMessage]=useState("Olá! Quais projetos a New Wed oferece?");
  const [result,setResult]=useState<AgentResult|null>(null);
  const dirty=JSON.stringify(form)!==JSON.stringify(initial);
  const patch=(value:Partial<AgentConfigInput>)=>{setForm(current=>({...current,...value}));setSaved(false);setResult(null);};
  async function save(){
    setBusy(true);setError("");
    try {const response=await adminApi<{agent:WhatsAppAgent}>(`/api/admin/agents/${id}`,{method:"POST",body:JSON.stringify({action:"save",config:form})});setSaved(true);onSaved(response.agent);}
    catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível salvar.");}
    finally{setBusy(false);}
  }
  async function preview(){
    setBusy(true);setError("");setResult(null);
    try {setResult((await adminApi<{result:AgentResult}>(`/api/admin/agents/${id}`,{method:"POST",body:JSON.stringify({action:"preview",message})})).result);}
    catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível testar.");}
    finally{setBusy(false);}
  }
  return <div className="min-w-0 space-y-6">
    <form onSubmit={event=>{event.preventDefault();void save();}} className="border border-black/10 p-5 md:p-7">
      <div className="grid gap-5 lg:grid-cols-2">
        <label className="text-[10px] uppercase tracking-wider text-black/50">Nome do atendente<input aria-label="Nome do atendente" className={field} value={form.name} maxLength={80} required onChange={event=>patch({name:event.target.value})}/></label>
        <label className="text-[10px] uppercase tracking-wider text-black/50">Linha de WhatsApp<select aria-label="Linha de WhatsApp" className={field} value={form.instanceId??""} onChange={event=>patch({instanceId:event.target.value||null,enabled:false})}><option value="">Preparar sem linha</option>{data.lines.map(line=><option key={line.id} value={line.id}>{line.name}{line.phone?` · +${line.phone}`:""}</option>)}</select></label>
      </div>
      {!data.lines.length&&<p className="mt-3 text-xs text-black/50">A linha aparecerá aqui após a configuração UAZAPI. Você já pode salvar e testar o atendente.</p>}
      <div className="mt-6 flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-[10px] uppercase tracking-wider text-black/50">Modelo gratuito<select aria-label="Modelo gratuito" className={field} value={form.model} onChange={event=>patch({model:event.target.value})}>{!models.some(model=>model.id===form.model)&&<option value={form.model}>{form.model} · disponibilidade a confirmar</option>}{models.map(model=><option key={model.id} value={model.id}>{model.name}</option>)}</select></label><button type="button" className={button} disabled={refreshing} onClick={()=>void refreshModels()} aria-label="Atualizar modelos"><RefreshCw size={14} className={refreshing?"animate-spin":""}/></button></div>
      {modelError&&<p role="alert" className="mt-3 text-sm text-amber-800">{modelError}</p>}
      <p className="mt-2 text-xs text-black/45">Disponibilidade e cotas variam. Com a recuperação gratuita habilitada, a conversa aguarda e retoma quando houver disponibilidade.</p>
      <label className="mt-6 block text-[10px] uppercase tracking-wider text-black/50">Contexto e orientações<textarea aria-label="Contexto e orientações" className={`${field} min-h-56 resize-y leading-relaxed`} value={form.instructions} minLength={20} maxLength={8000} required onChange={event=>patch({instructions:event.target.value})}/></label><p className="mt-2 text-xs text-black/45">Defina tom de voz e atendimento. A base publicada fornece produtos, preços e datas; este campo não substitui a tabela oficial. Não inclua senhas nem chaves.</p>
      <label className="mt-6 flex items-start gap-3 text-sm"><input aria-label="Atender novos contatos automaticamente" type="checkbox" className="mt-1 accent-[#7A2535]" checked={form.enabled} disabled={!data.configured||!form.instanceId} onChange={event=>patch({enabled:event.target.checked})}/><span>Atender novos contatos automaticamente<span className="mt-1 block text-xs leading-relaxed text-black/50">Conversas humanas permanecem na Inbox. Use “Devolver ao agente” para retomar uma conversa específica. Desativar pausa as conversas automáticas desta linha.</span></span></label>
      <div className="mt-6 flex flex-wrap items-center gap-3"><button type="submit" disabled={busy} className={`${button} bg-[#7A2535] text-white`}>{busy?<LoaderCircle size={14} className="animate-spin"/>:<Save size={14}/>}Salvar atendente</button>{saved&&<span role="status" className="text-sm text-green-800">Atendente salvo.</span>}{agent&&!dirty&&<span className="text-xs text-black/45">Configuração salva · {agent.enabled?"Ativo":"Pausado"}</span>}</div>
    </form>
    <section className="border border-black/10 bg-black/[0.015] p-5 md:p-7"><h2 className="text-lg">Testar uma resposta</h2><p className="mt-2 text-sm text-black/50">Simulação com o contexto salvo, sem enviar mensagem ao WhatsApp nem ler conversas de clientes.</p><label className="mt-5 block text-[10px] uppercase tracking-wider text-black/50">Mensagem de teste<textarea aria-label="Mensagem de teste" className={`${field} min-h-24`} maxLength={1000} value={message} onChange={event=>setMessage(event.target.value)}/></label><button className={`${button} mt-4`} onClick={()=>void preview()} disabled={busy||!data.configured||!agent||dirty||!message.trim()}><Send size={14}/>Testar resposta</button>{(!agent||dirty)&&<p className="mt-2 text-xs text-black/50">Salve as alterações antes de testar.</p>}{result&&<div className="mt-5 border-l-2 border-[#7A2535] bg-white p-4" role="status"><p className="whitespace-pre-wrap text-sm leading-relaxed">{result.reply}</p><p className="mt-3 text-xs text-black/50">{result.handoff?"Encaminharia para a equipe":"Continuaria com o atendente"}{result.reason?` · ${result.reason}`:""}</p></div>}</section>
    {error&&<p role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
  </div>;
}
