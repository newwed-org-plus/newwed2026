"use client";

import { useCallback,useEffect,useRef,useState } from "react";
import { LoaderCircle,QrCode,RefreshCw,Unplug } from "lucide-react";
import { adminApi } from "@/features/admin/api";

type Line = { id:string;name:string;state:"disconnected"|"connecting"|"connected"|"hibernated";phone:string|null;profile_name:string|null;last_error:string|null;updated_at:string;serverConfigured?:boolean };
type History={job:null|{status:string;scanned_count:number;last_error:string|null};totals:{conversations:number;messages:number}};
type Session = { id:string;state:Line["state"];qrCode:string|null;phone:string|null;profileName:string|null;updatedAt:string };
const labels = { disconnected:"Desconectado",connecting:"Aguardando conexão",connected:"Conectado",hibernated:"Sessão pausada" };

export function AdminWhatsApp() {
  const [lines,setLines] = useState<Line[]>([]);
  const [selectedId,setSelectedId] = useState("");
  const [session,setSession] = useState<Session|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [localTestMode,setLocalTestMode]=useState(false);
  const [historyEnabled,setHistoryEnabled]=useState(false);
  const [history,setHistory]=useState<History|null>(null);
  const historyFlight=useRef(false);
  const [syncing,setSyncing]=useState(false);
  const [confirmDisconnect,setConfirmDisconnect] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const invalidate = useCallback(() => { generation.current++; },[]);
  const load = useCallback(async () => {
    try {
      const {items,historySyncEnabled,localTestMode} = await adminApi<{items:Line[];historySyncEnabled?:boolean;localTestMode?:boolean}>("/api/admin/whatsapp");
      setLines(items);setHistoryEnabled(historySyncEnabled===true);setLocalTestMode(localTestMode===true);
      setSelectedId(current => items.some(line => line.id === current) ? current : items[0]?.id ?? "");
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar as linhas."); }
    finally { setLoading(false); }
  },[]);
  useEffect(() => { void load();return invalidate; },[load,invalidate]);
  const serverConfigured=lines.find(item=>item.id===selectedId)?.serverConfigured!==false;
  const line = lines.find(item => item.id === selectedId);
  const state = session?.state ?? line?.state;

  const operate = useCallback(async (action:"refresh"|"connect"|"disconnect"|"restart"):Promise<Session|null> => {
    if (!selectedId || !serverConfigured || inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    const version = generation.current;
    try {
      const result = await adminApi<Session>(`/api/admin/whatsapp/${selectedId}`,{method:"POST",body:JSON.stringify({action})});
      if (version !== generation.current) return null;
      setSession(result);setError("");if (action !== "refresh") setConfirmDisconnect(false);
      setLines(current => current.map(line => line.id === result.id ? {...line,state:result.state,phone:result.phone,profile_name:result.profileName,last_error:null,updated_at:result.updatedAt} : line));
      return result;
    } catch (reason) {
      if (version === generation.current) {
        setSession(null);
        setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a conexão.");
      }
      return null;
    } finally { inFlight.current = false;if (version === generation.current) setBusy(false); }
  },[selectedId,serverConfigured]);
  useEffect(() => {
    if (!selectedId || !serverConfigured) return;
    void operate("refresh");
  },[selectedId,serverConfigured,operate]);
  useEffect(() => {
    if (!selectedId || !serverConfigured || state !== "connecting") return;
    let stopped = false;
    let timer:ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (document.visibilityState === "visible") {
        const result = await operate("refresh");
        if (result && result.state !== "connecting") return;
      }
      if (!stopped) timer = setTimeout(poll,5000);
    };
    timer = setTimeout(poll,5000);
    return () => { stopped = true;clearTimeout(timer); };
  },[selectedId,serverConfigured,operate,state]);
  const loadHistory=useCallback(async()=>{
    if(!selectedId||!historyEnabled||historyFlight.current)return null;
    historyFlight.current=true;const version=generation.current;
    try{const result=await adminApi<History>(`/api/admin/whatsapp/${selectedId}/history`);if(version!==generation.current)return null;setHistory(result);return result;}catch(reason){if(version===generation.current)setError(reason instanceof Error?reason.message:"Não foi possível consultar o histórico.");return null;}finally{historyFlight.current=false;}
  },[selectedId,historyEnabled]);
  useEffect(()=>{setHistory(null);void loadHistory();},[loadHistory]);
  const historyStatus=history?.job?.status;
  useEffect(()=>{
    if(!localTestMode&&(!historyStatus||!["PENDING","RUNNING"].includes(historyStatus)))return;
    let stopped=false;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{const next=await loadHistory();if(!stopped&&(localTestMode||!next||next.job&&["PENDING","RUNNING"].includes(next.job.status)))timer=setTimeout(poll,5000);};
    timer=setTimeout(poll,5000);return()=>{stopped=true;clearTimeout(timer);};
  },[historyStatus,loadHistory,localTestMode]);
  const importHistory=async()=>{
    if(syncing)return;setSyncing(true);setError("");
    try{await adminApi(`/api/admin/whatsapp/${selectedId}/history`,{method:"POST",body:"{}"});await loadHistory();}catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível iniciar a importação.");}finally{setSyncing(false);}
  };
  const changeLine = (id: string) => { invalidate();setSelectedId(id);setSession(null);setBusy(false);setError("");setConfirmDisconnect(false); };

  return <section className="mx-auto max-w-5xl px-5 py-8 md:px-8">
    <p className="text-[10px] uppercase tracking-[0.2em] text-[#70112b]">Canais de atendimento</p>
    <h1 className="mt-2 text-4xl font-light">WhatsApp</h1>
    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-black/60">Conecte uma linha da equipe por QR Code. As mensagens recebidas e o histórico disponível aparecem na Inbox, separados por linha.</p>
    {error && <p role="alert" className="mt-5 border border-[#70112b]/20 bg-white p-4 text-sm text-[#70112b]">{error}</p>}
    {loading ? <p role="status" className="mt-8 text-sm">Carregando linhas…</p> : !lines.length ? <div className="mt-8 border border-black/10 bg-white p-7"><h2 className="text-xl">Nenhuma linha configurada</h2><p className="mt-3 text-sm leading-relaxed text-black/60">O administrador precisa cadastrar a instância UAZAPI e o endereço público de recebimento no servidor. Depois, atualize esta página para conectar o WhatsApp da equipe.</p><button onClick={load} className="mt-5 border border-black/20 px-4 py-3 text-sm">Atualizar linhas</button></div> : <div className="mt-8 grid gap-5 md:grid-cols-[240px_1fr]">
      <aside className="space-y-2" aria-label="Linhas de WhatsApp">{lines.map(item => <button key={item.id} onClick={() => changeLine(item.id)} aria-pressed={item.id === selectedId} className={`w-full border p-4 text-left ${item.id === selectedId ? "border-[#70112b] bg-white" : "border-black/10"}`}><span className="block font-medium">{item.name}</span><span className="mt-2 block text-xs text-black/55">{item.serverConfigured===false?"Somente recebimento":labels[item.state]}</span></button>)}</aside>
      {line && <div className="min-w-0 border border-black/10 bg-white p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-2xl">{line.name}</h2><span role="status" className={`rounded-full px-3 py-1 text-xs ${state === "connected" ? "bg-green-50 text-green-800" : "bg-stone-100 text-stone-700"}`}>{!serverConfigured?"Somente recebimento":state ? labels[state] : "Consultando…"}</span></div>
        {session?.phone && <p className="mt-3 text-sm">+{session.phone}{session.profileName ? ` · ${session.profileName}` : ""}</p>}
        <div className="my-7 grid min-h-64 place-items-center border border-dashed border-black/15 p-5 text-center">
        {session?.qrCode ? <div>{/* QR is an ephemeral provider PNG, never a remote image or saved asset. */}<img src={session.qrCode} alt="QR Code para conectar o WhatsApp" className="mx-auto aspect-square w-60 max-w-full"/><p className="mt-4 max-w-sm text-sm leading-relaxed text-black/60">No WhatsApp do celular, abra Aparelhos conectados e toque em Conectar um aparelho. Se o WhatsApp informar que o QR Code é inválido, gere um novo QR Code.</p></div> : <div className="max-w-sm"><QrCode size={38} className="mx-auto text-[#70112b]"/><p className="mt-4 text-sm leading-relaxed text-black/60">{!serverConfigured ? "Recebimento preparado. Informe a URL do servidor UAZAPI para gerar QR Code e habilitar respostas nesta linha." : state === "connected" ? "Linha conectada. Abra a Inbox para acompanhar e responder às conversas." : state === "connecting" ? "Aguardando um QR Code ou a confirmação no celular…" : "Gere o QR Code e use o WhatsApp da equipe para conectar esta linha."}</p></div>}
        </div>
        <div className="flex flex-wrap gap-3">
          {state !== "connected" && state !== "connecting" && <button onClick={() => operate("connect")} disabled={busy||!serverConfigured} className="flex items-center gap-2 bg-[#70112b] px-5 py-3 text-sm text-white disabled:opacity-50"><QrCode size={16}/> Gerar QR Code</button>}
          {state === "connecting" && <button onClick={() => operate("restart")} disabled={busy||!serverConfigured} className="flex items-center gap-2 bg-[#70112b] px-5 py-3 text-sm text-white disabled:opacity-50"><RefreshCw size={16}/> Gerar novo QR Code</button>}
          {state === "connected" && <button onClick={() => operate("connect")} disabled={busy||!serverConfigured} className="flex items-center gap-2 bg-[#70112b] px-5 py-3 text-sm text-white disabled:opacity-50"><RefreshCw size={16}/> Ativar recebimento</button>}
          <button onClick={() => operate("refresh")} disabled={busy||!serverConfigured} className="flex items-center gap-2 border border-black/20 px-4 py-3 text-sm disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin"/> : <RefreshCw size={16}/>} Atualizar estado</button>
          {(state === "connected" || state === "connecting" || state === "hibernated") && <button onClick={() => setConfirmDisconnect(true)} disabled={busy||!serverConfigured} className="flex items-center gap-2 px-3 py-3 text-sm text-[#70112b]"><Unplug size={16}/> Desconectar</button>}
        </div>
        {historyEnabled&&<section aria-label="Importação do histórico" className="mt-6 border-t border-black/10 pt-5 text-sm"><h3 className="font-medium">Histórico na Inbox deste ambiente</h3>{history&&<p className="mt-2 text-black/60">{history.totals.conversations} conversas · {history.totals.messages} mensagens</p>}{history?.job&&<p role="status" className="mt-2">{history.job.status==="DONE"?"Consulta ao histórico disponível concluída.":history.job.status==="FAILED"?"Importação interrompida; confira o erro e tente novamente.":"Importando mensagens anteriores; você já pode abrir a Inbox."}</p>}{history?.job?.last_error&&<p className="mt-2 text-[#70112b]">{history.job.last_error}</p>}<button onClick={importHistory} disabled={syncing||state!=="connected"||Boolean(history?.job&&["PENDING","RUNNING"].includes(history.job.status))} className="mt-4 border border-black/20 px-4 py-3 disabled:opacity-50">{syncing?"Solicitando…":"Importar histórico disponível"}</button><p className="mt-2 text-xs text-black/50">Consulta o histórico da UAZAPI sem reconectar a linha. Mensagens importadas não disparam respostas.</p></section>}
        {confirmDisconnect && <div role="alert" className="mt-5 border border-[#70112b]/20 p-4 text-sm"><p>Desconectar {line.name}? Novas respostas ficarão indisponíveis até conectar novamente. O histórico será preservado.</p><div className="mt-4 flex flex-wrap gap-3"><button onClick={() => operate("disconnect")} disabled={busy||!serverConfigured} className="bg-[#70112b] px-4 py-2 text-white disabled:opacity-50">Confirmar desconexão</button><button onClick={() => setConfirmDisconnect(false)} className="border border-black/20 px-4 py-2">Cancelar</button></div></div>}
      </div>}
    </div>}
  </section>;
}
