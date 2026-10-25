import {describe,it,expect,vi,afterEach} from 'vitest';
import {createServer as createViteServer} from 'vite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {localRuntimeErrors} from '../../config/local-runtime-errors';
import {adminApi} from '@/features/admin/api';
import {sameWhatsAppRecipient} from '@/server/uazapi-delivery';
import {messageDelivery} from '@/features/admin/message-delivery';
afterEach(()=>vi.restoreAllMocks());
describe('falhas transitórias locais',()=>{
 it('responde 503 sem overlay para runtime indisponível e preserva erros de código',async()=>{
  const root=mkdtempSync(join(tmpdir(),'newwed-runtime-'));
  const vite=await createViteServer({root,configFile:false,logLevel:'silent',appType:'custom',server:{port:0,host:'127.0.0.1'},plugins:[{name:'synthetic-runtime',configureServer(server){server.middlewares.use((request,_response,next)=>next(request.url==='/api/compile'?new SyntaxError('synthetic syntax error'):new TypeError('fetch failed')));}},localRuntimeErrors()]});
  await vite.listen();const hot=vi.spyOn(vite.environments.client.hot,'send');
  const address=vite.httpServer!.address();if(!address||typeof address==='string')throw new Error('Missing local port');const base=`http://127.0.0.1:${address.port}`;
  try{const response=await fetch(`${base}/api/admin/conversations`);expect(response.status).toBe(503);expect(await response.json()).toMatchObject({code:'LOCAL_RUNTIME_UNAVAILABLE'});expect(hot).not.toHaveBeenCalled();const compile=await fetch(`${base}/api/compile`);expect(compile.status).toBe(500);await compile.body?.cancel();expect(hot).toHaveBeenCalledWith(expect.objectContaining({type:'error'}));}
  finally{await vite.close();rmSync(root,{recursive:true,force:true});}
 });
 it('repete somente consultas de leitura e nunca uma mutação',async()=>{
  const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(Response.json({code:'LOCAL_RUNTIME_UNAVAILABLE'},{status:503})).mockResolvedValueOnce(Response.json({items:[]}));
  expect(await adminApi('/api/admin/conversations')).toEqual({items:[]});expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockReset().mockRejectedValue(new TypeError('fetch failed'));
  await expect(adminApi('/api/admin/conversations/c/messages',{method:'POST',body:'{}'})).rejects.toMatchObject({status:0,message:expect.stringContaining('pode ter sido registrada')});expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('aceita apenas a variação brasileira do nono dígito, sem misturar contatos ou LID',()=>{
  expect(sameWhatsAppRecipient('5581999999999','558199999999@s.whatsapp.net')).toBe(true);expect(sameWhatsAppRecipient('5581999999999','558299999999@s.whatsapp.net')).toBe(false);expect(sameWhatsAppRecipient('5581999999999','558188888888@s.whatsapp.net')).toBe(false);expect(sameWhatsAppRecipient('5581999999999','558199999999@lid')).toBe(false);
 });
 it('não apresenta aceite ou envio como entrega',()=>{
  expect(messageDelivery('ACCEPTED').hint).toContain('entrega ainda não');expect(messageDelivery('SENT').hint).toContain('ainda não');expect(messageDelivery('DELIVERED').label).toBe('Entregue');expect(messageDelivery('READ').label).toBe('Lida');
 });
});
