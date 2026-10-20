import { PNG } from "pngjs";
import { execFileSync } from "node:child_process";
import { expect,test,type Page,type Cookie } from "@playwright/test";

const origin = (process.env.VISUAL_BASE_URL ?? "http://localhost:4173").replace(/\/$/,"");
// A deterministic PNG test pattern; never an authentication credential.
const qrFixture = new PNG({width:41,height:41});
for (let y=0;y<41;y++) for (let x=0;x<41;x++) {
  const px=x-4,py=y-4;
  let black=px>=0 && py>=0 && px<33 && py<33 && (px*py+px+py)%3===0;
  for (const [ox,oy] of [[0,0],[26,0],[0,26]]) {
    const dx=px-ox,dy=py-oy;
    if(dx>=0 && dy>=0 && dx<7 && dy<7) black=dx===0 || dy===0 || dx===6 || dy===6 || (dx>=2 && dx<=4 && dy>=2 && dy<=4);
  }
  const offset=(y*41+x)*4;
  qrFixture.data[offset]=qrFixture.data[offset+1]=qrFixture.data[offset+2]=black ? 0 : 255;
  qrFixture.data[offset+3]=255;
}
const syntheticQr=`data:image/png;base64,${PNG.sync.write(qrFixture).toString("base64")}`;
let cookies:Cookie[] = [];
test.beforeAll(async({browser})=>{
  if (process.env.VISUAL_BASE_URL) return;
  execFileSync("npx",["wrangler","d1","migrations","apply","new-wed-platform-development","--local"],{stdio:"pipe"});
  execFileSync("npx",["tsx","scripts/provision-admin.ts","whatsapp-ui@example.test","--local"],{input:"Synthetic-whatsapp-test!",stdio:["pipe","pipe","pipe"]});
  // Only the local fixture is reset; production throttling is covered by Workers tests.
  execFileSync("npx",["wrangler","d1","execute","new-wed-platform-development","--local","--command","DELETE FROM rate_limit_buckets WHERE scope='admin-login-ip'"],{stdio:"pipe"});
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await authenticate(page);
    cookies = await context.cookies();
  } finally { await context.close(); }
});
test.afterAll(()=>{
  if (process.env.VISUAL_BASE_URL) return;
  const identity="SELECT id FROM users WHERE email='whatsapp-ui@example.test'";
  execFileSync("npx",["wrangler","d1","execute","new-wed-platform-development","--local","--command",`DELETE FROM admin_sessions WHERE user_id IN (${identity}); DELETE FROM admin_credentials WHERE user_id IN (${identity}); DELETE FROM roles WHERE user_id IN (${identity}); DELETE FROM users WHERE email='whatsapp-ui@example.test';`],{stdio:"pipe"});
  cookies=[];
});
test.beforeEach(async({context})=>{ await context.addCookies(cookies); });
async function authenticate(page:Page) {
  await page.goto(`${origin}/admin/login`);
  await page.getByLabel("E-mail",{exact:true}).fill("whatsapp-ui@example.test");
  await page.getByLabel("Senha",{exact:true}).fill("Synthetic-whatsapp-test!");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await expect(page).toHaveURL(`${origin}/admin`);
}
for (const [name,width,height] of [["mobile",390,844],["tablet",768,1024],["desktop",1440,900]] as const) {
  test(`${name} · conexão WhatsApp, QR, confirmação e desconexão preservam a Inbox`,async({page})=>{
    test.skip(Boolean(process.env.VISUAL_BASE_URL),"Credencial e provider simulados somente em ambiente local.");
    await page.setViewportSize({width,height});
    let state = "disconnected";
    const actions:string[] = [];
    await page.route("**/api/admin/whatsapp**",async route=>{
      if (route.request().method()==="GET") return route.fulfill({json:{items:[{id:"validacao",name:"VALIDACAO Atendimento",state,phone:null,last_error:null,updated_at:new Date().toISOString()}]}});
      const {action} = route.request().postDataJSON();actions.push(action);
      if(action==="connect" && state!=="connected")state="connecting";
      if(action==="disconnect")state="disconnected";
      return route.fulfill({json:{id:"validacao",state,name:"VALIDACAO Atendimento",qrCode:state==="connecting" ? syntheticQr : null,phone:state==="connected" ? "5581999999999" : null,profileName:"VALIDACAO",updatedAt:new Date().toISOString()}});
    });
    await page.goto(`${origin}/admin`);
    await page.getByRole("button",{name:"WhatsApp",exact:true}).click();
    await expect(page.getByRole("heading",{name:"WhatsApp",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Gerar QR Code",exact:true}).click();
    await expect(page.getByRole("img",{name:"QR Code para conectar o WhatsApp"})).toBeVisible();
    await expect(page.getByRole("button",{name:"Gerar QR Code",exact:true})).toHaveCount(0);
    expect(await page.getByRole("img",{name:"QR Code para conectar o WhatsApp"}).evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(41);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`test-results/whatsapp-qr-synthetic-${name}.png`,fullPage:true});
    state="connected";
    await page.getByRole("button",{name:"Atualizar estado",exact:true}).click();
    await expect(page.getByRole("img",{name:"QR Code para conectar o WhatsApp"})).toHaveCount(0);
    await expect(page.getByText("+5581999999999 · VALIDACAO")).toBeVisible();
    expect(actions.filter(action=>action==="connect")).toHaveLength(1);
    await page.getByRole("button",{name:"Ativar recebimento",exact:true}).click();
    await expect(page.getByText("+5581999999999 · VALIDACAO")).toBeVisible();
    await page.getByRole("button",{name:"Desconectar",exact:true}).click();
    expect(actions).not.toContain("disconnect");
    await page.getByRole("button",{name:"Confirmar desconexão",exact:true}).click();
    await expect(page.getByRole("button",{name:"Gerar QR Code",exact:true})).toBeVisible();
    expect(actions.filter(action=>action==="connect")).toHaveLength(2);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.getByRole("button",{name:"Inbox",exact:true}).click();
    await expect(page.getByPlaceholder("Buscar conversa")).toBeVisible();
  });
}
test("WhatsApp mostra configuração pendente e falha de carregamento",async({page})=>{
  test.skip(Boolean(process.env.VISUAL_BASE_URL),"Validação somente local.");
  let fail=false;
  await page.route("**/api/admin/whatsapp",route=>route.fulfill(fail ? {status:503,json:{message:"Configuração indisponível."}} : {json:{items:[]}}));
  await page.goto(`${origin}/admin`);
  await page.getByRole("button",{name:"WhatsApp",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Nenhuma linha configurada"})).toBeVisible();
  fail=true;
  await page.getByRole("button",{name:"Atualizar linhas",exact:true}).click();
  await expect(page.getByRole("alert")).toHaveText("Configuração indisponível.");
});

test("linha somente de recebimento não consulta provider nem oferece QR ativo",async({page})=>{
  test.skip(Boolean(process.env.VISUAL_BASE_URL),"Validação somente local.");
  let operations=0;
  await page.route("**/api/admin/whatsapp**",route=>{
    if(route.request().method()!=="GET"){operations++;return route.fulfill({status:503,json:{message:"URL do servidor pendente."}});}
    return route.fulfill({json:{items:[{id:"atendimento",name:"Atendimento",state:"disconnected",phone:null,serverConfigured:false}]}});
  });
  await page.goto(`${origin}/admin`);await page.getByRole("button",{name:"WhatsApp",exact:true}).click();
  await expect(page.getByRole("status")).toHaveText("Somente recebimento");
  await expect(page.getByRole("button",{name:"Gerar QR Code",exact:true})).toBeDisabled();
  await expect(page.getByRole("button",{name:"Atualizar estado",exact:true})).toBeDisabled();
  await expect(page.getByText(/Recebimento preparado\. Informe a URL/)).toBeVisible();
  expect(operations).toBe(0);
});
