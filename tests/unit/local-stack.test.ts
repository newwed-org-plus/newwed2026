import {describe,it,expect,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {prepareLocalWorkers} from '../../config/local-stack';
import {restoreOwnedWebhook} from '../../scripts/local-tunnel';
import {localRecipientAllowed} from '@/server/integrations/uazapi';
import {normalizeUazapiMessage} from '@/server/uazapi-webhook';
describe('configuração local isolada',()=>{
 it('compartilha D1/filas sem copiar credenciais ao receptor',()=>{
  const dir=mkdtempSync(join(tmpdir(),'newwed-config-'));
  try{mkdirSync(join(dir,'migrations'));const app={vars:{ENVIRONMENT:'development'},compatibility_date:'2026-09-11',d1_databases:[{binding:'DB',database_name:'new-wed-platform-development',database_id:'00000000-0000-0000-0000-000000000000'}]};for(const file of ['wrangler.jsonc','wrangler.events.jsonc','wrangler.uazapi.jsonc'])writeFileSync(join(dir,file),JSON.stringify(app));writeFileSync(join(dir,'.dev.vars'),'OPENROUTER_API_KEY=synthetic-private\nUAZAPI_INSTANCES=[]\nLOCAL_TEST_MODE=true\nLOCAL_WHATSAPP_ALLOWED_RECIPIENTS=5581999999999\n');const config=prepareLocalWorkers(dir);expect(config.workers).toHaveLength(2);expect(config.services).toHaveLength(2);const receiver=readFileSync(join(dir,'.local-runtime/receiver/.dev.vars'),'utf8');expect(receiver).not.toContain('API_KEY');expect(receiver).not.toContain('UAZAPI_INSTANCES');expect(receiver).toContain('LOCAL_TEST_MODE="true"');expect(receiver).toContain('LOCAL_WHATSAPP_ALLOWED_RECIPIENTS="5581999999999"');const local=JSON.parse(readFileSync(join(dir,'.local-runtime/receiver/wrangler.json'),'utf8'));expect(local.vars.ENVIRONMENT).toBe('development');expect(local.d1_databases[0].database_id).toBe(app.d1_databases[0].database_id);expect(local).not.toHaveProperty('account_id');}finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('restaura somente o webhook ainda pertencente ao túnel atual',async()=>{
  const update=vi.fn(async()=>({}));const original={id:'hook',url:'https://previous.test/callback',enabled:true};const owned='https://local.trycloudflare.com/api/webhooks/uazapi/test';
  expect(await restoreOwnedWebhook([{id:'hook',url:'https://changed.test'}],original,owned,update)).toBe(false);expect(update).not.toHaveBeenCalled();expect(await restoreOwnedWebhook([{id:'hook',url:owned}],original,owned,update)).toBe(true);expect(update).toHaveBeenCalledWith(original);
 });
 it('normaliza segundos e bloqueia destinatário vazio no teste local',()=>{
  const value=normalizeUazapiMessage('vendas',{messageid:'OLD',chatid:'5581999999999@s.whatsapp.net',messageTimestamp:1700000000},true);expect(value?.event.createdAt).toBe(new Date(1700000000000).toISOString());expect(localRecipientAllowed({ENVIRONMENT:'development',LOCAL_TEST_MODE:'true'},'')).toBe(false);expect(localRecipientAllowed({ENVIRONMENT:'development',LOCAL_TEST_MODE:'true',LOCAL_WHATSAPP_ALLOWED_RECIPIENTS:'5581999999999'},'558199999999')).toBe(true);
 });
});

it('libera cobrança e confirmação somente com perfil Sandbox válido e mantém receptor isolado',()=>{
 const dir=mkdtempSync(join(tmpdir(),'newwed-billing-'));
 try{
  mkdirSync(join(dir,'migrations'));const config={vars:{ENVIRONMENT:'development'},compatibility_date:'2026-09-11',d1_databases:[{binding:'DB',database_name:'new-wed-platform-development',database_id:'00000000-0000-0000-0000-000000000000'}]};
  for(const file of ['wrangler.jsonc','wrangler.events.jsonc','wrangler.uazapi.jsonc'])writeFileSync(join(dir,file),JSON.stringify(config));
  const source='LOCAL_TEST_MODE=true\nASAAS_API_URL=https://api-sandbox.asaas.com/v3\nASAAS_API_KEY=$aact_hmlg_synthetic\nLOCAL_WHATSAPP_ALLOWED_RECIPIENTS=5581999990001\nENABLE_CHECKOUT=true\nENABLE_CONFIRMATION=true\n';
  writeFileSync(join(dir,'.dev.vars'),source);prepareLocalWorkers(dir);
  const commercial=JSON.parse(readFileSync(join(dir,'.local-runtime/commercial/wrangler.json'),'utf8'));const receiver=JSON.parse(readFileSync(join(dir,'.local-runtime/receiver/wrangler.json'),'utf8'));
  expect(commercial.vars).toMatchObject({ENABLE_CHECKOUT:'true',ENABLE_CONFIRMATION:'true',ENABLE_EMAIL:'false'});expect(receiver.vars).toMatchObject({ENABLE_CHECKOUT:'false',ENABLE_CONFIRMATION:'false'});
  for(const bad of [source.replace('LOCAL_TEST_MODE=true','LOCAL_TEST_MODE=false'),source.replace('api-sandbox.asaas.com','api.asaas.com'),source.replace('$aact_hmlg_','$aact_prod_'),source.replace('5581999990001','')]){writeFileSync(join(dir,'.dev.vars'),bad);expect(()=>prepareLocalWorkers(dir)).toThrow('Local billing requires');}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
