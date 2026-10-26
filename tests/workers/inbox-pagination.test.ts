import {env} from "cloudflare:workers";
import {describe,expect,it} from "vitest";
import {GET as list} from "../../app/api/admin/conversations/route";
import {GET as detail} from "../../app/api/admin/conversations/[id]/route";
const timestamp='2026-10-25T12:00:00.000Z';
const request=(query='')=>new Request(`https://newwed.test/api/admin/conversations${query}`);
type Page={items:Array<{id:string}>;nextCursor:string|null};
type Messages={messages:Array<{id:string}>;nextCursor:string|null};
async function seed() {
 await env.DB.batch(Array.from({length:61},(_,i)=>env.DB.prepare("INSERT INTO conversations (id,channel,external_id,mode,created_at,updated_at) VALUES (?,'whatsapp',?,'HUMAN',?,?)").bind(`c${String(i).padStart(3,'0')}`,`contact-${i}`,timestamp,timestamp)));
 await env.DB.batch(Array.from({length:121},(_,i)=>env.DB.prepare("INSERT INTO messages (id,conversation_id,direction,type,body,status,created_at) VALUES (?,'c060','IN','text','VALIDACAO','RECEIVED',?)").bind(`m${String(i).padStart(3,'0')}`,timestamp)));
}
describe('paginação com timestamps iguais',()=>{
 it('percorre mais de 50 conversas e 100 mensagens sem lacunas',async()=>{
  await seed();
  const first=await(await list(request())).json() as Page;expect(first.items).toHaveLength(50);
  const second=await(await list(request(`?cursor=${first.nextCursor}`))).json() as Page;
  expect(second.items).toHaveLength(11);expect(new Set([...first.items,...second.items].map(item=>item.id)).size).toBe(61);expect(second.nextCursor).toBeNull();
  const context={params:Promise.resolve({id:'c060'})};
  const recent=await(await detail(request('/c060'),context)).json() as Messages;expect(recent.messages).toHaveLength(100);
  const old=await(await detail(request(`/c060?before=${recent.nextCursor}`),context)).json() as Messages;
  expect(old.messages).toHaveLength(21);expect(new Set([...old.messages,...recent.messages].map(item=>item.id)).size).toBe(121);
  expect(old.messages[0].id).toBe('m000');expect(recent.messages.at(-1)?.id).toBe('m120');
 });
 it('aceita cursor legado e rejeita cursor inválido ou de outra conversa',async()=>{
  await seed();expect((await list(request(`?cursor=${timestamp}`))).status).toBe(200);
  expect((await list(request('?cursor=invalid'))).status).toBe(422);
  expect((await list(request('?limit=NaN'))).status).toBe(422);
  const recent=await(await detail(request('/c060'),{params:Promise.resolve({id:'c060'})})).json() as Messages;
  expect((await detail(request(`/c059?before=${recent.nextCursor}`),{params:Promise.resolve({id:'c059'})})).status).toBe(422);
 });
});
