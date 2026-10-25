# Status de execução

Atualizado em: 2026-10-25.

## Objetivo ativo

Implementar as ondas 21–26: site → inscrição → lead → atendimento → qualificação humana → checkout → pagamento → confirmação pela mesma linha UAZAPI.

- Texto e vendas completos; anexos, agenda, grupos e LID fora desta versão.
- Usuário vai testar localmente; Asaas sandbox e e-mail ainda não preparados.
- Não contratar capacidade paga sem orçamento aprovado; não liberar mensagens, cobranças ou e-mails antigos ao ativar consumidor.
- O usuário autorizou usar `atendimento` no localhost e importar o histórico UAZAPI desta linha. D-047 substitui a restrição local anterior; sem deploy.

## Base preservada

- Ondas 0–16: funcionalidades e publicações em CP-00 a CP-16.
- Ondas 17–20: parser de conexão, renovação explícita de QR, fim do polling conectado e recuperação de histórico; CP-17 a CP-20.
- Último receptor publicado: versão `b06cb9e7-72ac-4c71-b15a-cc612327dba6`.
- Migrations remotas até 0008; locais até 0015; produção usa D1 `2263d378-59c9-4e5a-8d9b-a6e0140767dd`.
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
- Correção de corrida no CTA da PR 11: `fe2180b` (incorporada nesta branch como `fb62826`); CI aprovado. PRs 7–12 aprovadas no CI, sem merge/deploy.


## Onda 27 — UAZAPI inteiramente operada pelo ambiente local

- Branch `codex/wave-27-local-uazapi-stack`, base `453ba29`; CP-27. App, receptor, consumidor comercial, D1, filas, DO e cron locais. UAZAPI continua sendo serviço externo.
- Migration 0014 somente local: progresso e exclusão de importação nativa. Importação limitada, retomável e sem resposta automática.
- Callback autorizado da linha atendimento aponta ao túnel que expõe somente seu webhook. O launcher restaura o callback anterior ao encerrar normalmente.
- Importadas 161 conversas individuais e duas mensagens disponíveis no cache do provider na primeira consulta. Histórico completo do celular pendente; usuário sem acesso ao aparelho, helper pausado e progresso privado preservado.
- Envios manuais escolhidos pelo operador permitidos localmente; automações continuam limitadas ao destinatário previamente autorizado. Não reenviar automaticamente a tentativa bloqueada.
- Asaas, confirmação e e-mail permanecem desligados. Nenhum deploy, migration remota, cobrança ou envio de validação iniciado pelo agente.
- Validação: 100 unitários, 61 Workers, D1/recuperação, build, tipos/lint e auditoria zero aprovados. Visuais: 62 na suíte + CTA tablet aprovado na repetição; 11 Inbox/WhatsApp aprovados novamente. CI remoto e commit consultáveis na [PR 13](https://github.com/newwed-org-plus/newwed2026/pull/13/checks).

## Onda 28 — Recuperação local e estados de entrega

- Branch `codex/wave-28-inbox-delivery-local`, base `a92c713`; CP-28. Nenhum deploy ou migration remota.
- Migration 0015 aditiva: horários observados e metadados de consulta de estados. Recibos e consultas por ID/linha progridem sem regredir leitura; variação brasileira do nono dígito validada, sem misturar contatos.
- Reinício do runtime local retorna 503 estável, sem overlay de compilação para falha de transporte; erros de código continuam visíveis. Somente GET/HEAD têm repetição limitada.
- Inbox mostra Na fila/Enviando/Aceita/Enviada/Entregue/Lida e permite conferir entrega sem reenviar. Páginas antigas recebem atualizações de estado sem perder texto/posição.
- Teste externo explicitamente autorizado: uma mensagem pelo fluxo manual local, confirmação DELIVERED no provider e na Inbox. Sem segunda tentativa do mesmo envio.
- Usuário também autorizou IA local somente para o destinatário de teste e escolheu enviar a pergunta pelo próprio WhatsApp. Prévia com openrouter/free aprovada após 429 no modelo inicial; conversa original liberada em modo Agente para o contato autorizado. Não fabricar mensagem recebida.
- Gate completo aprovado: 104 unitários, 67 Workers, 65 visuais, D1/recuperação, tipos/lint, build, auditoria zero e preflights. CI remoto pendente.

## Bloqueios externos

- Asaas e domínio de e-mail dependem de preparação externa.
- Sem linha de teste separada configurada em homologação; nunca usar a linha ativa para fixtures.
- Vídeo final não fornecido; imagem atual preservada.
- Piloto real e observação por 24h ainda pendentes.
