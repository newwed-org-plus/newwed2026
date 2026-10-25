# Atendentes WhatsApp com OpenRouter

## Preparação local

1. Aplique `npm run db:migrate:local` (migration `0008`).
2. Configure `OPENROUTER_API_KEY` somente em `.dev.vars`, ignorado pelo Git e com permissão 0600. Nunca coloque a chave em contexto, screenshots, banco, logs ou código do navegador. Reinicie o servidor depois de alterar o segredo.
3. No painel `/admin`, abra **Atendentes**, clique em **Novo atendente**, defina nome, contexto e modelo gratuito e salve. É possível preparar vários rascunhos sem UAZAPI nem chave.
4. **Testar resposta** usa somente o contexto salvo e a mensagem digitada. Não lê conversas de clientes nem envia WhatsApp; consome a cota gratuita de uma chamada de geração.
5. Após configurar a UAZAPI conforme `UAZAPI.md`, selecione a linha. Cada linha aceita um atendente. Ative **Atender novos contatos automaticamente** e salve para atender novas conversas ao vivo. Histórico importado não responde; conversas já humanas exigem devolução explícita pela Inbox.

Nome e contexto são editáveis por admin/gestor. O contexto da equipe fornece o conhecimento institucional e orientações em mensagem de sistema; mensagens de clientes continuam separadas como dados. Preços, vagas e datas dependem exclusivamente do catálogo comercial verificado. O catálogo de modelos é consultado ao abrir a aba e pode ser atualizado. A edição usa versão otimista; um conflito exige atualizar antes de sobrescrever. Ao mudar uma linha, a ativação é desmarcada na interface.

## Operação

- O catálogo vem de `GET https://openrouter.ai/api/v1/models`; somente `openrouter/free` ou variantes `:free` com suporte a resposta JSON, entrada/saída de texto e todos os preços informados iguais a zero entram na lista. Cada geração confirma a gratuidade atual novamente.
- O backend usa `POST /api/v1/chat/completions`, teto de preço zero para entrada/saída/requisição, sem fallback pago, ferramentas ou plugins. Não há compra de créditos nem assinatura. Os clientes usam `redirect:manual` e recusam respostas 3xx, sem encaminhar credenciais; o runtime workerd local não aceita `redirect:error`.
- A configuração local não publica Workers nem envia segredos para produção. No ambiente implantado, o Worker web (teste/edição) e o Worker de eventos (respostas/resumos) precisam do mesmo segredo, schema e configuração de linhas.
- O worker reutiliza D1: catálogo aberto, lead relacionado, resumo e as 12 mensagens mais recentes. Conversas UAZAPI usam OpenRouter; o caminho Meta existente mantém OpenAI.
- Resumos UAZAPI usam o modelo gratuito da linha, até 40 mensagens e resumo anterior. Ficam sem geração enquanto o atendente estiver pausado ou sem chave. As mensagens completas continuam no histórico da Inbox.
- Resposta deve ser JSON validado; saída inválida/truncada, cota esgotada, timeout ou indisponibilidade pausam o agente sem repetir o envio. A equipe vê a falha na Inbox. Baixa confiança, compra, reclamação e pedido humano produzem handoff.
- Claim humano, mensagem enviada pelo celular e opt-out continuam autoritativos. Desativar/desvincular o atendente pausa as conversas automáticas da linha antiga. Antes de enviar, o worker confere novamente modo, claim, lease e identidade/versão da configuração.
- Alterar contexto/modelo invalida uma geração ainda em andamento; a próxima mensagem utiliza a versão salva. Habilitar o agente não retira conversas de um humano.
- Modelos gratuitos têm cotas e disponibilidade variáveis. Não existe promessa de capacidade ou SLA; consulte os limites atuais da conta. Respostas e resumos consomem cotas separadamente.

## Validação

`tests/unit/openrouter.test.ts` valida filtragem de preços, saída, falta de chave e erros sanitizados. `tests/workers/openrouter.test.ts` usa D1/Queues reais locais com providers simulados: RBAC/CSRF, rascunho, versionamento, exclusividade por linha, teste sem envio, ingestão/resposta/resumo e desativação durante geração. `tests/visual/admin-agents.spec.ts` verifica criação, contexto, modelo, teste, vínculo e pausa em mobile/tablet/desktop.

