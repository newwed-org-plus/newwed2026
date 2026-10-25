# Status de execução

Atualizado em: 2026-10-25.

## Objetivo ativo

Implementar as ondas 21–26: site → inscrição → lead → atendimento → qualificação humana → checkout → pagamento → confirmação pela mesma linha UAZAPI.

- Texto e vendas completos; anexos, agenda, grupos e LID fora desta versão.
- Usuário vai testar localmente; Asaas sandbox e e-mail ainda não preparados.
- Não contratar capacidade paga sem orçamento aprovado; não liberar mensagens, cobranças ou e-mails antigos ao ativar consumidor.
- Preservar webhook e linha ativa; sem copiar conteúdo real ao banco local.

## Base preservada

- Ondas 0–16: funcionalidades e publicações em CP-00 a CP-16.
- Ondas 17–20: parser de conexão, renovação explícita de QR, fim do polling conectado e recuperação de histórico; CP-17 a CP-20.
- Último receptor publicado: versão `b06cb9e7-72ac-4c71-b15a-cc612327dba6`.
- Migrations existentes até 0008; produção usa D1 `2263d378-59c9-4e5a-8d9b-a6e0140767dd`.
- Conta Cloudflare New Wed: `41245f76790f4922487ec395c9e3bcec`, perfil Wrangler `newwed-production`.

## Onda 21 concluída

- Branch `codex/wave-21-security-staging`, base `ecbe6e5`.
- Zod 4.6.7, Vite 8.3.5 e transitivas corrigidas; auditoria de produção sem alertas.
- Preflight por capacidades: R2/Access opcionais, segurança e isolamento verificados. Funções externas desligadas por padrão.
- D1 staging `d67175d9-52b6-47f7-b7a0-4a75a05af32d`, migrations 0000–0008 aplicadas e quatro filas staging criadas; nenhum consumidor comercial ativado.
- Recuperação de produção confirmada por contagens em 25/10: 358 conversas e 14.908 mensagens; zero históricos/lotes pendentes. Nenhum conteúdo de mensagem foi lido.
- Tipos, lint, TypeScript, 95 unitários, 34 Workers, invariantes D1 e build aprovados; 53 cenários visuais aprovados (52 na suíte e um na repetição focada). Detalhes no CP-21.

## Onda 22 concluída

- Onda 22, `codex/wave-22-capacity-login`. Migration local 0009 e Durable Object AdminIpLimiter.
- Cursor de histórico, orçamento 100/tick, lock por linha e login sem bucket D1 por IP.
- Gate completo aprovado: 96 unitários, 37 Workers, 53 visuais, D1, build, lint/tipos e auditoria sem alertas. CP-22.

## Onda 23 concluída

- Onda 23, `codex/wave-23-inbox-pagination`, migration local 0010.
- Paginação estável, erros globais, polling serial e ambiente visível.
- Gate aprovado: 96 unitários, 39 Workers, 57 visuais, D1/build/lint/tipos/auditoria. CP-23.

## Onda atual

- Onda 24, `codex/wave-24-safe-commercial-processing`, migration local 0011.
- Outbox com retenção/lease/conclusão, flags independentes e intake separado de respostas.
- Envios incertos não são repetidos; revisão e reconciliação auditadas.
- Gate aprovado: 96 unitários, 46 Workers, 57 visuais, D1/build/lint/tipos/auditoria. CP-24.

## Próximas ondas

1. 22 concluída localmente; publicação remota de schema ainda não feita.
2. 23: paginação, erros, polling e identificação de ambiente na Inbox.
3. 24: processamento comercial durável, retenção do backlog e controles por função.
4. 25: Turnstile, checkout/confirmacão UAZAPI e Asaas.
5. 26: métricas, runbooks, gates finais e preparação do piloto.

## Bloqueios externos

- Asaas e domínio de e-mail dependem de preparação externa.
- Sem linha de teste separada configurada em homologação; nunca usar a linha ativa para fixtures.
- Vídeo final não fornecido; imagem atual preservada.
- Piloto real e observação por 24h ainda pendentes.
