import {execFileSync} from "node:child_process";
import {expect,test,type Cookie} from "@playwright/test";
const origin=process.env.VISUAL_BASE_URL??'http://localhost:4173';let cookies:Cookie[]=[];
test.beforeAll(async({browser})=>{
 if(process.env.VISUAL_BASE_URL)return;
 execFileSync('npx',['wrangler','d1','migrations','apply','new-wed-platform-development','--local'],{stdio:'pipe'});
 execFileSync('npx',['tsx','scripts/provision-admin.ts','operations-ui@example.test','--local'],{input:'Synthetic-operations-test!',stdio:'pipe'});
 const context=await browser.newContext({extraHTTPHeaders:{'cf-connecting-ip':`192.0.2.${process.pid%240+1}`}});
 try {const page=await context.newPage();await page.goto(`${origin}/admin/login`);await page.getByLabel('E-mail',{exact:true}).fill('operations-ui@example.test');await page.getByLabel('Senha',{exact:true}).fill('Synthetic-operations-test!');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(`${origin}/admin`);cookies=await context.cookies();} finally {await context.close();}
});
test.beforeEach(async({context})=>{test.skip(Boolean(process.env.VISUAL_BASE_URL),'Somente fixtures locais.');await context.addCookies(cookies);});
test.afterAll(()=>{
 if(process.env.VISUAL_BASE_URL)return;
 const identity="SELECT id FROM users WHERE email='operations-ui@example.test'";
 execFileSync('npx',['wrangler','d1','execute','new-wed-platform-development','--local','--command',`DELETE FROM admin_sessions WHERE user_id IN (${identity}); DELETE FROM admin_credentials WHERE user_id IN (${identity}); DELETE FROM roles WHERE user_id IN (${identity}); DELETE FROM users WHERE email='operations-ui@example.test';`],{stdio:'pipe'});
});

for(const [name,width,height] of [["mobile",390,844],["tablet",768,1024],["desktop",1440,900]] as const)test(`${name} · operação mostra totais e revisa apenas uma saída retida`,async({page})=>{
 await page.setViewportSize({width,height});let released=0;
 await page.route('**/api/admin/reports/funnel**',route=>route.fulfill({json:{stages:[],origins:[],editions:[],assignees:[],checkouts:[],payments:[]}}));
 await page.route('**/api/admin/operations/**',route=>{
  if(route.request().method()==='POST'){released++;return route.fulfill({status:202,json:{queued:true}});}
  return route.fulfill({json:{items:[],counts:{pending:75,inboundPending:4,held:released?0:1,finalFailures:0,historyImports:1,historicalMessages:100,uncertainMessages:0,uncertainEmail:0,oldestPendingAt:'2026-10-25T10:00:00.000Z'},health:[{service:'receiver',stalled_runs:3,failure_streak:0,last_success_at:null,last_completed_at:new Date().toISOString()}],usage:[],retained:released?[]:[{id:'synthetic-held',type:'conversation.manual.send',hold_reason:'PRE_ACTIVATION_REVIEW',entity_id:'synthetic',created_at:new Date().toISOString()}],finalFailures:[],asOf:new Date().toISOString()}});
 });
 await page.goto(`${origin}/admin`);await page.getByRole('button',{name:'Relatórios',exact:true}).click();
 await expect(page.getByRole('region',{name:'Saúde da operação'})).toContainText('75');await expect(page.getByText(/Três execuções sem progresso/)).toBeVisible();await expect(page.getByText(/Medição de cota indisponível/)).toBeVisible();
 page.once('dialog',dialog=>dialog.accept('VALIDACAO operação revisada individualmente'));
 await page.getByRole('button',{name:'Revisar e liberar esta operação'}).click();await expect(page.getByRole('status')).toContainText('Revisão individual');expect(released).toBe(1);
 await page.screenshot({path:`test-results/operations-${name}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
for(const [name,width,height] of [["mobile",390,844],["desktop",1440,900]] as const)test(`${name} · checkout exige a escolha da conversa UAZAPI`,async({page})=>{
 await page.setViewportSize({width,height});const lead={id:'synthetic-lead',name:'VALIDACAO checkout',email:'demo@example.invalid',phone:'81000000001',stage:'QUALIFICADO',edition_id:'e',edition_name:'VALIDACAO edição'};let sent:Record<string,unknown>|undefined;
 let releaseCatalog:()=>void=()=>{};const catalogReady=new Promise<void>(resolve=>{releaseCatalog=resolve;});
 await page.route('**/api/admin/users',route=>route.fulfill({status:503,json:{message:'VALIDACAO lista de responsáveis indisponível.'}}));
 await page.route('**/api/catalog/editions',async route=>{await catalogReady;return route.fulfill({json:{editions:[{id:'e',name:'VALIDACAO edição',price_batch_id:'b',installment_count:3,amount_cents:120000}]}});});
 await page.route('**/api/admin/leads**',route=>{
  const url=new URL(route.request().url());if(route.request().method()==='POST'){sent=route.request().postDataJSON();return route.fulfill({status:202,json:{checkoutId:'synthetic-checkout',status:'CREATING'}});}
  if(url.pathname.endsWith('/synthetic-lead'))return route.fulfill({json:{lead,answers:[],history:[],activities:[],checkouts:[],conversations:[{id:'c1',whatsapp_instance_id:'linha-a',contact_name:'VALIDACAO linha A'},{id:'c2',whatsapp_instance_id:'linha-b',contact_name:'VALIDACAO linha B'}]}});
  return route.fulfill({json:{items:[lead]}});
 });
 await page.goto(`${origin}/admin`);await page.getByRole('button').filter({has:page.getByText('VALIDACAO checkout',{exact:true})}).click();
 const create=page.getByRole('button',{name:'Criar checkout',exact:true});await expect(create).toBeDisabled();
 await page.getByLabel('Conversa para o checkout',{exact:true}).selectOption('c2');await expect(create).toBeDisabled();await expect(page.getByText('Carregando oferta da edição…')).toBeVisible();
 releaseCatalog();await expect(create).toBeEnabled();await create.click();
 await expect.poll(()=>sent?.conversationId).toBe('c2');await expect(page.getByText(/reservado e em processamento/)).toBeVisible();
 await page.screenshot({path:`test-results/checkout-${name}.png`,fullPage:true});
});
