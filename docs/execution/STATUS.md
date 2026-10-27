# Status de execução

Atualizado em: 2026-10-27.

## Objetivo ativo

Implementar as ondas 21–26: site → inscrição → lead → atendimento → qualificação humana → checkout → pagamento → confirmação pela mesma linha UAZAPI.

- Texto e vendas completos; anexos, agenda, grupos e LID fora desta versão.
- Usuário autorizou publicação de produção (D-053); revalidação local permanece Sandbox. Chave Asaas de produção armazenada e validada em CP-37; checkout remoto fica desligado até concluir webhook e aceite.
- Não contratar capacidade paga sem orçamento aprovado; não liberar mensagens, cobranças ou e-mails antigos ao ativar consumidor.
- O usuário autorizou usar `atendimento` no localhost e importar o histórico UAZAPI desta linha. D-047 autorizou o callback local; D-053 autoriza a publicação e a devolução do callback para produção.
- Em 26/10 o usuário autorizou zerar todas as conversas de produção: limpeza concluída em CP-36/D-056, com backup cifrado. Diagnóstico de mensagem não recebida aguarda destino/horário; não repetir a limpeza ou fabricar recebimento.

## Base preservada

- Ondas 0–16: funcionalidades e publicações em CP-00 a CP-16.
- Ondas 17–20: parser de conexão, renovação explícita de QR, fim do polling conectado e recuperação de histórico; CP-17 a CP-20.
- Migrations remotas até 0020; produção usa D1 `2263d378-59c9-4e5a-8d9b-a6e0140767dd`.
- Conta Cloudflare New Wed: `41245f76790f4922487ec395c9e3bcec`, perfil Wrangler `newwed-production`.

## Onda 21 concluída

- Zod 4.6.7, Vite 8.3.5 e transitivas corrigidas; auditoria de produção sem alertas.
- Preflight por capacidades: R2/Access opcionais, segurança e isolamento verificados. Funções externas desligadas por padrão.
- D1 staging `d67175d9-52b6-47f7-b7a0-4a75a05af32d`, migrations 0000–0008 aplicadas e quatro filas staging criadas; nenhum consumidor comercial ativado.
- Recuperação de produção confirmada por contagens em 25/10: 358 conversas e 14.908 mensagens; zero históricos/lotes pendentes. Nenhum conteúdo de mensagem foi lido.
- Tipos, lint, TypeScript, 95 unitários, 34 Workers, invariantes D1 e build aprovados; 53 cenários visuais aprovados (52 na suíte e um na repetição focada). Detalhes no CP-21.

## Onda 22 concluída

- Cursor de histórico, orçamento 100/tick, lock por linha e login sem bucket D1 por IP.
- Gate completo aprovado: 96 unitários, 37 Workers, 53 visuais, D1, build, lint/tipos e auditoria sem alertas. CP-22.

## Onda 23 concluída

- Paginação estável, erros globais, polling serial e ambiente visível.
- Gate aprovado: 96 unitários, 39 Workers, 57 visuais, D1/build/lint/tipos/auditoria. CP-23.

## Onda 24 concluída

- Outbox com retenção/lease/conclusão, flags independentes e intake separado de respostas.
- Envios incertos não são repetidos; revisão e reconciliação auditadas.
- Gate aprovado: 96 unitários, 46 Workers, 57 visuais, D1/build/lint/tipos/auditoria. CP-24.

## Onda 25 concluída

- Checkout e confirmação na mesma conversa/linha UAZAPI, conciliação de envio incerto e estorno concluído terminal.
- Formulário/Turnstile e vínculo de checkout corrigidos; legado Meta preservado.
- Gate aprovado: 97 unitários, 49 Workers, 57 visuais, D1/build/lint/tipos/auditoria. CP-25.

## Onda 26 concluída localmente

