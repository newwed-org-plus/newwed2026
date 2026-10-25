import {execFileSync} from "node:child_process";
import {expect,test,type Cookie} from "@playwright/test";
const origin=process.env.VISUAL_BASE_URL??'http://localhost:4173';let cookies:Cookie[]=[];
test.beforeAll(async({browser})=>{
 if(process.env.VISUAL_BASE_URL)return;
 execFileSync('npx',['wrangler','d1','migrations','apply','new-wed-platform-development','--local'],{stdio:'pipe'});
 execFileSync('npx',['tsx','scripts/provision-admin.ts','inbox-ui@example.test','--local'],{input:'Synthetic-inbox-test!',stdio:'pipe'});
 const context=await browser.newContext({extraHTTPHeaders:{'cf-connecting-ip':`192.0.2.${process.pid%240+1}`}});
 try {const page=await context.newPage();await page.goto(`${origin}/admin/login`);await page.getByLabel('E-mail',{exact:true}).fill('inbox-ui@example.test');await page.getByLabel('Senha',{exact:true}).fill('Synthetic-inbox-test!');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(`${origin}/admin`);cookies=await context.cookies();} finally {await context.close();}
});
test.beforeEach(async({context})=>{test.skip(Boolean(process.env.VISUAL_BASE_URL),'Somente fixtures locais.');await context.addCookies(cookies);});
test.afterAll(()=>{
 if(process.env.VISUAL_BASE_URL)return;
 const identity="SELECT id FROM users WHERE email='inbox-ui@example.test'";
 execFileSync('npx',['wrangler','d1','execute','new-wed-platform-development','--local','--command',`DELETE FROM admin_sessions WHERE user_id IN (${identity}); DELETE FROM admin_credentials WHERE user_id IN (${identity}); DELETE FROM roles WHERE user_id IN (${identity}); DELETE FROM users WHERE email='inbox-ui@example.test';`],{stdio:'pipe'});
});
const item=(i:number)=>({whatsapp_instance_id:'validacao',id:`c${i}`,external_id:`contact-${i}`,contact_name:`VALIDACAO Contato ${i}`,mode:'HUMAN',claimed_by:null,updated_at:'2026-10-25T12:00:00.000Z'});
const message=(i:number)=>({id:`m${String(i).padStart(3,'0')}`,direction:'IN',type:'text',body:`VALIDACAO mensagem ${i}`,status:'RECEIVED',created_at:'2026-10-25T12:00:00.000Z'});
for(const [name,width,height] of [['mobile',390,844],['desktop',1440,900]] as const)test(`${name} · pagina conversas e preserva mensagens antigas ao atualizar`,async({page})=>{
 await page.setViewportSize({width,height});
 await page.route('**/api/admin/conversations**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/c0'))return route.fulfill({json:{conversation:item(0),messages:url.searchParams.has('before')?[message(0),message(1)]:Array.from({length:100},(_,i)=>message(i+2)),nextCursor:url.searchParams.has('before')?null:'older-messages'}});
  return route.fulfill({json:{items:url.searchParams.has('cursor')?[item(50)]:Array.from({length:50},(_,i)=>item(i)),nextCursor:url.searchParams.has('cursor')?null:'older-list'}});
 });
 await page.goto(`${origin}/admin`);await page.getByRole('button',{name:'Inbox',exact:true}).click();await expect(page.getByText(/Ambiente local/)).toBeVisible();
 await page.getByRole('button',{name:'Carregar mais conversas'}).click();await expect(page.getByText('VALIDACAO Contato 50',{exact:true})).toHaveCount(1);await page.getByText('VALIDACAO Contato 50',{exact:true}).scrollIntoViewIfNeeded();
 await page.getByRole('button').filter({has:page.getByText('VALIDACAO Contato 0',{exact:true})}).click();
 await page.getByRole('button',{name:'Carregar mensagens anteriores'}).click();await expect(page.getByText('VALIDACAO mensagem 0',{exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Atualizar inbox',exact:true}).click();await expect(page.getByText('VALIDACAO mensagem 0',{exact:true})).toHaveCount(1);await expect(page.getByText('VALIDACAO mensagem 101',{exact:true})).toHaveCount(1);
 await page.screenshot({path:`test-results/inbox-pagination-${name}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('mostra falha antes da seleção e permite tentar novamente',async({page})=>{
 let failed=true;await page.route('**/api/admin/conversations**',route=>route.fulfill(failed?{status:503,json:{message:'Serviço temporariamente indisponível.'}}:{json:{items:[],nextCursor:null}}));
 await page.goto(`${origin}/admin`);await page.getByRole('button',{name:'Inbox',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Serviço temporariamente indisponível.');
 failed=false;await page.getByRole('button',{name:'Tentar novamente'}).click();await expect(page.getByText('Nenhuma conversa encontrada neste ambiente.')).toBeVisible();
});
test('descarta a resposta da busca anterior quando o filtro muda',async({page})=>{
 let release:()=>void=()=>{};let oldStarted=false;const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/admin/conversations**',async route=>{
  const q=new URL(route.request().url()).searchParams.get('q');
  if(q==='antigo'){oldStarted=true;await held;await route.fulfill({json:{items:[{...item(1),contact_name:'RESULTADO ANTIGO'}],nextCursor:null}}).catch(()=>{});return;}
  return route.fulfill({json:{items:q==='novo'?[{...item(2),contact_name:'RESULTADO NOVO'}]:[],nextCursor:null}});
 });
 await page.goto(`${origin}/admin`);await page.getByRole('button',{name:'Inbox',exact:true}).click();
 await page.getByPlaceholder('Buscar conversa',{exact:true}).fill('antigo');await expect.poll(()=>oldStarted).toBe(true);
 await page.getByPlaceholder('Buscar conversa',{exact:true}).fill('novo');await expect(page.getByText('RESULTADO NOVO',{exact:true})).toBeVisible();release();
 await expect(page.getByText('RESULTADO ANTIGO',{exact:true})).toHaveCount(0);
});


test('estado atualiza em páginas antigas sem apagar mensagens e diferencia envio de entrega',async({page})=>{
 await page.route('**/api/admin/conversations**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/c0')){
   const old={...message(0),direction:'OUT',status:'ACCEPTED'};
   return route.fulfill({json:{conversation:item(0),messages:url.searchParams.has('before')?[old]:Array.from({length:100},(_,i)=>message(i+1)),messageStates:url.searchParams.has('statusIds')?[{id:old.id,status:'DELIVERED'}]:[],nextCursor:url.searchParams.has('before')?null:'older'}});
  }
  return route.fulfill({json:{items:[item(0)],nextCursor:null}});
 });
 await page.goto(`${origin}/admin`);await page.getByRole('button',{name:'Inbox',exact:true}).click();await page.getByText('VALIDACAO Contato 0',{exact:true}).click();
 await page.getByRole('button',{name:'Carregar mensagens anteriores'}).click();await expect(page.getByText('Aceita para envio',{exact:true})).toBeVisible();await expect(page.getByText('O provedor aceitou a mensagem. A entrega ainda não foi confirmada.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Atualizar inbox',exact:true}).click();await expect(page.getByText('Entregue',{exact:true})).toBeVisible();await expect(page.getByText('VALIDACAO mensagem 0',{exact:true})).toBeVisible();
});

test('consulta de entrega atualiza a mensagem sem reenviar e recupera falha local',async({page})=>{
 let state='SENT';let checks=0;let sends=0;let transient=true;
 await page.route('**/api/admin/conversations**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/sync-status')){checks++;state='READ';return route.fulfill({json:{checked:1,updated:1,unavailable:0}});}
  if(route.request().method()!=='GET'){sends++;return route.fulfill({status:400,json:{message:'Envio inesperado'}});}
  if(url.pathname.endsWith('/c0')){
   if(transient){transient=false;return route.fulfill({status:503,json:{code:'LOCAL_RUNTIME_UNAVAILABLE',message:'Ambiente local reiniciando.'}});}
   return route.fulfill({json:{conversation:item(0),messages:[{...message(0),direction:'OUT',status:state}],nextCursor:null}});
  }
  return route.fulfill({json:{items:[item(0)],nextCursor:null}});
 });
 await page.goto(`${origin}/admin`);await page.getByRole('button',{name:'Inbox',exact:true}).click();await page.getByText('VALIDACAO Contato 0',{exact:true}).click();
 await expect(page.getByText('Enviada',{exact:true})).toBeVisible();await expect(page.getByText('Enviada pelo WhatsApp. A entrega ao destinatário ainda não foi confirmada.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Conferir entrega',exact:true}).click();await expect(page.getByText('Lida',{exact:true})).toBeVisible();expect(checks).toBe(1);expect(sends).toBe(0);await expect(page.locator('vite-error-overlay')).toHaveCount(0);
 await page.screenshot({path:'test-results/inbox-delivery-synthetic.png',fullPage:true});
});
