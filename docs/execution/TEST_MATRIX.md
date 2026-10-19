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

| UAZAPI | configuração, isolamento de segredos, parser de QR/estado, IDs por linha e limite de corpo | `tests/unit/uazapi.test.ts` | 7 cenários aprovados em 2026-10-19 |
| UAZAPI Workers | RBAC/origem, conexão/lock, autenticação/deduplicação, histórico/celular, envio/recibos e fan-out | `tests/workers/uazapi.test.ts` | 7 cenários aprovados em 2026-10-19 |
| UAZAPI UI | QR/conexão/desconexão em 3 viewports e estado sem configuração/falha | `tests/visual/admin-whatsapp.spec.ts` | 4 cenários locais aprovados em 2026-10-19, provider sintético |
