import { env } from "cloudflare:workers";
import { createExecutionContext,createMessageBatch,getQueueResult } from "cloudflare:test";
import { afterEach,describe,expect,it,vi } from "vitest";
import { GET as listLines } from "../../app/api/admin/whatsapp/route";
import { POST as lineAction } from "../../app/api/admin/whatsapp/[id]/route";
import { GET as webhookHealth,POST as receiveWebhook } from "../../app/api/webhooks/uazapi/[id]/route";
import { GET as listInbox } from "../../app/api/admin/conversations/route";
import { GET as detailInbox } from "../../app/api/admin/conversations/[id]/route";
import { POST as claim } from "../../app/api/admin/conversations/[id]/claim/route";
import { POST as queueReply } from "../../app/api/admin/conversations/[id]/messages/route";
import { processIncomingWhatsApp,processManualConversationMessage } from "@/server/conversation-processing";
import { acceptUazapiWebhook,processUazapiBatch,processUazapiStatus } from "@/server/uazapi-webhook";
import { operateWhatsAppLine } from "@/server/whatsapp-lines";
import type { RuntimeSecrets } from "@/server/secrets";
import receiver from "../../workers/uazapi-receiver";
import { publishOutbox } from "@/server/outbox";

const instances = [{id:"vendas",name:"Vendas",baseUrl:"https://vendas.uazapi.test",token:"synthetic-vendas-token"},{id:"eventos",name:"Eventos",baseUrl:"https://eventos.uazapi.test",token:"synthetic-eventos-token"}];
const runtime = env as Env & RuntimeSecrets;
const ctx = (id:string) => ({params:Promise.resolve({id})});
const request = (path:string,body?:unknown,extra:Record<string,string>={}) => new Request(`https://newwed.test${path}`,{method:body === undefined ? "GET" : "POST",headers:{"content-type":"application/json",origin:"https://newwed.test",...extra},body:body === undefined ? undefined : JSON.stringify(body)});
const message = (id="MSG-1",overrides:Record<string,unknown>={}) => ({id:`5581888888888:${id}`,messageid:id,chatid:"5581999999999@s.whatsapp.net",senderName:"VALIDACAO Contato",text:"Quero informações",fromMe:false,messageTimestamp:Date.now(),...overrides});
async function webhook(lineId="vendas",payload:Record<string,unknown>={EventType:"messages",message:message()}) {
  return receiveWebhook(request(`/api/webhooks/uazapi/${lineId}`,{token:instances.find(line=>line.id===lineId)?.token,...payload}),ctx(lineId));
}
async function drain() {
  const batches = await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.batch'").all<{external_id:string}>();
  for (const batch of batches.results) await processUazapiBatch(runtime,batch.external_id);
  const events = await env.DB.prepare("SELECT external_id,event_type FROM webhook_events WHERE provider='uazapi' AND event_type!='uazapi.batch' ORDER BY created_at").all<{external_id:string;event_type:string}>();
  for (const event of events.results) {
    if (event.event_type === "uazapi.status") await processUazapiStatus(runtime,event.external_id);
    else await processIncomingWhatsApp(runtime,event.external_id,{},"uazapi");
  }
}
async function admin() {
  const response = await listLines(request("/api/admin/whatsapp"));
  expect(response.status).toBe(200);
  return (await env.DB.prepare("SELECT id FROM users WHERE email='admin@newwed.local'").first<{id:string}>())!.id;
}
afterEach(()=>vi.restoreAllMocks());

