"use client";

import { useRef,useState } from "react";
import {useInboxData} from "./use-inbox-data";
import { adminApi as inboxApi } from "@/features/admin/api";
import { AlertTriangle,Bot,RefreshCw,Search,Send,UserRound } from "lucide-react";

export function AdminInbox() {
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [query,setQuery]=useState("");const [mode,setMode]=useState<""|"AGENT"|"HUMAN">("");const [failuresOnly,setFailuresOnly]=useState(false);
  const [sending,setSending]=useState(false);const pendingKey=useRef<string|null>(null);const sendingRef=useRef(false);
  const [draft,setDraft]=useState("");const [notice,setNotice]=useState("");
  const {items,detail,me,error,setError,loading,detailLoading,listFetching,detailFetching,nextList,nextMessage,paging,lastUpdated,refresh,more,older}=useInboxData(query,mode,failuresOnly,selectedId);
  const messagePane=useRef<HTMLDivElement>(null);
  const loadOlder=async()=>{const pane=messagePane.current;const height=pane?.scrollHeight??0;await older();requestAnimationFrame(()=>{if(pane&&pane===messagePane.current)pane.scrollTop+=pane.scrollHeight-height;});};
  const claim = async () => {
    if (!selectedId) return;
    try {
      const result = await inboxApi<{ agentReplyInProgress:boolean }>(`/api/admin/conversations/${selectedId}/claim`,{ method:"POST" });
      setNotice(result.agentReplyInProgress ? "Conversa assumida. Aguarde a pausa da resposta que já estava em processamento." : "Conversa assumida por você.");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível assumir."); }
  };
  const release = async () => {
    if (!selectedId) return;
    try {
      await inboxApi(`/api/admin/conversations/${selectedId}/release`,{ method:"POST" });
      setNotice("Conversa devolvida ao agente.");await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível devolver."); }
  };
  const reconcileMessage=async(id:string,outcome:"delivered"|"not-sent",checkoutId?:string|null)=>{
    const reason=window.prompt("Após conferir o WhatsApp, descreva a evidência deste resultado:")?.trim();if(!reason)return;
    try{await inboxApi(checkoutId?`/api/admin/checkouts/${checkoutId}/mark-delivered`:`/api/admin/messages/${id}/reconcile`,{method:"POST",body:JSON.stringify({outcome,reason,...(checkoutId?{messageId:id}:{})})});setNotice("Resultado registrado com auditoria.");await refresh();}catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível conciliar.");}
  };
  const send = async () => {
    if (!selectedId || !draft.trim() || sendingRef.current) return;
    sendingRef.current=true;setSending(true);pendingKey.current??=crypto.randomUUID();
    try {
      await inboxApi(`/api/admin/conversations/${selectedId}/messages`,{ method:"POST",headers:{ "Idempotency-Key":pendingKey.current },body:JSON.stringify({ body:draft }) });
      setDraft("");pendingKey.current=null;setNotice("Mensagem registrada para envio. Acompanhe o estado no histórico.");await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível responder."); }
    finally {sendingRef.current=false;setSending(false);}
  };

  const conversation = detail?.conversation.id===selectedId ? detail.conversation : undefined;
  const owned = Boolean(conversation && me && conversation.mode === "HUMAN" && conversation.claimed_by === me.id);
  return <section className="mx-auto grid h-[calc(100dvh-73px)] min-h-[500px] max-w-[1600px] grid-cols-1 grid-rows-[minmax(150px,30%)_1fr] bg-[#F7F4EE] lg:grid-cols-[360px_1fr] lg:grid-rows-1">
    <aside className="flex min-h-0 flex-col border-r border-black/10 bg-white">
      <div className="space-y-3 border-b border-black/10 p-4"><p className="text-[10px] text-black/55">{me?.environment==="development"?"Ambiente local · banco isolado":me?.environment==="staging"?"Homologação":"Produção"}{me?.inboundHost?` · Recebimento: ${me.inboundHost}`:""}</p>
        <div className="flex items-center gap-3 border-b border-black/15 py-2"><Search size={15} className="text-black/35"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conversa" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/><button onClick={refresh} aria-label="Atualizar inbox"><RefreshCw size={15}/></button></div>
        <div className="flex gap-2"><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="flex-1 border border-black/15 bg-white px-3 py-2 text-xs"><option value="">Todos os modos</option><option value="AGENT">Agente</option><option value="HUMAN">Humano</option></select><label className="flex items-center gap-2 border border-black/15 px-3 text-[10px] uppercase tracking-[0.1em]"><input type="checkbox" checked={failuresOnly} onChange={(event) => setFailuresOnly(event.target.checked)}/> Falhas</label></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{loading && <p role="status" className="p-4 text-xs">Carregando conversas…</p>}{!loading&&!items.length&&!error&&<p className="p-4 text-xs">Nenhuma conversa encontrada neste ambiente.</p>}{items.map((item) => <button key={item.id} disabled={sending} onClick={() => { setSelectedId(item.id);pendingKey.current=null;setDraft("");setNotice("");setError(""); }} className={`w-full border-b border-black/5 p-4 text-left ${selectedId === item.id ? "bg-[#7A2535]/[0.07]" : "hover:bg-black/[0.025]"}`}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-medium">{item.lead_name || item.contact_name || item.contact_phone || item.external_id}</div><div className="mt-1 truncate text-xs text-black/45">{item.last_message || "Sem mensagens"}</div></div><ModeBadge mode={item.mode}/></div>
        <div className="mt-3 flex items-center justify-between text-[9px] uppercase tracking-[0.1em] text-black/40"><span>{item.line_name || item.claimed_by_name || item.edition_name || "Sem responsável"}</span><span>{new Date(item.last_message_at || item.updated_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span></div>
        {(item.agent_error || ["FAILED","SEND_UNKNOWN"].includes(item.last_status??"")) && <div className="mt-2 flex items-center gap-1 text-[10px] text-[#7A2535]"><AlertTriangle size={12}/> Falha requer atenção</div>}
      </button>)}{nextList&&<button onClick={more} disabled={paging||listFetching} className="w-full p-4 text-xs underline disabled:opacity-40">Carregar mais conversas</button>}</div>
    </aside>
    <div className="flex min-h-0 flex-col">{error&&<div role="alert" className="border-b border-[#7A2535]/20 bg-white p-4 text-xs text-[#7A2535]">{error} {lastUpdated&&"Os dados exibidos podem estar desatualizados."}<button onClick={refresh} className="ml-3 underline">Tentar novamente</button></div>}
      {!conversation ? <div className="grid flex-1 place-items-center p-10 text-center text-sm text-black/35">{detailLoading?"Carregando histórico…":"Selecione uma conversa para abrir o histórico."}</div> : <>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 bg-white p-5">
          <div><p className="text-[9px] uppercase tracking-[0.18em] text-[#2E8E8E]">{[conversation.line_name,conversation.edition_name].filter(Boolean).join(" · ") || "WhatsApp"}</p><h2 className="serif mt-1 text-3xl">{conversation.lead_name || conversation.contact_name || conversation.contact_phone || conversation.external_id}</h2><p className="mt-1 text-xs text-black/45">{conversation.lead_stage?.replaceAll("_"," ")} · {conversation.claimed_by_name || "Sem responsável"}</p></div>
          <div className="flex gap-2">{conversation.mode === "AGENT" || !conversation.claimed_by ? <button onClick={claim} className="bg-[#191010] px-4 py-2 text-[9px] uppercase tracking-[0.13em] text-white">Assumir</button> : owned || me?.roles.some((role) => role === "admin" || role === "gestor") ? <button onClick={release} className="border border-black/20 px-4 py-2 text-[9px] uppercase tracking-[0.13em]">Devolver ao agente</button> : null}</div>
        </header>
        {(notice || conversation.agent_error || conversation.opted_out_at) && <div className="space-y-2 border-b border-black/10 p-4">{notice && <Banner>{notice}</Banner>}{conversation.agent_error && <Banner tone="error">Agente pausado: {conversation.agent_error}</Banner>}{conversation.opted_out_at && <Banner tone="error">Contato com opt-out: novas mensagens estão bloqueadas.</Banner>}</div>}
        {conversation.summary && <div className="border-b border-black/10 bg-[#2E8E8E]/[0.06] px-5 py-3 text-xs leading-relaxed text-black/60"><b>Resumo:</b> {conversation.summary}</div>}
        <div ref={messagePane} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">{nextMessage&&<button onClick={loadOlder} disabled={paging||detailFetching} className="w-full py-2 text-xs underline disabled:opacity-40">Carregar mensagens anteriores</button>}{(detail?.messages??[]).map((message) => <div key={message.id} className={`flex ${message.direction === "OUT" ? "justify-end" : "justify-start"}`}><div className={`max-w-[78%] px-4 py-3 text-sm leading-relaxed ${message.direction === "OUT" ? "bg-[#191010] text-white" : "border border-black/10 bg-white"}`}><p className="whitespace-pre-wrap">{message.body || `[${message.type}]`}</p><div className={`mt-2 flex gap-2 text-[9px] uppercase tracking-[0.1em] ${message.direction === "OUT" ? "text-white/45" : "text-black/35"}`}><span>{message.actor_name || (message.direction === "OUT" ? "Agente" : "Cliente")}</span><span>{message.status==="SEND_UNKNOWN"?"Envio não confirmado":message.status}</span><span>{new Date(message.created_at).toLocaleString("pt-BR")}</span></div>{message.last_error && <p className="mt-2 text-xs text-red-300">{message.last_error}</p>}{message.status==="SEND_UNKNOWN"&&me?.roles.some(role=>["admin","gestor"].includes(role))&&<div className="mt-3 flex flex-wrap gap-3 text-xs"><button onClick={()=>reconcileMessage(message.id,"delivered",message.checkout_id)} className="underline">Confirmar entrega</button><button onClick={()=>reconcileMessage(message.id,"not-sent",message.checkout_id)} className="underline">Confirmar que não foi enviado</button></div>}</div></div>)}</div>
        <footer className="border-t border-black/10 bg-white p-4">{!me?.capabilities?.manualSend&&<p className="mb-2 text-xs text-black/55">Envios manuais pausados neste ambiente.</p>}{owned ? <div className="flex items-end gap-3"><textarea disabled={sending} value={draft} onChange={(event) => {pendingKey.current=null;setDraft(event.target.value);}} rows={2} maxLength={1000} placeholder="Escreva uma resposta…" className="min-h-14 flex-1 resize-none border border-black/15 p-3 text-sm outline-none focus:border-[#7A2535]"/><button onClick={send} disabled={!draft.trim()||sending||!me?.capabilities?.manualSend} aria-label="Enviar mensagem" className="grid size-12 place-items-center bg-[#7A2535] text-white disabled:opacity-35"><Send size={17}/></button></div> : <p className="text-center text-xs text-black/40">Assuma a conversa para responder. O agente fica pausado durante o atendimento humano.</p>}</footer>
      </>}
    </div>
  </section>;
}

function ModeBadge({mode}:{mode:"AGENT"|"HUMAN"}) { return <span className={`inline-flex items-center gap-1 px-2 py-1 text-[8px] uppercase tracking-[0.12em] ${mode === "AGENT" ? "bg-[#2E8E8E]/10 text-[#2E8E8E]" : "bg-[#7A2535]/10 text-[#7A2535]"}`}>{mode === "AGENT" ? <Bot size={11}/> : <UserRound size={11}/>} {mode}</span>; }
function Banner({children,tone="info"}:{children:React.ReactNode;tone?:"info"|"error"}) { return <div className={`border p-3 text-xs ${tone === "error" ? "border-[#7A2535]/25 bg-[#7A2535]/[0.05] text-[#7A2535]" : "border-[#2E8E8E]/25 bg-[#2E8E8E]/[0.05] text-[#0A2B28]"}`}>{children}</div>; }
