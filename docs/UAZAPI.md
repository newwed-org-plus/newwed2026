# WhatsApp por UAZAPI — onda 14

A área **WhatsApp** do painel permite a administradores e gestores consultar linhas, gerar QR Code, acompanhar o pareamento e confirmar uma desconexão. A Inbox existente guarda e exibe as conversas de cada linha. Novas conversas UAZAPI começam em atendimento humano; o botão **Devolver ao agente** usa o agente OpenAI já existente, quando configurado. OpenRouter e edição de contexto por agente pertencem à próxima fatia.

## Preparação pelo operador

1. Disponibilize uma instância UAZAPI dedicada por linha. A integração usa tokens de instância; não precisa de `admintoken` e não cria instâncias ou contrata serviços.
2. Configure `UAZAPI_INSTANCES` como um JSON com os campos `id`, `name`, `baseUrl` e `token` por linha. `id` deve ser estável, minúsculo, e conter apenas letras, números e hífens; não reutilize o mesmo token em duas linhas. `baseUrl` é somente a origem HTTPS do servidor, sem caminho nem credenciais na URL.
3. Configure `UAZAPI_WEBHOOK_BASE_URL` como a origem HTTPS pública deste aplicativo. Cada linha recebe seu próprio endpoint `/api/webhooks/uazapi/<id>`; não há credencial na URL. Em desenvolvimento, é necessário um endereço HTTPS acessível pelo provider para testar eventos reais.
4. Os dois valores ficam apenas em `.dev.vars` ignorado localmente, ou em Workers Secrets nos Workers web e de eventos. Nunca registre os valores, copie-os para diagnósticos ou exponha-os como `NEXT_PUBLIC_*`/`VITE_*`. Não existe campo para exibir tokens no painel.
5. Aplique a migration `0007` antes de executar o código atualizado. Localmente: `npm run db:migrate:local`. Em produção, use o procedimento de migrations existente com o ambiente production e o artefato correspondente.
6. Publique o Worker web e o consumidor `workers/events.ts` com a mesma configuração de linhas, D1 e Queue. A publicação anterior somente do site não basta: a Inbox depende do consumidor para incorporar eventos e enviar respostas. A infraestrutura e os segredos precisam ser provisionados pelo operador antes de qualquer piloto real.

Exemplo **estrutural**, com valores fictícios que devem ser substituídos somente no arquivo protegido/secret:

```json
[{"id":"atendimento","name":"Atendimento New Wed","baseUrl":"https://SEU-SERVIDOR.uazapi.com","token":"TOKEN-DA-INSTANCIA"}]
```

## Conexão

No painel, abra **WhatsApp**, selecione a linha e clique em **Gerar QR Code**. O backend consulta `/instance/status`, configura o webhook da linha e chama `/instance/connect` sem `phone` apenas se não houver conexão ou tentativa em andamento. O QR vem de consultas a `/instance/status`, atualizadas a cada cinco segundos enquanto a tela está visível. A UI não reinicia tentativas automaticamente. Se uma chamada falhar, o QR anterior é retirado e o operador pode atualizar o estado.

Se a instância já estiver conectada ao cadastrar sua credencial, use **Ativar recebimento** para configurar ou atualizar o callback sem desconectar nem iniciar um novo pareamento. A mesma ação pode ser usada após uma mudança do endereço público.

Somente a imagem PNG do QR e os campos necessários chegam ao navegador. QR, paircode, tokens e o envelope bruto do provider não são persistidos. Identidade exibida vem do JID autenticado retornado pelo status. A operação por linha usa um lease de dois minutos e timeout de quinze segundos por chamada. Uma resposta que perdeu o lease não sobrescreve o estado atual.

**Desconectar** solicita confirmação, chama `/instance/disconnect` e consulta o estado real. Não exclui mensagens ou conversas.

## Histórico e envio

- O webhook autentica o token da instância indicada na rota, comparando hashes de tamanho fixo. Não aceita o token de outra linha. O token é removido antes da persistência.
- `messages` registra recebidos e mensagens enviadas pelo celular. Ecos da API e grupos são filtrados na configuração e também na aplicação. Uma mensagem nova enviada pelo celular pausa o agente da conversa.
- `history` com `event=messages` importa os lotes disponíveis após o pareamento, sem disparar respostas. Preserva o timestamp e não regride a data da última mensagem. A disponibilidade e extensão desse histórico dependem do WhatsApp/UAZAPI; isso não promete a importação completa da agenda ou do histórico antigo.
- Cada conversa UAZAPI tem identidade de linha + telefone. IDs de mensagem incluem a linha; o mesmo contato em dois números não compartilha uma conversa. O vínculo com um lead existente é feito pelo telefone normalizado, sem criar leads comerciais artificialmente.
- Ingressão salva um lote normalizado e uma outbox atomicamente; o consumidor divide o trabalho em grupos de dez antes de publicar eventos individuais. O cron existente recupera publicações pendentes. Repetições são deduplicadas no webhook e em `messages`.
- Respostas da Inbox continuam exigindo claim, dono da conversa, ausência de opt-out e ausência de resposta automática em andamento. O consumidor escolhe UAZAPI pela linha da conversa; conversas Meta continuam usando a integração anterior. O envio UAZAPI usa `/send/text` sem retry automático de um envio incerto.
- `messages_update` atualiza entrega/leitura sem regredir `READ`. Recibos recebidos antes da gravação da mensagem são reaplicados quando o envio ou eco é persistido.
- Grupos, canais, chats identificados somente por LID, download de anexos, sincronização completa de contatos e checkout por UAZAPI ficam fora desta fatia. Anexos sem texto aparecem como marcadores na Inbox; legendas disponíveis são preservadas como texto. O checkout anterior continua usando Meta.

