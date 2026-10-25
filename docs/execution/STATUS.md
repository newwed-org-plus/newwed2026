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
- Migrations remotas até 0008; locais até 0013; produção usa D1 `2263d378-59c9-4e5a-8d9b-a6e0140767dd`.
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

## Onda 24 concluída

- Onda 24, `codex/wave-24-safe-commercial-processing`, migration local 0011.
- Outbox com retenção/lease/conclusão, flags independentes e intake separado de respostas.
- Envios incertos não são repetidos; revisão e reconciliação auditadas.
- Gate aprovado: 96 unitários, 46 Workers, 57 visuais, D1/build/lint/tipos/auditoria. CP-24.

## Onda 25 concluída

- Onda 25, `codex/wave-25-uazapi-checkout`, migration local 0012.
- Checkout e confirmação na mesma conversa/linha UAZAPI, conciliação de envio incerto e estorno concluído terminal.
- Formulário/Turnstile e vínculo de checkout corrigidos; legado Meta preservado.
- Gate aprovado: 97 unitários, 49 Workers, 57 visuais, D1/build/lint/tipos/auditoria. CP-25.
- PRs 7–10 com CI aprovado; sem merge/deploy automático durante validação local.

## Onda 26 concluída localmente

- 26, `codex/wave-26-operations-local-pilot`, migration local 0013.
- Métricas/alertas, revisão de retenções e e-mails, backup/restauração, fixtures e roteiro local implementados. CP-26.
- Focados: 55 Workers e cinco visuais novos aprovados; ensaio de backup/restauração aprovado.
- Gate completo aprovado: 97 unitários, 55 Workers, 62 visuais, D1, backup/restauração, build, lint/tipos, auditoria zero e preflights. Assets do cliente sem secrets.
- Banco local preparado com fixture sem provider. Não houve merge, deploy, envio real ou contratação.
- Correção de corrida no CTA da PR 11: `fe2180b` (incorporada nesta branch como `fb62826`); novo CI em execução.


## Bloqueios externos

- Asaas e domínio de e-mail dependem de preparação externa.
- Sem linha de teste separada configurada em homologação; nunca usar a linha ativa para fixtures.
- Vídeo final não fornecido; imagem atual preservada.
- Piloto real e observação por 24h ainda pendentes.
