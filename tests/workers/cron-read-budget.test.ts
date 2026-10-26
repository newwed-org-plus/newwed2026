import {env} from 'cloudflare:workers';
import {describe,it,expect,vi} from 'vitest';
import commercial from '../../workers/events';
import {operationalSnapshot} from '@/server/operations';

describe('orçamento de leitura da manutenção ociosa',()=>{
 it('mantém o cron barato com milhares de mensagens e eventos já concluídos',async()=>{
  const now=new Date().toISOString();
  await env.DB.prepare("INSERT INTO conversations(id,channel,external_id,created_at,updated_at) VALUES('budget-conversation','meta','synthetic-budget',?,?)").bind(now,now).run();
  await env.DB.prepare(`WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<3000)
    INSERT INTO messages(id,conversation_id,direction,type,status,created_at) SELECT 'budget-message-'||i,'budget-conversation','IN','text','READ',? FROM n`).bind(now).run();
  await env.DB.prepare(`WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<3000)
    INSERT INTO outbox_events(id,type,aggregate_id,payload_json,dispatch_state,published_at,processed_at,created_at)
    SELECT 'budget-event-'||i,'uazapi.incoming','synthetic','{}','DONE',?,?,? FROM n`).bind(now,now,now).run();
  await env.DB.prepare("INSERT INTO outbox_events(id,type,aggregate_id,payload_json,dispatch_state,published_at,processed_at,created_at) VALUES('budget-done','lead.submitted','synthetic','{}','DONE',?,?,?)").bind(now,now,now).run();
  // Confirm the fixture exposes the original full-table scan.
  const original=await env.DB.prepare("SELECT max(processed_at) FROM outbox_events WHERE type NOT LIKE 'uazapi.%'").all();
  expect(original.meta.rows_read).toBeGreaterThanOrEqual(3000);
  let reads=0;
  const record=<T,>(result:D1Result<T>)=>{reads+=result.meta.rows_read;return result;};
  const statement=(source:D1PreparedStatement):D1PreparedStatement=>new Proxy(source,{get(target,key){
   if(key==='bind')return (...values:unknown[])=>statement(target.bind(...values));
   if(key==='first')return async(column?:string)=>{const result=record(await target.all<Record<string,unknown>>());const row=result.results[0];return row?(column?row[column]:row):null;};
   if(key==='all'||key==='run')return async()=>record(await target[key]());
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  const db=new Proxy(env.DB,{get(target,key){
   if(key==='prepare')return (sql:string)=>statement(target.prepare(sql));
   if(key==='batch')return async(values:D1PreparedStatement[])=>{const results=await target.batch(values);results.forEach(record);return results;};
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  const queue=vi.fn(async()=>{});
  const runtime={...env,DB:db,ENVIRONMENT:'production',ENABLE_AGENT:'false',ENABLE_FREE_AI_RETRY:'false',ENABLE_MANUAL_SEND:'false',ENABLE_CHECKOUT:'false',ENABLE_CONFIRMATION:'false',ENABLE_EMAIL:'false',ENABLE_MESSAGE_STATUS_SYNC:'false',ENABLE_HISTORY_SYNC:'false',CLOUDFLARE_ANALYTICS_TOKEN:undefined,ASAAS_API_KEY:undefined,EVENTS_QUEUE:{send:queue} as unknown as Queue};
  await commercial.scheduled({} as ScheduledController,runtime);
  expect(reads).toBeLessThan(100);
  expect(queue).not.toHaveBeenCalled();
  expect((await operationalSnapshot(env,'commercial')).watermark).toBe(now);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM messages').first()).toEqual({n:3000});
 });

 it('recupera somente envios antigos sem alterar os já entregues ou os leases recentes',async()=>{
  const now=new Date().toISOString(),old=new Date(Date.now()-11*60000).toISOString();
  await env.DB.prepare("INSERT INTO conversations(id,channel,external_id,created_at,updated_at) VALUES('lease-conversation','meta','synthetic-lease',?,?)").bind(now,now).run();
  for(const [id,status,started] of [['stale','SENDING',old],['fresh','SENDING',now],['delivered','DELIVERED',old]])await env.DB.prepare("INSERT INTO messages(id,conversation_id,direction,type,status,send_started_at,created_at) VALUES (?,'lease-conversation','OUT','text',?,?,?)").bind(id,status,started,old).run();
  const runtime={...env,ENABLE_CHECKOUT:'false',ENABLE_MESSAGE_STATUS_SYNC:'false',ENABLE_HISTORY_SYNC:'false',CLOUDFLARE_ANALYTICS_TOKEN:undefined,ASAAS_API_KEY:undefined};
  await commercial.scheduled({} as ScheduledController,runtime);
  expect((await env.DB.prepare('SELECT id,status FROM messages ORDER BY id').all()).results).toEqual([{id:'delivered',status:'DELIVERED'},{id:'fresh',status:'SENDING'},{id:'stale',status:'SEND_UNKNOWN'}]);
 });
});