- Métricas/alertas, revisão de retenções e e-mails, backup/restauração, fixtures e roteiro local implementados. CP-26.
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
- Gate completo aprovado: 104 unitários, 67 Workers, 65 visuais, D1/recuperação, tipos/lint, build, auditoria zero e preflights. Código `c598df4`; CI consultável nas [execuções da branch](https://github.com/newwed-org-plus/newwed2026/actions?query=branch%3Acodex%2Fwave-28-inbox-delivery-local).

## Onda 29 — IA gratuita com retomada e conhecimento oficial

- Branch `codex/wave-29-free-ai-knowledge`, base `4952a9b`; CP-29. Migration 0016 somente local; sem deploy ou contratação. PR 15 mesclada externamente na branch 28; ajustes complementares nesta branch, sem merge pelo agente.
- 429/503 transitórios usam espera durável, cooldown por conta/modelo, pacing e até três alternativas gratuitas verificadas com teto zero. Cota global exige aguardar; flag remota desligada. D-049 substitui o handoff por limite de D-048 quando habilitada.
- Respostas deduplicadas por pergunta, lease recuperável somente antes de efeito externo, claim/opt-out/versão preservados. Inbox mostra a espera. FAQs oficiais e resumos extrativos locais reduzem consumo.
- Fonte comum de conteúdo entre páginas/IA cobre Feira Tendência, Destinos/FAMTOUR, Guia, Workshop e quatro edições publicadas. Preços anunciados não prometem reserva; capacidade publicada não é vaga restante. Fixtures e componentes antigos não montados excluídos.
- Corrida entre pull de cache e callback corrigida: somente o envelope ao vivo autenticado pode promover a mesma mensagem já importada. Histórico isolado nunca responde.
- Teste real autorizado: pergunta de produtos retomada uma vez, resposta READ; nova pergunta sobre Feira recebeu resposta DELIVERED. Conversa permanece AGENT. Prévia gratuita real aprovada sobre quatro projetos, formatos, combos e datas; dados privados somente em `.local-runtime`.
- Gate aprovado: 126 unitários, 76 Workers (após correção final), 66 visuais, D1/recuperação, tipos/lint, build, auditoria zero e preflights. CI da implementação `756061f` aprovado. Ajustes finais: rotação persistida entre ciclos e indisponibilidade de endpoint, com prévia comercial real aprovada.

## Onda 30 — Conhecimento público e memória de assunto

- Branch `codex/wave-30-product-memory`, base `4db2426`; CP-30. Migration 0017 somente local, aditiva; sem deploy, merge ou contratação.
- Usuário determinou usar somente preços publicados. Quatro edições FAMTOUR com valores à vista/12 parcelas; Feira, Guia e Workshop sob consulta. D-050. Conteúdo comum inclui formulários e galerias anteriores, sem ofertas legadas.
- Memória D1 guarda apenas projetos/destinos e cursor/revisão por conversa; IN define assunto, OUT não. Correção, mudança e esquecimento são preservados. Reconstrução limitada e retomável adia a resposta até concluir, sem inventar seleção.
- FAQ comercial e prévia utilizam fonte direta sem geração. Prompt retira preços privados; guard bloqueia valores/parcelas/juros/desconto/datas/estoque/promessas sem fonte. Resposta automática registra versão e hash da base.
- Gestão pode consultar preços, formatos e pendências de informação em Atendentes → Ver conhecimento dos produtos. API somente leitura, sem dados de clientes. Prévia gratuita real comparou corretamente formatos de Guia e Workshop; sem novo WhatsApp.
- Verificações locais: 161 unitários, 83 Workers, 69 visuais, D1/recuperação, tipos/lint/build, auditoria zero e preflights. CP-30. Stack local/túnel preservados, automação continua restrita ao contato autorizado.

## Onda 31 — Asaas Sandbox e webhook local

- Branch `codex/wave-31-asaas-local`, base `51102d0`; CP-31. Sem migration, deploy, merge ou cobrança.
- Sandbox vinculado e chave exclusiva autorizados, validade até 24/11/2026, saque por API desligado. Credenciais/token somente em arquivo privado 0600; produção preservada.
- API cadastral aprovada; webhook exclusivo ativo, autenticado e sequencial. Túnel expõe somente os webhooks permitidos; painel bloqueado. Cadastro incerto é conciliado e encerramento pausa antes de fechar o túnel; não reativar fila interrompida.
- Validação pública: sem token 401, token válido/payload inválido 422, painel 404, receptor UAZAPI 200. Nenhum cliente, cobrança ou evento financeiro fictício criado. Checkout, confirmação e e-mail desligados.
- Gate aprovado: 180 unitários finais, 83 Workers, 69 visuais, D1/recuperação, tipos/lint/build, auditoria zero e preflights. Evidências no CP-31; testes financeiros externos pendentes.

## Onda 32 — Checkout e confirmação no Sandbox local

- Branch `codex/wave-32-sandbox-checkout`, base `38934d0`; CP-32. Autorização D-052, sem migration/deploy. Checkout e confirmação locais habilitados somente para o contato autorizado; e-mail e backlog continuam retidos.
- Edição/lote sintéticos: Pix R$ 1.200,00, capacidade 8. UI qualifica/autoriza; consumidor cria cobrança e envia pela conversa/linha existentes. Documento sintético explícito somente no Sandbox, notificações nativas Asaas desligadas.
- API e consumidor bloqueiam outro contato antes de cobrar. Webhook aceita opcionais nulos sem relaxar ID/status/valor; rejeição real 422 corrigida e retomada natural validada com HTTP 200.
- Ciclo validado: uma cobrança PAID, lead PAGO, link e confirmação READ, uma notificação, uma transição e uma vaga vendida. Replay do evento original e mesma chave de criação não duplicam efeitos. Painel mostra estados separados com atualização sem reenvio.
- Gate aprovado: 185 unitários, 85 Workers, 72 visuais, D1/recuperação, tipos/lint/build, auditoria zero e preflights. CP-32. Cartão/parcelas/estorno externos e produção fora deste aceite.

## Onda 33 — Produção publicada; aceite externo parcial

- Branch codex/wave-33-production-launch, base 04137df. D-053 e CP-33.
- Backup cifrado de schema/dados com recuperação da chave pelo Chaveiro verificada; 358 conversas/14.908 mensagens preservadas após migrations 0009–0018. 76 operações antigas HELD.
- Dados fiscais do checkout protegidos; gate aprovado: 189 unitários, 89 Workers, 72 visuais, D1/recuperação, tipos/lint/build e auditoria zero.
- Revalidação local: Marina Costa, Famtour Alagoas/R$ 7.697,00, uma cobrança Pix Sandbox PAID, lead PAGO e link/confirmação entregues. Nenhuma cobrança real.
- Web, receptor e consumidor publicados; recebimento, envio manual e IA gratuitos habilitados. Callback atendimento em produção e conectado; histórico remoto pausado e operações antigas HELD.
- Consumo real D1/filas coletado pelo cron; falha de transporte resolvida com redirect manual. Plano gratuito/e-mail desligado por decisão do usuário. Checkout/confirmação aguardavam SMS Asaas; chave validada posteriormente em CP-37.
- Local revalidado: Pix e cartão em 12 parcelas com nomes comuns, cobrança/notificação/confirmação únicas. Login autenticado remoto e teste de token real do formulário dependem do usuário.

## Onda 34 — Login de produção recuperado

- Branch codex/wave-34-production-login, base 388a0a4. CP-34 e D-054.
- Cota diária D1 impedia criar a sessão; login normal recuperado, senha/autenticação preservadas e plano Free mantido.
- Migration 0019: índices parciais eliminam varreduras ociosas; cron sintético com 3 mil mensagens e eventos usa menos de 100 leituras.
- Erro de cota informa motivo e renovação, preservando DATABASE_UNAVAILABLE e 503; falha transitória continua distinta.
- Gate aprovado: 190 unitários, 91 Workers, 73 visuais e auditoria zero; CI da PR 21/main aprovado. Migration 0019 aplicada staging → produção após renovação autorizada.
- Web `ae14f7d9-3e1c-4a36-ae78-3577eaba08ea` e comercial `bf22461a-8804-44dd-a1b6-a79d1f1eacd1`. Login normal e Inbox com 100 conversas validados; 16 prints já enviados ao Lucas, sem repetição.
- Cron recuperado, dados e retenções preservados. Custo adicional dos eventos históricos corrigido em CP-35.

## Onda 35 — Isolamento do orçamento comercial

- Branch codex/wave-35-commercial-read-budget, base 9590340. CP-35/D-055, migration aditiva 0020.
- Índice parcial aplicado staging → produção: três consultas passaram de 34.698 para nove leituras; eventos históricos/HELD preservados. Gate completo aprovado: 190 unitários, 91 Workers, 73 visuais e auditoria zero.
- PR 22/CI de main aprovados, merge 32faae1; web `4af762f7-ab5a-4d69-8543-d71a7883c6e7`. Login normal, sessão após publicação e Inbox paginada aprovados. Retomada concluída, sem WhatsApp adicional ou contratação.

## Onda 36 — Limpeza operacional autorizada

- Branch codex/wave-36-inbox-cleanup, sem código, migration ou deploy. Removidas 359 conversas, 14.911 mensagens e a memória; payloads de webhooks apagados, marcadores deduplicadores preservados.
- Inbox vazia confirmada pela UI/API, autenticação e atendentes preservados. Backup cifrado/recuperação verificados, ensaio local e FKs aprovados. Recebimento autenticado 200; último envio manual estava entregue. Destino/horário do relato pendentes.

## Onda 37 — Chave Asaas de produção

- Chave gerada pelo usuário, guardada exclusivamente no secret comercial ASAAS_API_KEY e validada por consulta de leitura HTTP 200. CP-37/D-057. Sem cobrança real ou alteração de flags.

## Bloqueios externos

- Asaas produção: chave validada em CP-37; webhook e aceite financeiro remoto pendentes. Checkout/confirmação/e-mail desligados; domínio de e-mail pendente.
- Sem linha de teste separada configurada em homologação; nunca usar a linha ativa para fixtures.
- Vídeo final não fornecido; imagem atual preservada.
- Piloto real e observação por 24h ainda pendentes.