## Validação sem serviços reais

`npm test` cobre contrato/configuração, normalização, respostas com segredos e limites de payload. `npm run test:workers` usa D1/Queue locais e UAZAPI simulada para validar permissões, QR, exclusão mútua, webhooks, isolamento de linhas, histórico, envio e recibos. `npx playwright test tests/visual/admin-whatsapp.spec.ts` cobre a UI em três tamanhos com login local e respostas sintéticas; nenhuma imagem dessa suíte representa um QR de uma conta real.

O teste de uma conta real deve verificar pareamento, mensagem recebida, resposta manual, recibo e reconexão com autorização para o número e para os envios envolvidos. Não coloque QR real nem credenciais em screenshots ou evidências compartilhadas.

## Contratos consultados em 2026-10-19

- [Conectar instância](https://docs.uazapi.com/reference/connectInstance.md)
- [Status e QR](https://docs.uazapi.com/reference/getInstanceStatus.md)
- [Webhook da instância](https://docs.uazapi.com/reference/updateWebhook.md)
- [Mensagens](https://docs.uazapi.com/reference/webhooks/messages.md)
- [Histórico](https://docs.uazapi.com/reference/webhooks/history.md)
- [Entrega e leitura](https://docs.uazapi.com/reference/webhooks/messages_update.md)
- [Envio de texto](https://docs.uazapi.com/reference/sendText.md)

Atendentes OpenRouter e contexto editável: consulte [OPENROUTER.md](OPENROUTER.md). Essa configuração substitui o caminho OpenAI para respostas UAZAPI, mantendo Meta compatível.

Clientes UAZAPI e OpenRouter usam `redirect:manual` e rejeitam 3xx. A verificação real da onda 15 identificou que o runtime alvo não implementa `redirect:error`; tokens não são encaminhados para destinos de redirecionamento.

## Publicar o recebimento antes de obter o servidor UAZAPI

A linha pode ser configurada com `id`, `name` e `token`, omitindo `baseUrl` até o provedor informar a origem correta. Isso autentica e persiste webhooks sem inventar um servidor nem transmitir a credencial a um host desconhecido. QR, status remoto, desconexão e envios falham de forma explícita enquanto a URL não for preenchida; o painel mostra Somente recebimento e não faz polling do provider.

`GET /api/webhooks/uazapi/atendimento` informa disponibilidade da configuração/schema, sem tokens, números ou estado privado. `POST` exige o token da instância no envelope JSON. O GET não comprova que a fila/consumidor processaram uma mensagem; a validação operacional deve verificar ingestão, deduplicação e Inbox com um evento sintético autorizado, sem enviar WhatsApp.

## Diagnóstico público antes da publicação — 2026-10-20

A consulta com Python recebeu HTTP 403 com `error code: 1010` da camada Cloudflare, antes da aplicação. Esse código indica bloqueio pela assinatura do cliente; não comprova que o webhook publicado rejeitaria o provedor. No mesmo endereço, o Chrome mostrou a página 404 do New Wed, e requisições Node HTTP GET e POST sem credencial também retornaram 404. A rota UAZAPI ainda não está no deploy público.

A correção depende de publicar o código preparado, aplicar migrations e configurar o token da linha no ambiente correto. Não desative proteções globais para contornar o resultado de uma única ferramenta. Depois da publicação, valide GET de diagnóstico, POST sem token recusado, POST autenticado, deduplicação e processamento até a Inbox. Avalie qualquer bloqueio do provedor com evidência da requisição real e regra exata, preservando a autenticação do painel e do webhook.

## Consumidor exclusivo de recebimento

O Worker `new-wed-uazapi-receiver` é publicado por `npm run deploy:uazapi`, usando `wrangler.uazapi.jsonc`. Ele consome somente `new-wed-uazapi-production`, com falhas finais em `new-wed-uazapi-dead-production`. O Worker web publica eventos UAZAPI pelo binding `UAZAPI_EVENTS_QUEUE`; eventos comerciais preservam `EVENTS_QUEUE`. Ambientes locais sem o binding dedicado mantêm o fallback existente.

O consumidor processa lotes, mensagens recebidas e recibos, força atendimento humano sem OpenRouter e recupera apenas outboxes UAZAPI no cron. Não executa envio manual, cobrança, e-mail ou resposta automática. Não precisa receber o token da instância nem chaves de provedores. Resumos e demais trabalhos comerciais permanecem na fila anterior, sem consumidor ativado nesta publicação.

Configure `UAZAPI_INSTANCES` e `UAZAPI_WEBHOOK_BASE_URL` como secrets somente no Worker web. Validar o recebimento com evento sintético não envolve `/send/text`, QR, pareamento nem ativação do webhook no provedor. Só liberar a ativação depois de comprovar mensagem única na Inbox e limpar a validação.
