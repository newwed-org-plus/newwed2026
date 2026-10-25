# Matriz de testes

| Área | Cenário | Comando/suíte | Estado |
|---|---|---|---|
| Tipos Cloudflare | bindings e tipos gerados em checkout limpo | `npm run cf:types` | aprovado 2026-09-14 |
| Qualidade | lint sem erros | `npm run lint` | aprovado 2026-09-14 |
| Tipos | TypeScript após `cf:types` | `npm run typecheck` | aprovado 2026-09-14 |
| Domínio | pipeline, checkout, Asaas, conversa, agente e segurança operacional | `npm test` | 64/64 em 2026-09-14 |
| Build | bundle vinext/Workers | `npm run build` | aprovado 2026-09-14 |
| Visual | 11 páginas × 3 viewports, baselines macOS/Linux | `npm run test:visual` | 33/33 local e CI final `34864801713` em 2026-09-14 |
| Dependências | produção sem vulnerabilidades | `npm audit --omit=dev` | 0 em 2026-09-14 |
| Migration | aplicação inicial e repetição segura | baterias D1 das ondas 2–4 | `0000`–`0005` aplicadas; segunda execução sem pendências em 2026-09-14 |
| Persistência | defaults, FKs, deduplicação e concorrência de pipeline | D1 local isolado | aprovado em 2026-09-14 |
| Checkout | contrato, deduplicação, última vaga, expiração e cancelamento | unitários + D1 local | aprovado em 2026-09-14 |
| Asaas | payload Pix/cartão, recuperação, parcelas, cancelamento, estorno e ordem | unitários + D1 + Workers | aprovado em 2026-09-14, inclusive evento vencido após `PAGO` |
| Inbox | claim/release, dono da resposta, opt-out e exclusão mútua | `npm run test:d1:wave3` | 6 invariantes aprovadas em 2026-09-14 |
| Agente | política de handoff, saída estruturada, `store:false`, contexto e fallback | unitários + D1 + Workers | aprovado em 2026-09-14, inclusive baixa confiança e opt-out |
| Observabilidade | filtros, tarefas, relatórios, falhas e requestId | build + `npm run test:d1:wave4` | 7 invariantes aprovadas em 2026-09-14 |
| Rate limit | formulário 5/min, mensagem 30/min e checkout 5/10min | unitários + D1 local | aprovado em 2026-09-14 |
| Confirmação | evento duplicado gera uma notificação e um e-mail com retry | D1 + `npm run test:workers` | aprovado em 2026-09-14; uma entrega final após falha temporária |
| E2E | UTM → lead → agente → qualificação humana → checkout → Meta → webhook → `PAGO` → confirmação | `npm run test:workers` | 1 fluxo completo aprovado em workerd com D1/Queue/R2 reais locais |
| Resiliência | duplicidade/ordem, última vaga, retry, opt-out e handoff | `npm run test:workers` | 5 cenários de borda aprovados em 2026-09-14 |
| Permissões | vendedor não autoriza checkout; qualificação/checkout humanos | unitários + `npm run test:workers` | aprovado em 2026-09-14 |
| Lançamento | IDs e bindings estáticos de staging/produção | `npm run preflight:launch -- <ambiente>` | bloqueio esperado enquanto IDs D1 forem marcadores |

Resultados completos de cada execução pertencem ao checkpoint da onda. Falhas extensas não devem ser copiadas para este arquivo.

| UAZAPI | configuração, isolamento de segredos, parser de QR/estado, IDs por linha e limite de corpo | `tests/unit/uazapi.test.ts` | 8 cenários aprovados em 2026-10-19, incluindo redirect sem encaminhar token |
| UAZAPI Workers | RBAC/origem, conexão/lock, autenticação/deduplicação, histórico/celular, envio/recibos e fan-out | `tests/workers/uazapi.test.ts` | 7 cenários aprovados em 2026-10-19 |
| UAZAPI UI | QR/conexão/desconexão em 3 viewports e estado sem configuração/falha | `tests/visual/admin-whatsapp.spec.ts` | 4 cenários locais aprovados em 2026-10-19, provider sintético |

## Onda 15 — OpenRouter e atendentes

- Unitários: preços/modelos gratuitos, falta de chave, contrato JSON, baixa confiança, limites e sanitização.
- Workers: rascunho sem linha, exclusividade/versão, RBAC/origem, teste sem mensagens persistidas, UAZAPI→OpenRouter→linha correta, deduplicação, resumos e pausa durante geração.
- Visual/navegação: novo atendente, contexto/modelo, teste sem WhatsApp, vínculo/ativação/pausa/reload em 390/768/1440px; chave/catálogo indisponíveis.
- Migration 0008 repetível e invariantes D1 anteriores preservadas. Providers simulados; segredo real nunca entra nos testes automatizados.

## Onda 16 — Recebimento público UAZAPI

- Diagnóstico GET sem segredos, autenticação obrigatória no POST, configuração de recebimento sem URL do provider e UI sem polling/QR nesse modo.
- Consumidor dedicado: roteamento UAZAPI/comercial, processamento real D1 até conversa humana sem saída e cron que preserva outboxes comerciais.
- Gates locais: 91 unitários, 30 Workers, migrations repetíveis e invariantes D1; regressão visual completa, build production e dry-run de ambos os Workers.
- Smoke remoto: GET, token inválido, POST autenticado repetido, mensagem única/estado humano na Inbox e limpeza por identificadores sintéticos. Nenhum envio WhatsApp.