describe("UAZAPI no runtime Workers",()=>{
  it("isola a fila de recebimento, processa até a Inbox e recupera somente eventos UAZAPI",async()=>{
    const dedicatedSend=vi.fn<(event:unknown)=>Promise<void>>().mockResolvedValue(undefined);
    const commercialSend=vi.fn<(event:unknown)=>Promise<void>>().mockResolvedValue(undefined);
    const inboundEnv={...runtime,UAZAPI_EVENTS_QUEUE:{send:dedicatedSend} as unknown as Queue,EVENTS_QUEUE:{send:commercialSend} as unknown as Queue};
    await acceptUazapiWebhook(inboundEnv,"vendas",{token:instances[0].token,EventType:"messages",message:message("INBOUND-ONLY")},"request-inbound-only");
    expect(dedicatedSend).toHaveBeenCalledTimes(1);expect(commercialSend).not.toHaveBeenCalled();
    const context=createExecutionContext();
    const batch=createMessageBatch("uazapi-test",[{id:"batch",timestamp:Date.now(),attempts:1,body:dedicatedSend.mock.calls[0][0]}]);
    await receiver.queue(batch,inboundEnv);
    expect((await getQueueResult(batch,context)).explicitAcks).toContain("batch");
    const incoming=dedicatedSend.mock.calls[1][0];
    const now=new Date().toISOString();
    await env.DB.prepare("INSERT INTO whatsapp_agents (id,instance_id,name,instructions,model,enabled,version,updated_by,created_at,updated_at) VALUES ('inbound-agent','vendas','VALIDACAO','Contexto sintético','openrouter/free',1,1,'synthetic',?,?)").bind(now,now).run();
    const externalFetch=vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("Unexpected external request"));
    const incomingBatch=createMessageBatch("uazapi-test",[{id:"incoming",timestamp:Date.now(),attempts:1,body:incoming}]);
    await receiver.queue(incomingBatch,{...inboundEnv,OPENROUTER_API_KEY:"synthetic-should-not-be-used"} as typeof inboundEnv);
    expect((await getQueueResult(incomingBatch,context)).explicitAcks).toContain("incoming");
    expect(await env.DB.prepare("SELECT mode FROM conversations WHERE whatsapp_instance_id='vendas'").first()).toMatchObject({mode:"HUMAN"});
    expect(await env.DB.prepare("SELECT count(*) AS count FROM messages WHERE direction='OUT'").first()).toMatchObject({count:0});
    expect(externalFetch).not.toHaveBeenCalled();
    await env.DB.prepare("INSERT INTO outbox_events (id,type,aggregate_id,dedupe_key,payload_json,attempts,created_at) VALUES ('commercial','checkout.send','checkout','commercial','{}',0,?)").bind(new Date().toISOString()).run();
    await env.DB.prepare("UPDATE outbox_events SET published_at=NULL WHERE type='uazapi.incoming'").run();
    dedicatedSend.mockClear();
    await receiver.scheduled({} as ScheduledController,inboundEnv);
    expect(dedicatedSend).toHaveBeenCalledTimes(1);expect(commercialSend).not.toHaveBeenCalled();
    expect(await env.DB.prepare("SELECT published_at FROM outbox_events WHERE id='commercial'").first()).toMatchObject({published_at:null});
    await publishOutbox(inboundEnv,{id:"commercial",type:"checkout.send"});
    expect(commercialSend).toHaveBeenCalledTimes(1);
  });
  it("publica diagnóstico sem segredos e recebe antes de conhecer a URL do provider",async()=>{
    const runtimeOnly={...runtime,UAZAPI_INSTANCES:JSON.stringify([{id:"atendimento",name:"Atendimento",token:"synthetic-inbound-token"}])};
    const result=await acceptUazapiWebhook(runtimeOnly,"atendimento",{token:"synthetic-inbound-token",EventType:"messages",message:message("RECEIVE-ONLY")},"request-receive-only");
    expect(result).toMatchObject({received:true,ignored:false});
    const health=await webhookHealth(request("/api/webhooks/uazapi/vendas"),ctx("vendas"));
    expect(health.status).toBe(200);expect(await health.json()).toEqual({provider:"uazapi",line:"vendas",status:"ready",method:"POST",authentication:"instance-token"});
    expect((await webhookHealth(request("/api/webhooks/uazapi/unknown"),ctx("unknown"))).status).toBe(404);
    await expect(acceptUazapiWebhook(runtimeOnly,"atendimento",{token:"wrong-token",EventType:"connection"},"request-invalid")).rejects.toMatchObject({status:401});
  });
  it("lista linhas sem tokens e impede vendedor e solicitações cross-site de operar",async()=>{
    const response = await listLines(request("/api/admin/whatsapp"));
    const body = await response.text();
    expect(body).toContain("Vendas");expect(body).not.toContain("synthetic");
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users(id,email,name,active,created_at,updated_at) VALUES ('vendor','vendor@test.local','Vendedor',1,?,?)").bind(now,now),
      env.DB.prepare("INSERT INTO roles(id,user_id,role,created_at) VALUES ('vendor-role','vendor','vendedor',?)").bind(now),
    ]);
    expect((await lineAction(request("/api/admin/whatsapp/vendas",{action:"connect"},{"x-dev-access-email":"vendor@test.local"}),ctx("vendas"))).status).toBe(403);
    expect((await lineAction(request("/api/admin/whatsapp/vendas",{action:"connect"},{origin:"https://evil.test"}),ctx("vendas"))).status).toBe(403);
  });
  it("conecta, atualiza QR pelo status, evita conexão duplicada e preserva histórico ao desconectar",async()=>{
    const actorId = await admin();
    let state = "disconnected";
    const paths:string[] = [];
    const fetcher = vi.fn(async (url:RequestInfo|URL,init?:RequestInit) => {
      const path = new URL(String(url)).pathname;paths.push(path);
      if (path === "/webhook") {
        expect(JSON.parse(String(init?.body))).toMatchObject({events:["connection","messages","messages_update","history"],excludeMessages:["wasSentByApi","isGroupYes"]});
        return Response.json([]);
      }
      if (path === "/instance/connect") {state="connecting";return Response.json({response:"Connecting"});}
      if (path === "/instance/disconnect") {state="disconnected";return Response.json({});}
      return Response.json({instance:{status:state,qrcode:"data:image/png;base64,c3ludGhldGlj",token:"never-return"},status:{jid:null}});
    });
    const result = await operateWhatsAppLine(runtime,"vendas","connect",actorId,fetcher);
    expect(result).toMatchObject({state:"connecting",qrCode:"data:image/png;base64,c3ludGhldGlj"});
    expect(JSON.stringify(result)).not.toContain("never-return");
    await operateWhatsAppLine(runtime,"vendas","connect",actorId,fetcher);
    expect(paths.filter(path=>path==="/instance/connect")).toHaveLength(1);
    state="connected";
    expect(await operateWhatsAppLine(runtime,"vendas","connect",actorId,fetcher)).toMatchObject({state:"connected",qrCode:null});
    expect(paths.filter(path=>path==="/instance/connect")).toHaveLength(1);
    expect(paths.filter(path=>path==="/webhook")).toHaveLength(3);
    await webhook();await drain();
    expect(await operateWhatsAppLine(runtime,"vendas","disconnect",actorId,fetcher)).toMatchObject({state:"disconnected",qrCode:null});
    expect((await env.DB.prepare("SELECT count(*) AS total FROM messages").first<{total:number}>())?.total).toBe(1);
  });
  it("gera um QR novo encerrando apenas uma tentativa pendente",async()=>{
    const actorId=await admin();
    let state="connecting";
    const paths:string[]=[];
    const fetcher=vi.fn(async(url:RequestInfo|URL)=>{
      const path=new URL(String(url)).pathname;paths.push(path);
      if(path==="/instance/disconnect"){state="disconnected";return Response.json({});}
      if(path==="/webhook")return Response.json([]);
      if(path==="/instance/connect"){state="connecting";return Response.json({response:"Connecting"});}
      return Response.json({instance:{status:state,qrcode:state==="connecting"?"data:image/png;base64,bmV3LXFy":"",token:"never-return"},status:{jid:null}});
    });
    const result=await operateWhatsAppLine(runtime,"vendas","restart",actorId,fetcher);
    expect(paths).toEqual(["/instance/status","/instance/disconnect","/instance/status","/webhook","/instance/connect","/instance/status"]);
    expect(result).toMatchObject({state:"connecting",qrCode:"data:image/png;base64,bmV3LXFy"});
    expect(JSON.stringify(result)).not.toContain("never-return");

    state="connected";
    paths.length=0;
    await expect(operateWhatsAppLine(runtime,"vendas","restart",actorId,fetcher)).rejects.toMatchObject({code:"WHATSAPP_QR_RESTART_NOT_AVAILABLE"});
    expect(paths).toEqual(["/instance/status"]);
  });
  it("exclui operações simultâneas e libera o lock depois de falha sem vazar a resposta",async()=>{
    const actorId = await admin();
    await env.DB.prepare("UPDATE whatsapp_instances SET operation_token='busy',operation_started_at=? WHERE id='vendas'").bind(new Date().toISOString()).run();
    const fetcher = vi.fn(async()=>Response.json({error:"provider-secret"},{status:401}));
    await expect(operateWhatsAppLine(runtime,"vendas","connect",actorId,fetcher)).rejects.toMatchObject({code:"WHATSAPP_LINE_BUSY"});
    expect(fetcher).not.toHaveBeenCalled();
    await env.DB.prepare("UPDATE whatsapp_instances SET operation_token=NULL WHERE id='vendas'").run();
    await expect(operateWhatsAppLine(runtime,"vendas","refresh",actorId,fetcher)).rejects.toMatchObject({code:"UAZAPI_HTTP_401"});
    const stored = await env.DB.prepare("SELECT operation_token,last_error FROM whatsapp_instances WHERE id='vendas'").first<{operation_token:string|null;last_error:string}>();
    expect(stored?.operation_token).toBeNull();expect(stored?.last_error).not.toContain("provider-secret");
  });
  it("persiste conexão confirmada por JID textual usando somente consulta de estado",async()=>{
    const actorId=await admin();
    const fetcher=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
      expect(new URL(String(url)).pathname).toBe("/instance/status");expect(init?.method).toBe("GET");
      return Response.json({instance:{status:"connected",profileName:"VALIDACAO",token:"synthetic-private-token"},status:{connected:true,loggedIn:true,jid:"5581999999999:42@s.whatsapp.net"}});
    });
    const result=await operateWhatsAppLine(runtime,"vendas","refresh",actorId,fetcher);
    expect(result).toMatchObject({state:"connected",phone:"5581999999999",qrCode:null});
    expect(JSON.stringify(result)).not.toContain("synthetic-private-token");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await env.DB.prepare("SELECT state,phone,last_error,operation_token FROM whatsapp_instances WHERE id='vendas'").first()).toEqual({state:"connected",phone:"5581999999999",last_error:null,operation_token:null});
  });
  it("autentica webhooks por linha, remove credenciais, deduplica e separa o mesmo contato entre números",async()=>{
    expect((await webhook("vendas",{token:instances[1].token,EventType:"messages",message:message()})).status).toBe(401);
    const event = message();
    expect((await webhook("vendas",{EventType:"messages",message:event,otherSecret:"sensitive"})).status).toBe(200);
    await webhook("vendas",{EventType:"messages",message:event});
    await webhook("eventos",{EventType:"messages",message:event});
    await drain();await drain();
    const rows = await env.DB.prepare("SELECT whatsapp_instance_id,mode,contact_name FROM conversations ORDER BY whatsapp_instance_id").all();
    expect(rows.results).toHaveLength(2);
    expect(rows.results.every(row=>row.mode==="HUMAN")).toBe(true);
    expect((await env.DB.prepare("SELECT count(*) AS total FROM messages").first<{total:number}>())?.total).toBe(2);
    const stored = await env.DB.prepare("SELECT payload_json FROM webhook_events UNION ALL SELECT payload_json FROM messages UNION ALL SELECT payload_json FROM outbox_events").all();
    expect(JSON.stringify(stored.results)).not.toMatch(/synthetic-vendas-token|synthetic-eventos-token|sensitive/);
    const inbox = await listInbox(request("/api/admin/conversations?q=VALIDACAO"));
    const items = await inbox.json() as {items:Array<{id:string;line_name:string;contact_phone:string}>};
    expect(items.items).toHaveLength(2);expect(items.items.map(item=>item.line_name).sort()).toEqual(["Eventos","Vendas"]);
    expect((await detailInbox(request(`/api/admin/conversations/${items.items[0].id}`),ctx(items.items[0].id))).status).toBe(200);
  });
  it("importa histórico sem respostas e pausa agente quando alguém responde pelo celular",async()=>{
    await webhook("vendas",{EventType:"history",event:"messages",messages:[message("OLD-1",{fromMe:undefined,messageTimestamp:1_700_000_000_000})]});
    await drain();
    const conversation = await env.DB.prepare("SELECT id,last_message_at FROM conversations").first<{id:string;last_message_at:string}>();
    expect(conversation?.last_message_at).toBe("2023-11-14T22:13:20.000Z");
    await env.DB.prepare("UPDATE conversations SET mode='AGENT',human_active=0").run();
    await webhook("vendas",{EventType:"messages",message:message("PHONE-1",{fromMe:true})});
    await drain();
    expect((await env.DB.prepare("SELECT mode FROM conversations").first<{mode:string}>())?.mode).toBe("HUMAN");
    expect((await env.DB.prepare("SELECT direction FROM messages WHERE external_id='uazapi:vendas:PHONE-1'").first<{direction:string}>())?.direction).toBe("OUT");
    await webhook("vendas",{EventType:"messages",message:message("API-1",{fromMe:true,wasSentByApi:true})});
    const group = await webhook("vendas",{EventType:"messages",message:message("GROUP-1",{isGroup:true})});
    expect(await group.json()).toMatchObject({ignored:true});
    await drain();
    expect((await env.DB.prepare("SELECT count(*) AS total FROM messages").first<{total:number}>())?.total).toBe(2);
  });
  it("envia pela linha da conversa e aplica recibo antecipado sem regredir leitura",async()=>{
    await webhook();await drain();
    const conversation = (await env.DB.prepare("SELECT id FROM conversations").first<{id:string}>())!;
    await claim(request(`/api/admin/conversations/${conversation.id}/claim`,{}),ctx(conversation.id));
    await env.DB.prepare("UPDATE whatsapp_instances SET state='connected' WHERE id='vendas'").run();
    const response = await queueReply(request(`/api/admin/conversations/${conversation.id}/messages`,{body:"Olá, como podemos ajudar?"},{"idempotency-key":"synthetic-reply-1"}),ctx(conversation.id));
    expect(response.status).toBe(202);
    const {messageId} = await response.json() as {messageId:string};
    await webhook("vendas",{EventType:"messages_update",state:"Read",event:{MessageIDs:["OUT-1"],IsFromMe:true}});
    await drain();
    const fetcher = vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
      expect(String(url)).toBe("https://vendas.uazapi.test/send/text");
      expect(init?.headers).toMatchObject({token:instances[0].token});
      expect(JSON.parse(String(init?.body))).toMatchObject({number:"5581999999999",text:"Olá, como podemos ajudar?",async:false});
      return Response.json({id:"5581888888888:OUT-1",messageid:"OUT-1"});
    });
    expect(await processManualConversationMessage(runtime,messageId,fetcher)).toMatchObject({sent:true});
    expect((await env.DB.prepare("SELECT status FROM messages WHERE id=?").bind(messageId).first<{status:string}>())?.status).toBe("READ");
    await webhook("vendas",{EventType:"messages_update",state:"Delivered",event:{MessageIDs:["OUT-1"],IsFromMe:true}});await drain();
    expect((await env.DB.prepare("SELECT status FROM messages WHERE id=?").bind(messageId).first<{status:string}>())?.status).toBe("READ");
    expect(await processManualConversationMessage(runtime,messageId,fetcher)).toMatchObject({idempotent:true});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("faz fan-out limitado de histórico e deixa continuação recuperável na outbox",async()=>{
    const response = await webhook("vendas",{EventType:"history",event:"messages",messages:Array.from({length:25},(_,i)=>message(`BATCH-${i}`))});
    expect(response.status).toBe(200);
    const batch = (await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.batch'").first<{external_id:string}>())!;
    await processUazapiBatch(runtime,batch.external_id,0);
    expect((await env.DB.prepare("SELECT count(*) AS total FROM webhook_events WHERE event_type='uazapi.incoming'").first<{total:number}>())?.total).toBe(10);
    await processUazapiBatch(runtime,batch.external_id,10);await processUazapiBatch(runtime,batch.external_id,20);
    expect((await env.DB.prepare("SELECT count(*) AS total FROM webhook_events WHERE event_type='uazapi.incoming'").first<{total:number}>())?.total).toBe(25);
    const offlineQueue={send:vi.fn().mockRejectedValue(new Error("synthetic Queue offline"))} as unknown as Queue;
    expect(await acceptUazapiWebhook({...runtime,EVENTS_QUEUE:offlineQueue},"vendas",{token:instances[0].token,EventType:"messages",message:message("QUEUE-RETRY")},"req-uazapi-retry")).toMatchObject({received:true,queued:0});
    expect((await env.DB.prepare("SELECT count(*) AS total FROM outbox_events WHERE type='uazapi.batch' AND published_at IS NULL AND attempts=1").first<{total:number}>())?.total).toBe(1);
  });
  it("processa histórico em lotes D1 sem enfileirar uma mensagem por item",async()=>{
    const queueSend=vi.fn(async()=>{});
    const inboundEnv={...runtime,UAZAPI_EVENTS_QUEUE:{send:queueSend} as unknown as Queue,EVENTS_QUEUE:{send:vi.fn(async()=>{})} as unknown as Queue};
    const response=await acceptUazapiWebhook(inboundEnv,"vendas",{token:instances[0].token,EventType:"history",event:"messages",messages:Array.from({length:25},(_,i)=>message(`DIRECT-${i}`))},"req-history-direct");
    expect(response.queued).toBe(25);
    const batch=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.batch'").first<{external_id:string}>();
    const processHistory=async(externalId:string)=>{
      const result=await processIncomingWhatsApp({...inboundEnv,OPENROUTER_API_KEY:undefined},externalId,{},"uazapi");
      expect(result.processed).toBe(true);
    };
    await processUazapiBatch(inboundEnv,batch!.external_id,0,{processHistory});
    await processUazapiBatch(inboundEnv,batch!.external_id,10,{processHistory});
    await processUazapiBatch(inboundEnv,batch!.external_id,20,{processHistory});
    expect(queueSend).toHaveBeenCalledTimes(3); // One parent plus two continuations, not 25 leaf messages.
    expect((await env.DB.prepare("SELECT count(*) AS total FROM messages").first<{total:number}>())?.total).toBe(25);
    expect((await env.DB.prepare("SELECT count(*) AS total FROM conversations WHERE mode='HUMAN'").first<{total:number}>())?.total).toBe(1);
    expect((await env.DB.prepare("SELECT count(*) AS total FROM webhook_events WHERE event_type='uazapi.incoming' AND processed_at IS NULL").first<{total:number}>())?.total).toBe(0);
    expect((await env.DB.prepare("SELECT count(*) AS total FROM outbox_events WHERE type='uazapi.incoming'").first<{total:number}>())?.total).toBe(0);
  });
  it("recupera o histórico no cron quando a Queue recusa escritas",async()=>{
    const queueSend=vi.fn().mockRejectedValue(new Error("Synthetic daily write limit"));
    const inboundEnv={...runtime,UAZAPI_EVENTS_QUEUE:{send:queueSend} as unknown as Queue,EVENTS_QUEUE:{send:queueSend} as unknown as Queue};
    const result=await acceptUazapiWebhook(inboundEnv,"vendas",{token:instances[0].token,EventType:"history",event:"messages",messages:Array.from({length:3},(_,i)=>message(`RECOVER-${i}`))},"req-history-recovery");
    expect(result).toMatchObject({received:true,queued:0});
    await receiver.scheduled({} as ScheduledController,inboundEnv);
    expect(queueSend).toHaveBeenCalledTimes(1);
    expect((await env.DB.prepare("SELECT count(*) AS total FROM messages").first<{total:number}>())?.total).toBe(3);
    expect((await env.DB.prepare("SELECT count(*) AS total FROM conversations WHERE mode='HUMAN'").first<{total:number}>())?.total).toBe(1);
    expect((await env.DB.prepare("SELECT count(*) AS total FROM webhook_events WHERE event_type='uazapi.incoming' AND processed_at IS NULL").first<{total:number}>())?.total).toBe(0);
    expect((await env.DB.prepare("SELECT count(*) AS total FROM outbox_events WHERE type='uazapi.batch' AND published_at IS NULL").first<{total:number}>())?.total).toBe(0);
  });
  it("respeita orçamento compartilhado de histórico e retoma do cursor persistido",async()=>{
    const queueSend=vi.fn(async()=>{});
    const inboundEnv={...runtime,HISTORY_CRON_MESSAGE_BUDGET:"12",UAZAPI_EVENTS_QUEUE:{send:queueSend} as unknown as Queue};
    await acceptUazapiWebhook(inboundEnv,"vendas",{token:instances[0].token,EventType:"history",event:"messages",messages:Array.from({length:25},(_,i)=>message(`BUDGET-${i}`))},"req-history-budget");
    await receiver.scheduled({} as ScheduledController,inboundEnv);
    expect(await env.DB.prepare("SELECT count(*) AS total FROM messages").first()).toEqual({total:12});
    await receiver.scheduled({} as ScheduledController,inboundEnv);
    expect(await env.DB.prepare("SELECT count(*) AS total FROM messages").first()).toEqual({total:24});
    await receiver.scheduled({} as ScheduledController,inboundEnv);
    expect(await env.DB.prepare("SELECT count(*) AS total FROM messages").first()).toEqual({total:25});
    expect(queueSend).toHaveBeenCalledTimes(1);
  });
  it("não importa histórico quando outra execução possui o lease da linha",async()=>{
    const queueSend=vi.fn(async()=>{});
    const inboundEnv={...runtime,UAZAPI_EVENTS_QUEUE:{send:queueSend} as unknown as Queue};
    await acceptUazapiWebhook(inboundEnv,"vendas",{token:instances[0].token,EventType:"history",event:"messages",messages:[message("LOCKED-HISTORY")]},"req-history-lease");
    await env.DB.prepare("INSERT INTO operation_leases VALUES ('history:vendas','other',?)").bind(new Date(Date.now()+60000).toISOString()).run();
    await receiver.scheduled({} as ScheduledController,inboundEnv);
    expect(await env.DB.prepare("SELECT count(*) AS total FROM messages").first()).toEqual({total:0});
    await env.DB.prepare("DELETE FROM operation_leases").run();
    await receiver.scheduled({} as ScheduledController,inboundEnv);
    expect(await env.DB.prepare("SELECT count(*) AS total FROM messages").first()).toEqual({total:1});
  });

});
