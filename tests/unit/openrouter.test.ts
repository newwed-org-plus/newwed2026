import { describe,expect,it,vi } from "vitest";
import { answerWithOpenRouter,listFreeModels } from "@/server/integrations/openrouter";
import { agentConfigSchema } from "@/features/conversations/agent-config";
const model={id:"test/attendant:free",name:"Atendente",pricing:{prompt:"0",completion:"0",request:"0"},supported_parameters:["response_format"],architecture:{input_modalities:["text"],output_modalities:["text"]}};
const input={name:"New Wed",instructions:"Ajude com informações verificadas.",model:model.id,message:"Olá",context:{summary:"Resumo existente",recentMessages:[{body:"Histórico"}]}};
const reply={reply:"Olá! Como posso ajudar?",confidence:0.9,handoff:false,reason:""};
function mock(result:unknown=reply,status=200){
  return vi.fn(async(url:RequestInfo|URL,_init?:RequestInit)=>String(url).endsWith("/models")?Response.json({data:[model]}):Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(result)}}]}, {status}));
}
describe("OpenRouter gratuito",()=>{
  it("filtra modelos pagos, custos por requisição e modalidades incompatíveis",async()=>{
    const models=await listFreeModels(async()=>Response.json({data:[model,{...model,id:"paid/model",pricing:{prompt:"1",completion:"1"}},{...model,id:"test/fee:free",pricing:{prompt:"0",completion:"0",request:"0.1"}},{...model,id:"test/audio:free",architecture:{input_modalities:["audio"],output_modalities:["text"]}}]}));
    expect(models).toEqual([{id:model.id,name:model.name}]);
    expect(agentConfigSchema.safeParse({name:"Teste",instructions:"Uma instrução suficientemente longa",model:"paid/model",enabled:false,version:0,instanceId:null}).success).toBe(false);
  });
  it("envia contexto e limita preço a zero sem fallback pago",async()=>{
    const fetcher=mock();
    expect(await answerWithOpenRouter({OPENROUTER_API_KEY:"synthetic-key"},input,fetcher)).toMatchObject(reply);
    const call=fetcher.mock.calls.find(([url])=>String(url).endsWith("/chat/completions"));
    const body=JSON.parse(String(call?.[1]?.body));
    expect(body.provider).toEqual({max_price:{prompt:0,completion:0,request:0},allow_fallbacks:false,require_parameters:true});
    expect(body.response_format).toEqual({type:"json_object"});
    expect(call?.[1]?.redirect).toBe("manual");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain(input.instructions);
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toContain("Resumo existente");
    expect(body.messages[1].content).toContain("Histórico");
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("plugins");
  });
  it("não chama o provider sem chave ou com modelo que deixou de ser gratuito",async()=>{
    const fetcher=mock();
    await expect(answerWithOpenRouter({},input,fetcher)).rejects.toMatchObject({code:"OPENROUTER_NOT_CONFIGURED"});
    expect(fetcher).not.toHaveBeenCalled();
    const paid=vi.fn(async()=>Response.json({data:[{...model,pricing:{prompt:"1",completion:"1"}}]}));
    await expect(answerWithOpenRouter({OPENROUTER_API_KEY:"synthetic"},input,paid)).rejects.toMatchObject({code:"FREE_MODEL_UNAVAILABLE"});
    expect(paid).toHaveBeenCalledTimes(1);
  });
  it("valida JSON e pausa por baixa confiança",async()=>{
    expect(await answerWithOpenRouter({OPENROUTER_API_KEY:"synthetic"},input,mock({...reply,confidence:0.4}))).toMatchObject({handoff:true,reason:"Baixa confiança"});
    await expect(answerWithOpenRouter({OPENROUTER_API_KEY:"synthetic"},input,mock({reply:"sem campos"}))).rejects.toMatchObject({code:"OPENROUTER_INVALID_REPLY"});
  });
  it("sanitiza falhas e não repete chamadas com cota esgotada",async()=>{
    const fetcher=mock({secret:"must-not-leak"},429);
    await expect(answerWithOpenRouter({OPENROUTER_API_KEY:"synthetic"},input,fetcher)).rejects.toMatchObject({code:"OPENROUTER_HTTP_429"});
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(answerWithOpenRouter({OPENROUTER_API_KEY:"synthetic"},input,async()=>{throw new Error("secret-url");})).rejects.toMatchObject({code:"OPENROUTER_UNAVAILABLE"});
  });
  it("recusa redirecionamento sem encaminhar a credencial",async()=>{
    const fetcher=vi.fn(async()=>new Response(null,{status:302,headers:{location:"https://outside.test"}}));
    await expect(listFreeModels(fetcher)).rejects.toMatchObject({code:"OPENROUTER_HTTP_302"});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

});
