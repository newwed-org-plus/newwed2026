# Validação local

Execute no checkout da onda 27. O banco e os consumidores são locais. A UAZAPI é externa; para receber eventos em localhost é necessário um túnel HTTPS. Redirecionar uma linha exige autorização do titular. A linha atendimento foi explicitamente autorizada nesta sessão (D-047).

```bash
npm ci
npm run local:prepare
npm run dev:local
```

Abrir `http://127.0.0.1:4173/admin`. `local:prepare` aplica migrations somente ao D1 local e inclui a edição **VALIDACAO local — demonstração**, um lead e uma conversa sintética. A linha da fixture não tem provider e permanece desconectada. Repetir a preparação preserva registros já existentes. A fixture é exclusivamente de desenvolvimento e nunca deve ser aplicada remotamente.

O login local provisionado nesta sessão é `admin@newwed.local`; a senha não é versionada. Para outra conta, provisionar a própria conta local com `npx tsx scripts/provision-admin.ts <seu-email> --local`; a senha será pedida de forma oculta. Não enviar a senha pelo chat. O bypass de desenvolvimento existente é restrito à configuração local; produção sempre exige autenticação.

## O que revisar na interface

1. Pipeline: abrir a ficha VALIDACAO, revisar histórico, tarefas, responsável e qualificação humana.
2. Inbox: abrir a conversa sintética, conferir ambiente/recebimento, assumir e devolver. Com funções pausadas, envio não é executado.
3. Checkout: selecionar explicitamente uma conversa UAZAPI válida. A linha de demonstração não é elegível para uma cobrança real. A interface informa pausas/erros da função.
4. Relatórios: conferir contagens, operação retida, execução de cron ainda não registrada e cota indisponível sem configuração. Dado indisponível não é lista vazia nem consumo zero.
5. Formulário: revisar campos, consentimento e edição. `ENABLE_PUBLIC_LEADS` está desligado por padrão; habilitar somente em configuração local para persistir inscrições. Turnstile sem secret é permitido exclusivamente em desenvolvimento.

O banco local é independente de produção. Com callback local ativo, os novos eventos da linha autorizada chegam ao computador. Fixtures e testes automatizados continuam sintéticos; não capturar telas ou logs contendo conversas reais.

## Fluxo completo reproduzível com providers simulados

```bash
npm test
npm run test:workers
npm run test:recovery
npm run test:visual
```

Workers executa D1/Queue/Durable Objects locais e intercepta providers: inscrição → atendimento → qualificação → checkout UAZAPI → recibo → pagamento → confirmação única. Inclui Pix/cartão/parcelas, concorrência, estorno, timeout, retenção e reconciliação. Nenhuma credencial real de `.dev.vars` é carregada pela configuração Workers.

O teste de capacidade concorrente usa 28 mensagens ao vivo, dois logins e orçamento histórico de 100 por cron; a retomada chega a 148 mensagens únicas sem saída automática. Testes de interface usam fixtures autenticadas e três viewports. Backup/restauração são exercitados em bancos temporários separados e limpos ao terminar.

Para validação comercial externa ainda são necessários Asaas sandbox, e-mail verificado, Turnstile e linha de teste própria em homologação, além da janela/destinatários aprovados. Os testes simulados não aprovam produção nem substituem o piloto de 24 horas.

## Receber e responder pela UAZAPI no localhost

1. Guardar `UAZAPI_INSTANCES`, `UAZAPI_WEBHOOK_BASE_URL` e, se utilizado, `OPENROUTER_API_KEY` somente em `.dev.vars` ignorado. Configurar `LOCAL_TEST_MODE=true`; `dev:local` gera `LOCAL_CRON_TOKEN` privado.
2. Para iniciar o túnel autorizado automaticamente: definir `LOCAL_UAZAPI_CALLBACK=true` e `LOCAL_UAZAPI_LINE=atendimento` nesse arquivo e executar `npm run local:tunnel:install` uma vez. O instalador suporta macOS e verifica o digest do release oficial do cloudflared.
3. Executar `npm run dev:local`. Este comando inicia aplicação em 127.0.0.1:4173, receptor, consumidor comercial e cron a cada 15 segundos com o mesmo D1 e filas locais. O receptor não recebe chaves de envio ou IA. Não iniciar outra instância do túnel simultaneamente.
4. Aguardar a confirmação de callback local no terminal. A ponte publica exclusivamente `/api/webhooks/uazapi/<linha>`; `/admin`, arquivos e depuração não ficam públicos. Não é necessário deploy, reconectar a linha ou gerar QR.
5. Manter o processo e o computador disponíveis durante o teste. Ao encerrar normalmente, o launcher restaura o callback anterior antes de parar os serviços, somente se a URL ainda pertencer ao túnel atual. Sem rede, a restauração fica pendente e o processo mantém os serviços ativos para outra tentativa.

