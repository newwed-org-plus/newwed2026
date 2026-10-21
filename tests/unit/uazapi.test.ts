import { describe,expect,it } from "vitest";
import { configuredInstances,parseUazapiSession,uazapiMessageId,uazapiRequest,webhookUrl } from "@/server/integrations/uazapi";
import { normalizeUazapiMessage } from "@/server/uazapi-webhook";
import { readJsonWithLimit } from "@/server/request-context";

const instance = {id:"atendimento",name:"Atendimento",baseUrl:"https://example.uazapi.com",token:"synthetic-instance-token"};
describe("contrato UAZAPI",() => {
  it("rejeita configuração ambígua e URLs que poderiam vazar tokens",() => {
    expect(configuredInstances({})).toEqual([]);
    for (const baseUrl of ["http://example.test","https://user:password@example.test","https://example.test/path","https://example.test?token=secret"]) {
      expect(() => configuredInstances({UAZAPI_INSTANCES:JSON.stringify([{...instance,baseUrl}])})).toThrow("configuração");
    }
    expect(() => configuredInstances({UAZAPI_INSTANCES:JSON.stringify([instance,instance])})).toThrow("configuração");
    expect(() => configuredInstances({UAZAPI_INSTANCES:"not-json"})).toThrow("configuração");
  });
  it("devolve somente estado, QR PNG e identidade verificada, sem credenciais",() => {
    const base = {instance:{status:"connecting",qrcode:"data:image/png;base64,aGVsbG8=",token:"secret",openai_apikey:"private-key"}};
    expect(parseUazapiSession(base)).toEqual({state:"connecting",qrCode:"data:image/png;base64,aGVsbG8=",phone:null,profileName:null});
    expect(parseUazapiSession({instance:{...base.instance,qrcode:"https://evil.test/qr"}}).qrCode).toBeNull();
    expect(parseUazapiSession({instance:{...base.instance,status:"connected"},status:{jid:{user:"5581999999999"}}})).toMatchObject({state:"connected",qrCode:null,phone:"5581999999999"});
    expect(() => parseUazapiSession({token:"secret"})).toThrow("estado");
  });
  it("reconhece sessão conectada com JID textual do provider sem expor QR ou token",()=>{
    const instance={status:"connected",qrcode:"data:image/png;base64,c3ludGhldGlj",token:"synthetic-secret",profileName:"VALIDACAO"};
    for(const jid of ["5581999999999@s.whatsapp.net","5581999999999:42@s.whatsapp.net"]){
      expect(parseUazapiSession({instance,status:{connected:true,loggedIn:true,jid}})).toEqual({state:"connected",qrCode:null,phone:"5581999999999",profileName:"VALIDACAO"});
    }
    for(const jid of ["123@lid","5581999999999@g.us","not-a-jid"]){
      expect(parseUazapiSession({instance,status:{jid}})).toMatchObject({state:"connected",qrCode:null,phone:null});
    }
    expect(parseUazapiSession({instance:{...instance,status:"connecting"},status:{jid:"5581999999999@s.whatsapp.net"}}).phone).toBeNull();
  });
  it("mantém o token em header e não repete automaticamente operações",async () => {
    let calls = 0;
    const fetcher = (async (url:RequestInfo|URL,init?:RequestInit) => {
      calls++;
      expect(String(url)).toBe("https://example.uazapi.com/instance/connect");
      expect(init?.headers).toMatchObject({token:instance.token});
      expect(init?.redirect).toBe("manual");
      expect(init?.body).toBe("{}");
      return Response.json({error:instance.token},{status:401});
    }) as typeof fetch;
    await expect(uazapiRequest(instance,"/instance/connect",{},fetcher)).rejects.toMatchObject({code:"UAZAPI_HTTP_401",message:"A credencial da linha foi recusada pela UAZAPI."});
    expect(calls).toBe(1);
  });
  it("não propaga erros de rede ou respostas inválidas do provider",async () => {
    await expect(uazapiRequest(instance,"/instance/status",undefined,(async()=>{throw new Error(instance.token);}) as typeof fetch)).rejects.toMatchObject({code:"UAZAPI_UNAVAILABLE"});
    await expect(uazapiRequest(instance,"/instance/status",undefined,(async()=>new Response("invalid "+instance.token)) as typeof fetch)).rejects.toMatchObject({code:"UAZAPI_INVALID_RESPONSE"});
  });
  it("isola IDs por linha e ignora grupos, LIDs e ecos da API",() => {
    const message = {messageid:"MSG-1",chatid:"5581999999999@s.whatsapp.net",fromMe:false,text:"Olá",messageTimestamp:1_700_000_000_000};
    expect(normalizeUazapiMessage("vendas",message)).toMatchObject({lineId:"vendas",event:{id:"uazapi:vendas:MSG-1",from:"5581999999999",createdAt:"2023-11-14T22:13:20.000Z"}});
    expect(uazapiMessageId("vendas","5581888888888:MSG-1")).toBe("uazapi:vendas:MSG-1");
    expect(normalizeUazapiMessage("vendas",{...message,isGroup:true})).toBeNull();
    expect(normalizeUazapiMessage("vendas",{...message,chatid:"123@lid"})).toBeNull();
    expect(normalizeUazapiMessage("vendas",{...message,wasSentByApi:true})).toBeNull();
  });
  it("monta callback público sem credencial na URL",() => {
    expect(webhookUrl({UAZAPI_WEBHOOK_BASE_URL:"https://newwed.test"},"vendas")).toBe("https://newwed.test/api/webhooks/uazapi/vendas");
    expect(()=>webhookUrl({},"vendas")).toThrow("público");
  });
  it("limita corpos transmitidos sem Content-Length",async () => {
    const request = new Request("https://newwed.test",{method:"POST",body:'{"payload":"'+"x".repeat(4096)+'"}'});
    await expect(readJsonWithLimit(request,1024)).rejects.toMatchObject({status:413});
  });
  it("recusa redirecionamento sem seguir para outro servidor",async()=>{
    let calls=0;
    await expect(uazapiRequest(instance,"/instance/status",undefined,async()=>{calls++;return new Response(null,{status:302,headers:{location:"https://outside.test"}});})).rejects.toMatchObject({code:"UAZAPI_HTTP_302"});
    expect(calls).toBe(1);
  });

  it("permite recebimento antes da URL sem inventar host nem transmitir token",async()=>{
    const config={id:instance.id,name:instance.name,token:instance.token};
    expect(configuredInstances({UAZAPI_INSTANCES:JSON.stringify([config])})).toEqual([config]);
    let called=false;
    await expect(uazapiRequest(config,"/instance/status",undefined,async()=>{called=true;return Response.json({});})).rejects.toMatchObject({code:"UAZAPI_SERVER_NOT_CONFIGURED"});
    expect(called).toBe(false);
  });

});
