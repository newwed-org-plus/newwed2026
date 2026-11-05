import {env} from 'cloudflare:workers';
import {describe, expect, it, vi} from 'vitest';
import {POST} from '../../app/api/public/ebook/route';
import {destinosEbook} from '@/content/destinos-ebook';

const input = {nome:'VALIDACAO Pessoa', empresa:'Empresa sintética', email:'ebook@example.test', telefone:'81999990001', consent:{accepted:true,version:destinosEbook.consentVersion}};
function request(body:unknown = input, origin='https://newwed.test') {
  return new Request('https://newwed.test/api/public/ebook',{method:'POST',headers:{'content-type':'application/json',origin,'cf-connecting-ip':'198.51.100.42'},body:JSON.stringify(body)});
}
async function count(table:string) {return (await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{n:number}>())!.n;}

describe('cadastro do e-book de Destinos',()=>{
  it('salva o contato e a finalidade no painel sem edição, mensagens ou cobrança',async()=>{
    const network = vi.spyOn(globalThis,'fetch');
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({accepted:true,downloadUrl:null});
    const lead = await env.DB.prepare("SELECT * FROM leads WHERE source_system='ebook'").first();
    expect(lead).toMatchObject({name:input.nome,company:input.empresa,edition_id:null,stage:'NOVO',normalized_phone:'+5581999990001'});
    const answer = await env.DB.prepare('SELECT answers_json FROM lead_answers WHERE lead_id=?').bind(lead!.id).first<{answers_json:string}>();
    expect(JSON.parse(answer!.answers_json)).toMatchObject({ebook:destinosEbook.title,consent:input.consent});
    expect(await count('outbox_events')).toBe(0);
    expect(await count('checkouts')).toBe(0);
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
  });
  it('repetição simultânea não duplica o contato, pedido, origem ou histórico',async()=>{
    const responses = await Promise.all([POST(request()),POST(request()),POST(request())]);
    expect(responses.map(r=>r.status)).toEqual([200,200,200]);
    expect(await count('leads')).toBe(1);
    expect(await count('lead_answers')).toBe(1);
    expect(await count('pipeline_history')).toBe(1);
    expect(await count('lead_attribution')).toBe(2);
  });
  it('preserva estágio, dados comerciais e origem anterior de um contato existente',async()=>{
    await POST(request());
    await env.DB.prepare("UPDATE leads SET stage='PAGO',name='Nome cadastrado',company='Empresa cadastrada',edition_id='famtour-rn-abril-2027'").run();
    await env.DB.prepare("UPDATE lead_attribution SET utm_source='campanha-anterior'").run();
    const before=await env.DB.prepare('SELECT * FROM leads').first();
    expect((await POST(request({...input,nome:'Outro nome',empresa:'Outra empresa'}))).status).toBe(200);
    expect(await env.DB.prepare('SELECT * FROM leads').first()).toEqual(before);
    expect((await env.DB.prepare('SELECT utm_source FROM lead_attribution').all()).results.every(r=>r.utm_source==='campanha-anterior')).toBe(true);
    expect(await count('pipeline_history')).toBe(1);
  });
  it('recusa dados inválidos, falta de consentimento e origem externa sem criar contato',async()=>{
    for(const body of [{...input,telefone:'abc123'},{...input,empresa:''},{...input,email:'sem-email'},{...input,consent:{...input.consent,accepted:false}}]) {
      expect((await POST(request(body))).status).toBe(422);
    }
    expect((await POST(request(input,'https://outro.example'))).status).toBe(403);
    expect(await count('leads')).toBe(0);
  });
  it('respeita pausa de captação e exige verificação fora do desenvolvimento',async()=>{
    const runtime=env as typeof env & {ENVIRONMENT:string};
    runtime.ENABLE_PUBLIC_LEADS='false';
    expect((await POST(request())).status).toBe(503);
    runtime.ENABLE_PUBLIC_LEADS='true';
    const previous=runtime.ENVIRONMENT;
    try {runtime.ENVIRONMENT='production';expect((await POST(request())).status).toBe(503);}
    finally {runtime.ENVIRONMENT=previous;}
    expect(await count('leads')).toBe(0);
  });
});