O controle manual exige `ENABLE_MANUAL_SEND=true`. A exceção `LOCAL_ALLOW_MANUAL_SEND_ANY=true` permite exclusivamente a resposta escolhida pelo operador autenticado e responsável pela conversa. IA e outros envios automáticos continuam limitados por `LOCAL_WHATSAPP_ALLOWED_RECIPIENTS`; lista vazia bloqueia automação real. Não reenviar operações com resultado incerto. Checkout, confirmação e e-mail ficam desligados neste perfil até a preparação própria.

## Histórico e recuperação local

A tela WhatsApp permite **Importar histórico disponível** e mostra contagens reais. O pull usa `/message/find`, cursor persistido, lock e orçamento configurável de 100 mensagens por cron. Não depende de Queue por mensagem nem inicia respostas automáticas. O cache recente é reconciliado em desenvolvimento; isso reduz lacunas curtas de callback, mas não garante recuperar indisponibilidade prolongada.

A lista de conversas e o conteúdo antigo do celular são fontes diferentes. `npm run local:history -- atendimento` importa metadados individuais e solicita mensagens antigas ao WhatsApp, com estado privado persistido. Se retornar pending/sem dados, é necessário que o aparelho disponibilize o histórico; não significa importação completa. Quando houver acesso ao celular, `npm run local:history -- atendimento --retry-limited` retoma pendências sem reconexão nem reenvio. Não repetir esse helper enquanto o aparelho estiver indisponível.

O backup do callback e o progresso contêm dados privados e ficam exclusivamente em `.local-runtime/`. Encerramento forçado (SIGKILL), perda de energia/rede ou fechamento abrupto podem impedir a restauração. Nessa situação, manter o túnel disponível se possível e restaurar a configuração anterior pelo painel UAZAPI usando o backup privado; conferir o destino antes de encerrar o transporte. Nunca substituir uma configuração que outro operador já tenha alterado. A UAZAPI informa que falhas HTTP de webhook não são reenviadas automaticamente.


## Entrega e IA no perfil local

`ENABLE_MESSAGE_STATUS_SYNC=true` habilita a conciliação de estados na aplicação e no consumidor locais. Os configs remotos mantêm a função desligada até a migration 0015 e a liberação próprias. O cron consulta no máximo dez mensagens por execução, com cooldown de um minuto; falha do provider mantém o último estado conhecido. **Conferir entrega** consulta a UAZAPI sem repetir o envio. Somente **Entregue** e **Lida** confirmam recebimento; **Aceita para envio** e **Enviada** ainda aguardam essa confirmação.

Reinícios do runtime local retornam 503 estável, com repetição limitada apenas de leituras. Se a conexão cair durante uma ação, conferir o histórico antes de repetir; a chave de idempotência da mensagem é preservada. Erros reais de compilação continuam sendo exibidos.

Para IA, vincular/ativar o atendente, preservar o contexto e escolher um modelo gratuito validado. A conversa de teste deve ser devolvida ao agente; as demais permanecem humanas, e a allowlist local aceita somente a mesma identidade brasileira com/sem o nono dígito. A pergunta deve vir do WhatsApp do contato para a linha conectada. Responder manualmente pela Inbox ou importar histórico não inicia IA. Ao assumir a conversa, a IA pausa. Limite/falha do modelo encaminha ao humano, sem fallback pago.

### Recuperação de 429 sem custo

Depois da migration 0016, habilitar `ENABLE_FREE_AI_RETRY=true` no perfil privado local. Com essa função, a frase anterior sobre handoff por limite é substituída por espera durável: Inbox mostra o horário mínimo, cron tenta novamente, preservando o modo Agente e o controle humano. Somente modelos gratuitos verificados são candidatos; cota diária/global exige aguardar. Não comprar créditos nem tentar contornar o limite. Resumos extrativos e FAQs oficiais reduzem consumo. Ver `docs/OPENROUTER.md` para limites, retomada explícita de uma pergunta antiga e salvaguardas. Produção/homologação permanecem com a função desligada.
