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