## Onda 17 — Estado conectado UAZAPI

- Parser de status textual/legado e atualização persistida por refresh sem reconexão ou chamadas de envio.
- Sem migration; validações sintéticas unitárias e Workers registradas em CP-17.

## Onda 18 — Recuperação de QR UAZAPI

- Unitários: `npm test` (92); Workers incluindo restart explícito, estado permitido e bloqueio fora de `connecting`: `npm run test:workers` (32).
- Visual: `npm run test:visual` (52), incluindo novo QR nos viewports mobile/tablet/desktop. Migrações locais aplicadas pela preparação da suíte visual; sem migration nova.
- `npm run cf:types`, lint, typecheck e build aprovados. `npm audit --omit=dev` mantém 9 alertas altos preexistentes descritos no CP-18.

## Onda 19 — Polling de status UAZAPI

- UI: uma consulta inicial por seleção e polling a cada cinco segundos somente em `connecting`; teste visual focado passou (6/6) e garante que linha conectada não repete refresh após 5,5 s.
- Sem migration. Tipos Cloudflare, lint, typecheck, 92 unitários, build e suíte visual completa (53) passaram; linha real permaneceu conectada.
- `npm audit --omit=dev` reporta os 9 alertas altos preexistentes (braces, source-map-js e vite/launch-editor); nenhuma dependência foi alterada.

## Onda 20 — Importação resiliente do histórico UAZAPI

- Worker: histórico processado diretamente no D1 em grupos de dez; recuperação cron de lotes e mensagens históricas pendentes não depende da Queue.
- Recebimento comum permanece assíncrono. A recuperação histórica força atendimento humano e não chama agente ou endpoint de envio.
- Testes: regressões focadas 13/13 e Worker completo 34/34; `cf:types`, lint, typecheck, 92 unitários, build e 53 visuais passaram. `db:migrate:local` confirmou nenhuma migration pendente.
- `npm audit --omit=dev` continua com 9 alertas altos preexistentes; lockfile/dependências não alterados. Detalhes em `checkpoints/CP-20.md`.

## Ondas 21–25 — Conclusão comercial

- Dependências e preflight por função, isolamento de ambientes, arquitetura sem R2 e login próprio.
- Importação com orçamento 100/tick e lease por linha; IP limitado em Durable Object; indisponibilidade D1 responde 503 sem bypass.
- Paginação com timestamp/ID: mais de 50 conversas e 100 mensagens, horários iguais, busca concorrente, erro global e expiração de sessão.
- Outbox: backlog antigo retido, funções desligadas, claim concorrente, crash/timeout e reconciliação sem replay cego. Intake sem chave de IA/envio.
- Checkout UAZAPI: vínculo obrigatório, linha/conversa preservadas, recibo, confirmação única, falha/timeout e reenvio auditado após resultado conhecido; legado Meta continua coberto.
- Asaas: Pix/cartão/parcelas, última vaga, conciliação, eventos duplicados/fora de ordem; estorno em andamento preserva capacidade e estorno concluído é terminal.
- Turnstile: ação/hostname/resposta, falha de rede e ausência de configuração fora do desenvolvimento.

## Onda 26 — Operação e ensaio do piloto

- Workers: 75 pendências versus lista limitada; alertas de falta de progresso/uso, reconciliação e-mail e limpeza segura do limitador IP.
- Capacidade: 28 recebimentos, dois logins e 100 históricos por tick concorrentes; retomada até 148 mensagens únicas, zero OUT.
- Inscrição concorrente: lead único, consentimentos preservados e única entrada NOVO.
- Backup/restauração: `npm run test:recovery` em dois D1 temporários, schema/dados exportados, FKs e índices conferidos e limpeza automática.
- Visual: cinco cenários adicionais, três viewports para operação/revisão individual e dois para vínculo de checkout; regressão total esperada de 62 cenários.
- Validação externa, pico remoto, treinamento e piloto de 24 h continuam sujeitos aos pré-requisitos do checklist; fixtures não são evidência de produção.


## Onda 27 — Stack e importação locais

- Unitários: geração de configs com D1/filas compartilhados, ausência de chaves no receptor, restauração condicionada ao callback ainda próprio, timestamps em segundos e allowlist vazia. Total: 100.
- Workers: paginação/orçamento/deduplicação do cache, histórico enviado por API, lock/backoff/retomada, envio manual humano uma única vez para contato escolhido, bloqueio das automações, reconciliação recente sem resposta e guards de localhost/segredo. Total: 61.
- Visual: contagens e progresso de importação com botão bloqueado durante execução, além dos cenários anteriores. Total esperado: 63.
- Smokes reais somente de leitura: callback autorizado do provider, webhook público pronto, painel não exposto e cron local funcional. Mensagem do operador não é reenviada pelo agente.
- Histórico do celular pendente por indisponibilidade do aparelho; testes simulados não são evidência de recuperação completa nem entrega real.