Testes automatizados nunca carregam credenciais reais. Testes reais devem usar uma mensagem fictícia e a janela explicitamente autorizada pelo usuário; não use WhatsApp como teste sem número/destinatário autorizado.

## Referências oficiais

- [Catálogo de modelos](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)
- [Chat completions](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion)
- [Modelos gratuitos](https://openrouter.ai/docs/guides/routing/model-variants/free)
- [Roteamento e teto de preço](https://openrouter.ai/docs/guides/routing/provider-selection)
- [Cotas e limites](https://openrouter.ai/docs/api_reference/limits)
- [Segredos Workers](https://developers.cloudflare.com/workers/configuration/secrets/)

## Recuperação gratuita e conhecimento do site (onda 29)

Aplicar as migrations até **0016** antes de usar esta versão. `ENABLE_FREE_AI_RETRY=true` habilita a recuperação no perfil privado local; os configs remotos continuam desligados. A decisão D-049 substitui o handoff automático por 429 descrito acima somente quando essa função está habilitada.

- 429 explícito de upstream ou 503 permitem até três tentativas por execução entre modelos atualmente verificados com todos os preços iguais a zero. Teto de preço zero e ausência de ferramentas/plugins continuam obrigatórios. Cota global/diária não troca de modelo para contornar o limite.
- `Retry-After` em segundos/data e `x-ratelimit-reset` definem a espera; sem indicação, aguardar um minuto, ou a próxima meia-noite UTC para limite diário. Cooldowns por conta/modelo e espaçamento mínimo de quatro segundos ficam persistidos no D1, compartilhados por prévias e consumidor. Falhas também podem consumir cota.
- A resposta pendente fica no outbox com próxima tentativa. A Inbox mostra **IA aguardando disponibilidade gratuita** e o horário mínimo; o cron retoma quando permitido. A espera não consome o orçamento de dez falhas de execução. Perguntas substituídas ou com mais de 48 horas expiram; não enviar respostas antigas indefinidamente.
- Claim, opt-out, pausa e versão do atendente são rechecados; nova pergunta durante geração cancela a resposta antiga. Aceite/entrega anteriores e resultado incerto bloqueiam replay. Habilitar a função não libera backlog retido nem conversas humanas.
- Resumos UAZAPI passam a ser extrativos locais, preservando até 40 falas recentes sem consumir geração. Perguntas institucionais claras podem usar respostas da base compartilhada, também sem geração.
- `src/content/` é a fonte comum das páginas e da IA: Feira Tendência, Destinos/FAMTOUR, Guia, Workshop, seus formatos e quatro edições publicadas. O modelo recebe essa base na mensagem de sistema. Conteúdo legado não montado não é ingerido. Fixtures VALIDACAO/demonstração são excluídas do catálogo operacional.
- Preços/datas/parcelas anunciados são referências da LP; capacidade publicada não significa vagas restantes. Não há preço público de Feira/Guia/Workshop: consultar equipe/mídia kit. Compra, reclamação, pedido humano, saída inválida e incerteza continuam sujeitos ao handoff; indisponibilidade temporária da geração aguarda.
- Para uma pergunta real que falhou antes desta função, a gestão pode **explicitamente** devolver a conversa autorizada ao agente e chamar `POST /api/admin/conversations/:id/retry-agent`. Disponível apenas no perfil local, exige sessão, mesma origem, allowlist e pergunta ao vivo recente sem OUT posterior. Repetição da ação não cria outra operação; histórico, opt-out e envio incerto são recusados. Não há reabertura automática em massa.

A prévia pode usar até três tentativas gratuitas quando houver falha de upstream. Sem disponibilidade gratuita, é necessário aguardar; não há promessa de respostas ilimitadas. Testes em `free-ai-recovery.test.ts` cobrem limites, teto zero, persistência, retomada, concorrência, deduplicação e conteúdo compartilhado. Referência: [erros e Retry-After](https://openrouter.ai/docs/api_reference/errors-and-debugging).

Quando a busca de cache chega antes do callback, somente o envelope ao vivo autenticado da mesma mensagem pode promover o registro e iniciar uma resposta elegível. O histórico isolado nunca inicia automação; o recebimento ao vivo posterior mantém deduplicação e controles humanos.
