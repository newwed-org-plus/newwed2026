import { env } from "cloudflare:workers";
import { afterEach,describe,expect,it,vi } from "vitest";
import { GET as listAgents } from "../../app/api/admin/agents/route";
import { POST as agentAction } from "../../app/api/admin/agents/[id]/route";
import { POST as release } from "../../app/api/admin/conversations/[id]/release/route";
import { getLineAgent,previewLineAgent,saveLineAgent } from "@/server/whatsapp-agents";
import { processConversationSummary,processIncomingWhatsApp } from "@/server/conversation-processing";
import { acceptUazapiWebhook,processUazapiBatch } from "@/server/uazapi-webhook";
import { ensureWhatsAppLines } from "@/server/whatsapp-lines";
import type { RuntimeSecrets } from "@/server/secrets";
const runtime={...env,OPENROUTER_API_KEY:"synthetic-openrouter"} as Env & RuntimeSecrets;
const config={instanceId:"vendas",name:"VALIDACAO Atendente",instructions:"Ajude com informações dos projetos New Wed, usando fatos verificados.",model:"test/attendant:free",enabled:true,version:0};
const ctx=(id:string)=>({params:Promise.resolve({id})});
const request=(id:string,body?:unknown,headers:Record<string,string>={})=>new Request(`https://newwed.test/api/admin/agents/${id}`,{method:body?"POST":"GET",headers:{"content-type":"application/json",origin:"https://newwed.test",...headers},body:body?JSON.stringify(body):undefined});
const answer={reply:"Olá! Posso explicar os projetos da New Wed.",confidence:0.95,handoff:false,reason:""};
function router(onChat?:()=>Promise<void>,result:unknown=answer){
  return vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
    expect(String(url).startsWith("https://openrouter.ai/api/v1/")).toBe(true);
    if(String(url).endsWith("/models"))return Response.json({data:[{id:config.model,name:"Atendente gratuito",pricing:{prompt:"0",completion:"0"},supported_parameters:["response_format"],architecture:{input_modalities:["text"],output_modalities:["text"]}}]});
    await onChat?.();
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer synthetic-openrouter");
    return Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(result)}}]});
  });
}
async function setup(){
  const listed=await listAgents(request(""));expect(listed.status).toBe(200);
  const actor=(await env.DB.prepare("SELECT id FROM users WHERE email='admin@newwed.local'").first<{id:string}>())!.id;
  await ensureWhatsAppLines(runtime);
  await env.DB.prepare("UPDATE whatsapp_instances SET state='connected' WHERE id='vendas'").run();
  return actor;
}
async function incoming(id:string,extra:Record<string,unknown>={}){
  await acceptUazapiWebhook(runtime,"vendas",{token:"synthetic-vendas-token",EventType:"messages",message:{id,messageid:id,chatid:"5581999999999@s.whatsapp.net",senderName:"VALIDACAO",text:"Quais são os projetos?",fromMe:false,messageTimestamp:Date.now(),...extra}},"test-request-id");
  const batch=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.batch' AND processed_at IS NULL").first<{external_id:string}>();
  if(batch)await processUazapiBatch(runtime,batch.external_id);
  const event=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.incoming' AND processed_at IS NULL ORDER BY created_at DESC LIMIT 1").first<{external_id:string}>();
  expect(event).not.toBeNull();return event!.external_id;
}
afterEach(()=>vi.restoreAllMocks());
describe("atendentes OpenRouter no Workers",()=>{
  it("prepara rascunho sem UAZAPI/chave, preserva contexto e exige versão correta",async()=>{
    const actor=await setup();
    const saved=await saveLineAgent({...runtime,OPENROUTER_API_KEY:""},"draft",{...config,instanceId:null,enabled:false},actor);
    expect(saved).toMatchObject({version:1,instance_id:null,enabled:0});
    expect(await saveLineAgent(runtime,"draft",{...config,enabled:false,version:1},actor)).toMatchObject({version:2,instance_id:"vendas"});
    await expect(saveLineAgent(runtime,"draft",{...config,enabled:false,version:1},actor)).rejects.toMatchObject({code:"AGENT_CONFIG_CHANGED"});
    await expect(saveLineAgent(runtime,"other",{...config,enabled:false},actor)).rejects.toMatchObject({code:"AGENT_LINE_IN_USE"});
    const serialized=await (await listAgents(request(""))).text();expect(serialized).not.toContain("synthetic");
    expect(await env.DB.prepare("SELECT count(*) AS n FROM audit_log WHERE action='whatsapp.agent.save'").first()).toEqual({n:2});
  });
  it("bloqueia vendedor, origem externa, modelo pago e ativação sem chave",async()=>{
    const actor=await setup();
    const now=new Date().toISOString();
    await env.DB.batch([env.DB.prepare("INSERT INTO users(id,email,name,active,created_at,updated_at) VALUES('vendor','vendor@test.local','Vendor',1,?,?)").bind(now,now),env.DB.prepare("INSERT INTO roles(id,user_id,role,created_at) VALUES('vendor-role','vendor','vendedor',?)").bind(now)]);
    expect((await agentAction(request("a",{action:"save",config},{"x-dev-access-email":"vendor@test.local"}),ctx("a"))).status).toBe(403);
    expect((await agentAction(request("a",{action:"save",config},{origin:"https://evil.test"}),ctx("a"))).status).toBe(403);
    expect((await agentAction(request("a",{action:"save",config:{...config,model:"paid/model"}}),ctx("a"))).status).toBe(422);
    await expect(saveLineAgent({...runtime,OPENROUTER_API_KEY:""},"a",config,actor)).rejects.toMatchObject({code:"OPENROUTER_NOT_CONFIGURED"});
  });
  it("testa atendente sem linha, sem mensagens nem uso de histórico de cliente",async()=>{
    const actor=await setup();
    await saveLineAgent(runtime,"draft",{...config,enabled:false,instanceId:null},actor);
    const fetcher=router();expect(await previewLineAgent(runtime,"draft","Olá",fetcher)).toEqual(answer);
    const chat=fetcher.mock.calls.find(([url])=>String(url).endsWith("/chat/completions"));
    const body=JSON.parse(String(chat?.[1]?.body));
    expect(JSON.parse(body.messages[1].content).verifiedContext).toEqual({test:true,catalog:[],lead:null,summary:null,recentMessages:[]});
    expect(await env.DB.prepare("SELECT count(*) AS n FROM messages").first()).toEqual({n:0});
  });
  it("responde nova mensagem pela linha correta, reutiliza contexto e resume via OpenRouter",async()=>{
    const actor=await setup();await saveLineAgent(runtime,"a",config,actor,router());
    const event=await incoming("NEW-1");
    const fetcher=router();const sender=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{expect(String(url)).toBe("https://vendas.uazapi.test/send/text");expect(JSON.parse(String(init?.body))).toMatchObject({number:"5581999999999",text:answer.reply});return Response.json({messageid:"OUT-1"});});
    expect(await processIncomingWhatsApp(runtime,event,{openrouterFetcher:fetcher,uazapiFetcher:sender},"uazapi")).toMatchObject({answered:true});
    await processIncomingWhatsApp(runtime,event,{openrouterFetcher:fetcher,uazapiFetcher:sender},"uazapi");expect(sender).toHaveBeenCalledTimes(1);
    const conversation=await env.DB.prepare("SELECT id,mode FROM conversations").first<{id:string;mode:string}>();expect(conversation?.mode).toBe("AGENT");
    expect(await processConversationSummary(runtime,conversation!.id,2,router(undefined,{summary:"Contato pediu informações dos projetos."}))).toEqual({summarized:true});
    expect((await env.DB.prepare("SELECT summary FROM conversations").first())?.summary).toContain("projetos");
  });
  it("desativação durante geração impede envio e conserva controle humano",async()=>{
    const actor=await setup();await saveLineAgent(runtime,"a",config,actor,router());
    const event=await incoming("PAUSE-1");const sender=vi.fn();
    const fetcher=router(async()=>{await saveLineAgent(runtime,"a",{...config,enabled:false,version:1},actor);});
    expect(await processIncomingWhatsApp(runtime,event,{openrouterFetcher:fetcher,uazapiFetcher:sender},"uazapi")).toMatchObject({answered:false});
    expect(sender).not.toHaveBeenCalled();expect(await env.DB.prepare("SELECT mode,agent_processing_token FROM conversations").first()).toEqual({mode:"HUMAN",agent_processing_token:null});
    const conversation=await env.DB.prepare("SELECT id FROM conversations").first<{id:string}>();
    expect((await release(request("release",{}),ctx(conversation!.id))).status).toBe(409);
    expect((await getLineAgent(env,"vendas"))?.enabled).toBe(0);
  });
  it("resposta inválida pausa sem envio e próximas mensagens permanecem humanas",async()=>{
    const actor=await setup();await saveLineAgent(runtime,"a",config,actor,router());
    const event=await incoming("INVALID-1");const sender=vi.fn();
    expect(await processIncomingWhatsApp(runtime,event,{openrouterFetcher:router(undefined,{reply:"inválida"}),uazapiFetcher:sender},"uazapi")).toMatchObject({answered:false,handoff:true});expect(sender).not.toHaveBeenCalled();
    const second=await incoming("HUMAN-2");const fetcher=router();await processIncomingWhatsApp(runtime,second,{openrouterFetcher:fetcher,uazapiFetcher:sender},"uazapi");expect(fetcher).not.toHaveBeenCalled();
  });
  it("histórico importado não ativa agente e mensagem do celular pausa a conversa",async()=>{
    const actor=await setup();await saveLineAgent(runtime,"a",config,actor,router());
    await acceptUazapiWebhook(runtime,"vendas",{token:"synthetic-vendas-token",EventType:"history",event:"messages",messages:[{id:"OLD-1",messageid:"OLD-1",chatid:"5581999999999@s.whatsapp.net",text:"Histórico antigo",messageTimestamp:1700000000000}]},"history-request-id");
    const batch=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.batch'").first<{external_id:string}>();await processUazapiBatch(runtime,batch!.external_id);
    const leaf=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.incoming'").first<{external_id:string}>();const fetcher=router();const sender=vi.fn();
    expect(await processIncomingWhatsApp(runtime,leaf!.external_id,{openrouterFetcher:fetcher,uazapiFetcher:sender},"uazapi")).toMatchObject({answered:false});
    expect((await env.DB.prepare("SELECT mode FROM conversations").first())?.mode).toBe("HUMAN");
    await env.DB.prepare("UPDATE conversations SET mode='AGENT',human_active=0").run();
    const phone=await incoming("PHONE-1",{fromMe:true});await processIncomingWhatsApp(runtime,phone,{openrouterFetcher:fetcher,uazapiFetcher:sender},"uazapi");
    expect((await env.DB.prepare("SELECT mode FROM conversations").first())?.mode).toBe("HUMAN");expect(fetcher).not.toHaveBeenCalled();expect(sender).not.toHaveBeenCalled();
  });

});
