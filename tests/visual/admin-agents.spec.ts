import {execFileSync} from "node:child_process";
import {expect,test,type Cookie} from "@playwright/test";
import type {WhatsAppAgent} from "../../src/features/conversations/agent-config";
const origin=(process.env.VISUAL_BASE_URL??"http://localhost:4173").replace(/\/$/,"");
let cookies:Cookie[]=[];
test.beforeAll(async({browser})=>{
  if(process.env.VISUAL_BASE_URL)return;
  execFileSync("npx",["wrangler","d1","migrations","apply","new-wed-platform-development","--local"],{stdio:"pipe"});
  execFileSync("npx",["tsx","scripts/provision-admin.ts","agents-ui@example.test","--local"],{input:"Synthetic-agents-test!",stdio:["pipe","pipe","pipe"]});
  execFileSync("npx",["wrangler","d1","execute","new-wed-platform-development","--local","--command","DELETE FROM rate_limit_buckets WHERE scope='admin-login-ip'"],{stdio:"pipe"});
  const context=await browser.newContext();
  try{const page=await context.newPage();await page.goto(`${origin}/admin/login`);await page.getByLabel("E-mail",{exact:true}).fill("agents-ui@example.test");await page.getByLabel("Senha",{exact:true}).fill("Synthetic-agents-test!");await page.getByRole("button",{name:"Entrar",exact:true}).click();await expect(page).toHaveURL(`${origin}/admin`);cookies=await context.cookies();}
  finally{await context.close();}
});
test.beforeEach(async({context})=>{await context.addCookies(cookies);});
test.afterAll(()=>{
  if(process.env.VISUAL_BASE_URL)return;
  const identity="SELECT id FROM users WHERE email='agents-ui@example.test'";
  execFileSync("npx",["wrangler","d1","execute","new-wed-platform-development","--local","--command",`DELETE FROM admin_sessions WHERE user_id IN (${identity}); DELETE FROM admin_credentials WHERE user_id IN (${identity}); DELETE FROM roles WHERE user_id IN (${identity}); DELETE FROM users WHERE email='agents-ui@example.test';`],{stdio:"pipe"});cookies=[];
});
for(const [name,width,height] of [["mobile",390,844],["tablet",768,1024],["desktop",1440,900]] as const){
  test(`${name} · prepara atendente sem linha, salva contexto, testa e pausa`,async({page})=>{
    test.skip(Boolean(process.env.VISUAL_BASE_URL),"Somente dados sintéticos locais.");
    await page.setViewportSize({width,height});
    let agent:WhatsAppAgent|null=null;let previews=0;
    await page.route("**/api/admin/agents**",async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path.endsWith("/models"))return route.fulfill({json:{items:[{id:"openrouter/free",name:"Roteador gratuito"},{id:"test/attendant:free",name:"VALIDACAO Modelo gratuito"}]}});
      if(route.request().method()==="GET")return route.fulfill({json:{configured:true,lines:[{id:"vendas",name:"VALIDACAO WhatsApp",state:"connected",phone:"5581999999999"}],items:agent?[agent]:[]}});
      const input=route.request().postDataJSON();
      if(input.action==="preview"){previews++;return route.fulfill({json:{result:{reply:"Olá! Posso ajudar com informações dos projetos da New Wed.",confidence:0.9,handoff:false,reason:"Contexto disponível"}}});}
      const config=input.config;agent={id:path.split("/").at(-1)!,instance_id:config.instanceId,...config,enabled:config.enabled?1:0,version:config.version+1,updated_at:new Date().toISOString()};return route.fulfill({json:{agent}});
    });
    await page.goto(`${origin}/admin`);await page.getByRole("button",{name:"Atendentes",exact:true}).click();await expect(page.getByRole("heading",{name:"Atendentes virtuais"})).toBeVisible();
    await page.getByRole("button",{name:"Novo atendente",exact:true}).click();await page.getByLabel("Nome do atendente",{exact:true}).fill("VALIDACAO Consultora New Wed");
    await page.getByLabel("Modelo gratuito",{exact:true}).selectOption("test/attendant:free");await page.getByLabel("Contexto e orientações",{exact:true}).fill("Apresente os projetos da New Wed com clareza e cordialidade. Nunca invente informações. Faça uma pergunta de cada vez.");
    await expect(page.getByRole("button",{name:"Testar resposta",exact:true})).toBeDisabled();await page.getByRole("button",{name:"Salvar atendente",exact:true}).click();
    await expect(page.getByText("Configuração salva · Pausado")).toBeVisible();await page.getByRole("button",{name:"Testar resposta",exact:true}).click();await expect(page.getByText("Olá! Posso ajudar com informações dos projetos da New Wed.")).toBeVisible();expect(previews).toBe(1);
    await page.getByLabel("Linha de WhatsApp",{exact:true}).selectOption("vendas");await page.getByLabel("Atender novos contatos automaticamente").check();await page.getByRole("button",{name:"Salvar atendente",exact:true}).click();await expect(page.getByText("Configuração salva · Ativo")).toBeVisible();
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`test-results/agents-synthetic-${name}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.getByLabel("Atender novos contatos automaticamente").uncheck();await page.getByRole("button",{name:"Salvar atendente",exact:true}).click();await expect(page.getByText("Configuração salva · Pausado")).toBeVisible();
    await page.reload();await page.getByRole("button",{name:"Atendentes",exact:true}).click();await expect(page.getByLabel("Nome do atendente",{exact:true})).toHaveValue("VALIDACAO Consultora New Wed");
  });
}
test("atendentes mostra chave pendente e indisponibilidade do catálogo",async({page})=>{
  test.skip(Boolean(process.env.VISUAL_BASE_URL),"Somente ambiente local.");
  await page.route("**/api/admin/agents**",route=>route.fulfill(route.request().url().endsWith("/models")?{status:502,json:{message:"Catálogo temporariamente indisponível."}}:{json:{configured:false,lines:[],items:[]}}));
  await page.goto(`${origin}/admin`);await page.getByRole("button",{name:"Atendentes",exact:true}).click();await expect(page.getByText(/OpenRouter ainda não conectado/)).toBeVisible();await page.getByRole("button",{name:"Novo atendente",exact:true}).click();await expect(page.getByRole("alert")).toHaveText("Catálogo temporariamente indisponível.");await expect(page.getByRole("button",{name:"Testar resposta",exact:true})).toBeDisabled();
});
