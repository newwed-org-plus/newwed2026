# Configuração externa — ondas 21–26

O código usa UAZAPI, OpenRouter gratuito, login próprio, D1 e filas separadas. R2 e Cloudflare Access são opcionais. Nunca colocar secrets, destinatários reais ou payloads de clientes em Git, logs ou evidências.

## Estado em 25/10/2026

- D1/filas staging criados e independentes. Staging recebeu somente migrations até 0008; aplicar 0009–0013 na janela aprovada antes de publicar estas ondas.
- Produção conserva o recebimento já publicado. Nenhum deploy, migration remota ou envio comercial foi feito pelas ondas 22–26.
- Todas as funções comerciais ficam desligadas nos arquivos Wrangler. Inscrição pública também tem controle próprio.
- Usuário escolheu teste local. Asaas Sandbox local configurado na onda 31; e-mail, Turnstile e linha exclusiva de homologação continuam pendentes. O contato informado pelo usuário não está em código/fixtures.

## Matriz de secrets por serviço

| Serviço | Configuração necessária |
| --- | --- |
| Web | `OPENROUTER_API_KEY` para catálogo/teste administrativo de atendentes; `UAZAPI_INSTANCES` para autenticar callbacks; `UAZAPI_WEBHOOK_BASE_URL`; `TURNSTILE_SECRET_KEY` quando inscrição ativa; `ASAAS_WEBHOOK_TOKEN` para Asaas |
| Receptor UAZAPI | Sem credenciais de envio, Asaas ou IA. D1, filas e flags de agente/e-mail apenas |
| Comercial | `UAZAPI_INSTANCES` com URL HTTPS e token de cada linha autorizada; `OPENROUTER_API_KEY`; `ASAAS_API_KEY`; binding EMAIL verificado quando ativado |
| Métricas comercial | `CLOUDFLARE_ANALYTICS_TOKEN` restrito a Account Analytics Read e à conta correta; `CLOUDFLARE_ACCOUNT_ID`; orçamentos de leitura/escrita D1 e operações Queue |

Segredos diferentes por ambiente. Configurações Meta/OpenAI antigas são apenas para compatibilidade de dados legados. Não habilitar fallback pago.

## Login e infraestrutura

- Provisionar usuários/papéis e login próprio com `scripts/provision-admin.ts`; senha entra pela entrada oculta/stdin. Sessões D1, verificação por identidade e limite por IP em Durable Objects.
- Conferir `ADMIN_PASSWORD_VERIFIER`, `ADMIN_IP_LIMITER` e migrations DO. `ALLOW_LOCAL_ACCESS=false` em staging/produção.
- App, receiver e comercial usam o mesmo D1 por ambiente e filas comercial/UAZAPI separadas, com DLQs distintas. Staging nunca aponta a UUID/fila de produção.
- Homologação usa linha de teste exclusiva. O callback local da linha atendimento foi autorizado especificamente em D-047 e é restaurado ao encerrar.

## Turnstile

Criar widget com um token restrito `Account.Turnstile:Edit`, conforme o fluxo da skill. O helper retornou `missing_token`; widget não foi criado. Não recuperar o secret usando o `npx` do projeto. Registrar o secret somente no Worker web. Preencher `TURNSTILE_SITE_KEY` e `TURNSTILE_HOSTNAMES` com os hosts reais do ambiente, ação `public_lead`. Testar token consumido/expirado, ação e hostname inválidos; não liberar inscrição fora de desenvolvimento sem essas verificações.

## Asaas sandbox e produção

1. Sandbox vinculado criado com autorização do titular em 25/10/2026. Chave exclusiva **Newwed Local Sandbox**, válida até **24/11/2026**, sem operações de saque por API, registrada somente em `.dev.vars` privado. API de situação cadastral retornou HTTP 200 e estados aprovados; nenhuma cobrança/cliente criado. Renovar a chave antes de expirar.
2. Cadastrar webhook HTTPS autenticado por token independente no web; usar `https://api-sandbox.asaas.com/v3` em staging/local. Produção usa `https://api.asaas.com/v3` e outra chave/token.
3. Assinar os eventos de cobrança recebida/confirmada, vencida, cancelada, estornada, estorno pendente e parcial.
4. Aprovar edição, lote, valor, capacidade, vencimento e parcelas. O código não escolhe uma edição comercial real automaticamente.
5. Validar Pix/cartão, parcelas, última vaga, cancelamento/estorno e repetição/ordem de eventos; conferir `externalReference` e IDs de parcelas.

No local, `LOCAL_ASAAS_WEBHOOK=true` acompanha o túnel autorizado: registra/atualiza somente o webhook **Newwed Local Sandbox**, autentica com token independente e pausa antes de encerrar. A URL muda a cada novo túnel; a intenção é persistida antes de criar, permitindo conciliação de resposta incerta sem POST duplicado. Não reativar fila interrompida automaticamente. Produção não foi alterada e `ENABLE_CHECKOUT`, `ENABLE_CONFIRMATION` e `ENABLE_EMAIL` continuam desligados. Ver `LOCAL_VALIDATION.md` para recuperação.

Checkout novo exige conversa e linha UAZAPI do lead. Confirmar o pagamento somente após conciliação financeira; comunicação incerta não altera PAID. Estorno em andamento/parcial fica para revisão e não libera toda a vaga.

## E-mail e observabilidade

Verificar domínio/remetente no Cloudflare Email Service, preservar DNS/MX existentes e restringir remetentes/destinatários do binding. Preencher `EMAIL_FROM`, `EMAIL_REPLY_TO` e domínios internos permitidos. Responsável ativo recebe a notificação; gestores/admins são fallback. Nenhum envio real está autorizado por este documento.

Definir `D1_READ_BUDGET`, `D1_WRITE_BUDGET`, `QUEUE_BUDGET` e `D1_BUDGET_WINDOW=day|month` conforme plano/orçamento aprovado. Coleta agregada de toda a conta via GraphQL a cada 15 minutos; orçamento não definido aparece como indisponível. Em 80% do orçamento com medição recente, o histórico pausa; recebimento ao vivo continua prioritário. O painel exibe idade da medição, backlog real das filas quando disponível e progresso dos crons. Falha de métrica nunca vira consumo zero.

## Ativação

Executar preflight estático e o checklist. Ativar progressivamente recebimento → manual → IA → checkout → confirmação → e-mail. App/comercial devem ter flags iguais; receptor acompanha agente/e-mail. Revisar individualmente operações antigas retidas; nenhuma ativação libera backlog automaticamente.

Importação permanece pausada se a medição de um orçamento já configurado ficar desatualizada, até uma coleta nova confirmar a disponibilidade. Uma medição antiga em 80% nunca libera importação por envelhecer. Pendências históricas legadas usam backoff crescente por tentativa.
