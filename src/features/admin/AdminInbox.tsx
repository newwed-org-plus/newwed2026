"use client";

import { useCallback,useEffect,useState } from "react";
import { adminApi as inboxApi } from "@/features/admin/api";
import { AlertTriangle,Bot,RefreshCw,Search,Send,UserRound } from "lucide-react";

type InboxItem = {
  id:string;mode:"AGENT"|"HUMAN";external_id:string;claimed_by:string|null;claimed_by_name:string|null;agent_error:string|null;
  opted_out_at:string|null;lead_name:string|null;lead_stage:string|null;edition_name:string|null;last_message:string|null;last_direction:string|null;
  last_status:string|null;last_message_at:string|null;updated_at:string;
};
type Message = { id:string;external_id:string|null;direction:"IN"|"OUT";type:string;body:string|null;status:string;actor_name:string|null;last_error:string|null;created_at:string };
type Conversation = InboxItem & { lead_id:string|null;lead_email:string|null;lead_phone:string|null;company:string|null;city_state:string|null;summary:string|null;agent_paused_at:string|null;claimed_at:string|null };
type Detail = { conversation:Conversation;messages:Message[];nextCursor:string|null };
type CurrentUser = { id:string;name:string;roles:string[] };


function usePolling(task: () => Promise<void>,dependencies: readonly unknown[]) {
  useEffect(() => {
    let stopped = false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const run = async () => {
      await task().catch(() => undefined);
      if (!stopped) timer = setTimeout(run,document.visibilityState === "visible" ? 5000 : 30000);
    };
    void run();
    const onVisibility = () => { if (document.visibilityState === "visible") { clearTimeout(timer);void run(); } };
    document.addEventListener("visibilitychange",onVisibility);
    return () => { stopped = true;clearTimeout(timer);document.removeEventListener("visibilitychange",onVisibility); };
    // The caller supplies the stable inputs that should restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },dependencies);
}

export function AdminInbox() {
  const [items,setItems] = useState<InboxItem[]>([]);
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [detail,setDetail] = useState<Detail|null>(null);
  const [me,setMe] = useState<CurrentUser|null>(null);
  const [query,setQuery] = useState("");
  const [mode,setMode] = useState<""|"AGENT"|"HUMAN">("");
  const [failuresOnly,setFailuresOnly] = useState(false);
  const [draft,setDraft] = useState("");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ q:query });
    if (mode) params.set("mode",mode);
    if (failuresOnly) params.set("failure","true");
    const result = await inboxApi<{ items:InboxItem[] }>(`/api/admin/conversations?${params}`);
    setItems(result.items);
    setError("");
  },[query,mode,failuresOnly]);
  const loadDetail = useCallback(async () => {
    if (!selectedId) return;
    const result = await inboxApi<Detail>(`/api/admin/conversations/${selectedId}`);
    setDetail(result);
  },[selectedId]);

  useEffect(() => { inboxApi<CurrentUser>("/api/admin/me").then(setMe).catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar usuário.")); },[]);
  usePolling(loadList,[loadList]);
  usePolling(loadDetail,[loadDetail]);

  const refresh = async () => { await Promise.all([loadList(),loadDetail()]); };
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
  const send = async () => {
    if (!selectedId || !draft.trim()) return;
    try {
      await inboxApi(`/api/admin/conversations/${selectedId}/messages`,{ method:"POST",headers:{ "Idempotency-Key":crypto.randomUUID() },body:JSON.stringify({ body:draft }) });
      setDraft("");setNotice("Mensagem adicionada à fila de envio.");await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível responder."); }
  };

  const conversation = detail?.conversation;
  const owned = Boolean(conversation && me && conversation.mode === "HUMAN" && conversation.claimed_by === me.id);
  return <section className="mx-auto grid min-h-[calc(100vh-73px)] max-w-[1600px] grid-cols-1 bg-[#F7F4EE] lg:grid-cols-[360px_1fr]">
    <aside className="border-r border-black/10 bg-white">
      <div className="space-y-3 border-b border-black/10 p-4">
        <div className="flex items-center gap-3 border-b border-black/15 py-2"><Search size={15} className="text-black/35"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conversa" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/><button onClick={refresh} aria-label="Atualizar inbox"><RefreshCw size={15}/></button></div>
        <div className="flex gap-2"><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="flex-1 border border-black/15 bg-white px-3 py-2 text-xs"><option value="">Todos os modos</option><option value="AGENT">Agente</option><option value="HUMAN">Humano</option></select><label className="flex items-center gap-2 border border-black/15 px-3 text-[10px] uppercase tracking-[0.1em]"><input type="checkbox" checked={failuresOnly} onChange={(event) => setFailuresOnly(event.target.checked)}/> Falhas</label></div>
      </div>
      <div className="max-h-[calc(100vh-190px)] overflow-y-auto">{items.map((item) => <button key={item.id} onClick={() => { setSelectedId(item.id);setNotice(""); }} className={`w-full border-b border-black/5 p-4 text-left ${selectedId === item.id ? "bg-[#7A2535]/[0.07]" : "hover:bg-black/[0.025]"}`}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-medium">{item.lead_name || item.external_id}</div><div className="mt-1 truncate text-xs text-black/45">{item.last_message || "Sem mensagens"}</div></div><ModeBadge mode={item.mode}/></div>
        <div className="mt-3 flex items-center justify-between text-[9px] uppercase tracking-[0.1em] text-black/40"><span>{item.claimed_by_name || item.edition_name || "Sem responsável"}</span><span>{new Date(item.last_message_at || item.updated_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span></div>
        {(item.agent_error || item.last_status === "FAILED") && <div className="mt-2 flex items-center gap-1 text-[10px] text-[#7A2535]"><AlertTriangle size={12}/> Falha requer atenção</div>}
      </button>)}</div>
    </aside>
    <div className="flex min-h-0 flex-col">
      {!conversation ? <div className="grid flex-1 place-items-center p-10 text-center text-sm text-black/35">Selecione uma conversa para abrir o histórico.</div> : <>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 bg-white p-5">
          <div><p className="text-[9px] uppercase tracking-[0.18em] text-[#2E8E8E]">{conversation.edition_name || "WhatsApp"}</p><h2 className="serif mt-1 text-3xl">{conversation.lead_name || conversation.external_id}</h2><p className="mt-1 text-xs text-black/45">{conversation.lead_stage?.replaceAll("_"," ")} · {conversation.claimed_by_name || "Sem responsável"}</p></div>
          <div className="flex gap-2">{conversation.mode === "AGENT" || !conversation.claimed_by ? <button onClick={claim} className="bg-[#191010] px-4 py-2 text-[9px] uppercase tracking-[0.13em] text-white">Assumir</button> : owned || me?.roles.some((role) => role === "admin" || role === "gestor") ? <button onClick={release} className="border border-black/20 px-4 py-2 text-[9px] uppercase tracking-[0.13em]">Devolver ao agente</button> : null}</div>
        </header>
        {(error || notice || conversation.agent_error || conversation.opted_out_at) && <div className="space-y-2 border-b border-black/10 p-4">{error && <Banner tone="error">{error}</Banner>}{notice && <Banner>{notice}</Banner>}{conversation.agent_error && <Banner tone="error">Agente pausado: {conversation.agent_error}</Banner>}{conversation.opted_out_at && <Banner tone="error">Contato com opt-out: novas mensagens estão bloqueadas.</Banner>}</div>}
        {conversation.summary && <div className="border-b border-black/10 bg-[#2E8E8E]/[0.06] px-5 py-3 text-xs leading-relaxed text-black/60"><b>Resumo:</b> {conversation.summary}</div>}
        <div className="flex-1 space-y-3 overflow-y-auto p-5">{detail.messages.map((message) => <div key={message.id} className={`flex ${message.direction === "OUT" ? "justify-end" : "justify-start"}`}><div className={`max-w-[78%] px-4 py-3 text-sm leading-relaxed ${message.direction === "OUT" ? "bg-[#191010] text-white" : "border border-black/10 bg-white"}`}><p className="whitespace-pre-wrap">{message.body || `[${message.type}]`}</p><div className={`mt-2 flex gap-2 text-[9px] uppercase tracking-[0.1em] ${message.direction === "OUT" ? "text-white/45" : "text-black/35"}`}><span>{message.actor_name || (message.direction === "OUT" ? "Agente" : "Cliente")}</span><span>{message.status}</span><span>{new Date(message.created_at).toLocaleString("pt-BR")}</span></div>{message.last_error && <p className="mt-2 text-xs text-red-300">{message.last_error}</p>}</div></div>)}</div>
        <footer className="border-t border-black/10 bg-white p-4">{owned ? <div className="flex items-end gap-3"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} maxLength={1000} placeholder="Escreva uma resposta…" className="min-h-14 flex-1 resize-none border border-black/15 p-3 text-sm outline-none focus:border-[#7A2535]"/><button onClick={send} disabled={!draft.trim()} aria-label="Enviar mensagem" className="grid size-12 place-items-center bg-[#7A2535] text-white disabled:opacity-35"><Send size={17}/></button></div> : <p className="text-center text-xs text-black/40">Assuma a conversa para responder. O agente fica pausado durante o atendimento humano.</p>}</footer>
      </>}
    </div>
  </section>;
}

function ModeBadge({mode}:{mode:"AGENT"|"HUMAN"}) { return <span className={`inline-flex items-center gap-1 px-2 py-1 text-[8px] uppercase tracking-[0.12em] ${mode === "AGENT" ? "bg-[#2E8E8E]/10 text-[#2E8E8E]" : "bg-[#7A2535]/10 text-[#7A2535]"}`}>{mode === "AGENT" ? <Bot size={11}/> : <UserRound size={11}/>} {mode}</span>; }
function Banner({children,tone="info"}:{children:React.ReactNode;tone?:"info"|"error"}) { return <div className={`border p-3 text-xs ${tone === "error" ? "border-[#7A2535]/25 bg-[#7A2535]/[0.05] text-[#7A2535]" : "border-[#2E8E8E]/25 bg-[#2E8E8E]/[0.05] text-[#0A2B28]"}`}>{children}</div>; }
