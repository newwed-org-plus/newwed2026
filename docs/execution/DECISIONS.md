# Registro de decisões

## D-001 — Projeto sem legado

O projeto começa vazio. Não haverá migração, conciliação nem compatibilidade Base44.

## D-002 — Qualificação e checkout humanos

Somente um usuário humano pode mover um lead para `QUALIFICADO` e autorizar checkout. O agente pode atender, coletar contexto e gerar handoff, mas não concluir essas ações.

## D-003 — Máquina de checkout

Estados principais: `CREATING → READY → SEND_PENDING → SENT → PENDING → PAID`. Saídas: `FAILED`, `OVERDUE`, `CANCELLED` e `REFUNDED`. A cobrança criada nunca equivale a pagamento.

## D-004 — Pagamentos

Pix é cobrança única. Cartão aceita de 1 até o limite configurado por edição, inicialmente 12. A aprovação inicial do cartão promove o lead a `PAGO`; parcelas posteriores seguem em conciliação financeira.

## D-005 — Inbox v1

A primeira versão oferece lista, busca, transcript, resposta manual, claim/release e falhas. Usa polling de 5 segundos com a página ativa e 30 segundos em segundo plano. WebSocket e roteamento avançado ficam fora da v1.

## D-006 — Contexto do agente

D1 é a fonte de contexto. A OpenAI recebe resumo, 12 mensagens recentes, lead, edição e catálogo com `store:false`. A resposta é estruturada como `{reply, confidence, handoff, reason}`.

## D-007 — Handoff obrigatório

Baixa confiança, intenção de compra, reclamação, pedido humano e falha da OpenAI pausam o agente e encaminham a conversa a uma pessoa.

## D-008 — Confirmação da equipe

No primeiro `PAGO`, criar uma notificação interna e um e-mail. O destinatário primário é o responsável pelo lead; sem responsável, gestores e administradores recebem. Deduplicação impede repetição.

## D-009 — E-mail

Usar o binding nativo Cloudflare `EMAIL`, com HTML e texto, envio por outbox, retry e destinatários/remetentes restritos na configuração.

## D-010 — Serviços externos

Testes automatizados mockam apenas Meta, OpenAI, Asaas e e-mail. Nenhuma mensagem, cobrança, e-mail, deploy ou tráfego real ocorre sem configuração e autorização específicas.

## D-011 — Testes Workers atuais

Usar `@cloudflare/vitest-plugin`, integração oficial para o runtime Workers, em vez do pacote legado `@cloudflare/vitest-pool-workers`. A versão `1.1.9` exige Vitest `^4.1.0`; portanto o projeto fixa Vitest `4.1.x` até que o contrato oficial aceite uma versão posterior. A configuração de teste usa bindings Miniflare explícitos e nunca carrega `.dev.vars`.

## D-012 — Estado do checkout em três eixos

`checkouts.status` representa a máquina técnica; `financial_status` representa a situação financeira e `send_status` representa o envio no WhatsApp. Os eixos não são inferidos um do outro, e timestamps registram cada marco.

## D-013 — Transições manuais e concorrência

`CHECKOUT_ENVIADO`, `AGUARDANDO_PAGAMENTO` e `PAGO` são etapas exclusivas das integrações. A API humana usa atualização otimista por etapa anterior; histórico, auditoria e tarefa só são inseridos quando a atualização modifica exatamente um lead.

## D-014 — Compatibilidade temporária da conversa

`conversations.mode` (`AGENT` ou `HUMAN`) é o estado autoritativo. `human_active` permanece apenas como espelho temporário para compatibilidade de rollout; nenhum fluxo decide por esse campo.

## D-015 — Checkout assíncrono e recuperável

A API apenas reserva a vaga e persiste checkout/outbox, retornando `202`. A Queue consulta o Asaas por `externalReference` antes de criar a cobrança. Leases, backoff e outbox permitem retomar falhas sem repetir a cobrança.

## D-016 — Aceite, entrega e pagamento são eventos distintos

`READY` indica cobrança válida; `SENT` e `CHECKOUT_ENVIADO` exigem aceite da Meta; `PENDING` e `AGUARDANDO_PAGAMENTO` exigem entrega Meta ou marcação humana auditada. Somente evento financeiro conciliado gera `PAGO`.

## D-017 — Cancelamento encerra cobranças abertas

Expiração ou cancelamento libera a reserva local e agenda a remoção da cobrança no Asaas. Cobrança única usa `/payments/:id`; parcelamento remove cobranças pendentes/vencidas por `/installments/:id/payments`. Uma confirmação financeira observada durante a corrida prevalece e volta à conciliação de capacidade.

## D-018 — Exclusão mútua agente/humano

O claim muda imediatamente a conversa para `HUMAN`, mas preserva um lease automático já em andamento até o worker observar a pausa. Enquanto esse lease existir, a API manual não aceita resposta. Assim, agente e vendedor não obtêm simultaneamente permissão de envio.

## D-019 — Ingestão Meta recuperável

Mensagem recebida e cada estado Meta usam identificadores de webhook distintos e outbox persistente antes da publicação na Queue. Repetição é segura, e eventos `sent`, `delivered` e `read` do mesmo message ID não colidem.

## D-020 — Rate limit persistente

Os limites v1 usam buckets atômicos no D1 e armazenam somente hashes de IP/identidade. Isso mantém comportamento determinístico em testes e entre instâncias; um binding nativo de Rate Limiting pode ser adicionado como primeira barreira após a criação dos recursos externos.

## D-021 — Correlação operacional

Cada entrada pública, autorização de checkout e webhook recebe `requestId`, devolvido em `x-request-id` e propagado por D1/outbox até conversa, mensagem e notificação. Payloads reais e segredos não entram em logs nem checkpoints.

## D-022 — Restrições de e-mail

O Worker de eventos aceita somente o remetente `marketing@newwed.com.br` e, até o provisionamento operacional, os dois destinatários públicos conhecidos. A allowlist deve ser substituída pelos usuários aprovados antes do piloto; destinatários fora dela falham de forma visível e retomável pela outbox.

## D-023 — Eventos financeiros fora de ordem

`REFUNDED` é terminal na conciliação local. Um pagamento já `PAID` não pode regredir por eventos posteriores `PENDING`, `OVERDUE` ou `CANCELLED`; somente um estorno explícito o altera. Isso vale tanto para webhooks quanto para snapshots recuperados durante a criação.

## D-024 — Lançamento exige gate humano

O código pode preparar e validar estaticamente staging/produção, mas não cria recursos, publica Workers nem gera tráfego de Meta, Asaas ou e-mail. Esses passos exigem IDs/credenciais externos e autorização específica registrada para a janela de validação ou piloto.

## D-025 — Página inicial institucional da onda 6

A página inicial institucional replica a composição da referência fornecida pelo usuário, mas usa branco e tons neutros em vez das cores oficiais. A referência passa a definir o conteúdo dos quatro indicadores dessa página. O hero usa uma foto editorial gerada sem texto ou logotipo; os demais retratos e fotos continuam sendo os arquivos do projeto. A mudança visual fica limitada à página inicial, pois não há referência de layout para as outras rotas.

## D-026 — Publicação inicial sem R2

Em 2026-09-30, o usuário autorizou a publicação do site na conta Cloudflare New Wed e escolheu não ativar a assinatura R2. O ambiente production mantém D1, Queue e assets do build, sem binding R2; desenvolvimento e staging preservam seus contratos. O consumidor de eventos e as integrações comerciais permanecem pendentes de configuração. O deploy utiliza o build já selecionado para production, sem recompilar no ambiente padrão.

## D-027 — Domínio institucional preservando DNS legado

Em 2026-09-30, o usuário solicitou conectar o domínio existente `newwed.com.br`. O apex possui A proxied para `70.38.123.170`, www é CNAME proxied para o apex e mail é CNAME DNS-only para o apex. Usar rotas Workers específicas `newwed.com.br/*` e `www.newwed.com.br/*` preserva esses destinos DNS, os registros de e-mail e os demais serviços do servidor. O Worker atende integralmente os caminhos web com seus assets; falhas permanecem fechadas, sem fallback para o site antigo. As duas rotas ficam no ambiente production do Wrangler para os deploys automáticos.

## D-028 — Institucional atual com navegação por seções

O usuário retirou o institucional escuro em 2026-09-30. Os menus do institucional branco passam a navegar por âncoras sobre, feira, destinos, guia, workshop e contato. As seis URLs antigas redirecionam para as respectivas âncoras, sem renderizar o conteúdo retirado. Destinos conecta a landing FAMTOUR; as demais chamadas de projetos conduzem ao contato atual. A composição da home e a operação da landing/admin são preservadas. A navegação da FAMTOUR segue D-029.

## D-029 — FAMTOUR navega dentro da própria landing

O usuário esclareceu que a navbar da FAMTOUR deve permanecer na landing. Navbar e rodapé usam seções Sobre o FAMTOUR, Edições anteriores, Edições abertas e Parceiros; Falar com a equipe conduz ao formulário. Na landing, âncoras locais preservam a edição selecionada na query string. Em páginas de galeria e inscrição, os mesmos links retornam a `/famtour#<seção>`. A marca retorna ao início da landing. Os alvos possuem margem para a navbar fixa e o menu mobile fecha após o clique.


## D-030 — Tipografia oficial local

A solicitação de 2026-10-14 aplica os arquivos oficiais fornecidos pelo cliente: Fedra Sans Std Light 300, Book 350 e Bold 700, e BlockGothicRR Medium Extra Cond 500 exclusivamente no título de destaque FAMTOUR. As quatro faces ficam em `public/assets/fonts` e são servidas pelo próprio site, sem Google Fonts. Utilitários de peso normal/medium usam Book; semibold/bold usam Bold. `font-synthesis: none` impede pesos e itálicos artificiais. O alias de CSS `font-serif` permanece por compatibilidade de componentes, mas passa a usar Fedra.

## D-031 — CTAs e retorno institucional explícitos

A solicitação de 2026-10-14 complementa D-029: a marca e os menus de seção continuam dentro da FAMTOUR; links separados Grupo New Wed e Projetos levam a `/` e `/#projetos`. Eles ficam no cabeçalho da landing/galerias, no rodapé e no cabeçalho da página de edição. Os cards usam Solicitar informações para selecionar a edição no formulário de contato e Ver informações da edição para os detalhes atuais. O formulário de inscrição continua sendo uma prévia, sem envio ou cobrança; o CTA não promete inscrição funcional.


## D-032 — Páginas próprias dos projetos institucionais

Em 2026-10-15, o usuário confirmou a solicitação do cliente e autorizou corrigir e publicar a navegação dos projetos. Esta decisão substitui D-028 para Feira, Guia e Workshop: `/feira`, `/guia` e `/workshop` voltam a renderizar páginas próprias com conteúdo recuperado do histórico anterior à onda 8, adaptado à paleta branca e às fontes oficiais. Cards e menus desktop/mobile abrem essas rotas; Destinos segue em `/famtour`. Sobre e Contato continuam como seções da home. As páginas incluem retorno a `/#projetos` e contato contextualizado com a equipe. Nenhum envio, cobrança, alteração de schema ou publicação do consumidor de eventos faz parte deste fix.


## D-033 — Login próprio de administração

Em 2026-10-15, após o onboarding do Zero Trust ficar bloqueado, o usuário solicitou autenticação própria por e-mail e senha. `/admin/login` passa a criar sessões D1 de oito horas; `/admin` e todas as APIs mantêm autorização por usuário ativo e papéis. A migration `0006` adiciona credenciais scrypt com salt e sessões cujo token é armazenado somente como hash. Provisionamento é uma operação explícita do operador, sem cadastro público, bootstrap automático nem credenciais versionadas. Logout revoga a sessão no servidor; rotação revoga todas as sessões do usuário. Login tem limite por IP em D1 e por identidade em Durable Object SQLite, e mutações com cookie exigem mesma origem. O RPC privado executa scrypt com o limite de CPU próprio de DO, compatível com o Workers Free sem assinatura; o handler HTTP delega a derivação. Access permanece compatível para usuários provisionados, validando issuer, audience e identidade assinada. Nenhuma assinatura Zero Trust, envio comercial ou consumidor de eventos faz parte desta onda.

## D-034 — Identidade visual e materiais de 15 de outubro

O usuário pediu executar os ajustes visuais enviados hoje na conversa indicada do WhatsApp. Aplicar o logo script oficial e seu marsala `#70112b` nos cabeçalhos em uso e nos botões institucionais; os quatro banners oficiais substituem as imagens da home sem sobrepor marcas duplicadas e preservam seus links. A foto fornecida entra na seção inferior sobre Cindy, com enquadramento que preserva o rosto. Parceiros da FAMTOUR usam fundo claro e grade fixa de duas colunas no mobile e quatro a partir de 768px, com superfícies escuras para as versões brancas oficiais. A marca da navbar FAMTOUR passa a retornar à home `/`, substituindo somente essa parte de D-029/D-031; menus e rodapé continuam locais. O usuário esclareceu que o vídeo principal será incluído depois: manter a imagem atual até receber o material, sem vídeo fictício ou chamada sem destino. O resumo de uma branch externa serve como referência; seus arquivos/branch não estão presentes no repositório canônico. Assets são entregues pelo próprio build, preservando a publicação sem R2.


## D-035 — UAZAPI por linha e reaproveitamento da Inbox

Em 2026-10-19, o usuário autorizou iniciar a implementação faltante por UAZAPI e conexão QR, reaproveitando o histórico e a Inbox. Cada linha usa token de instância configurado somente no servidor por `UAZAPI_INSTANCES`; a origem pública dos callbacks fica em `UAZAPI_WEBHOOK_BASE_URL`. Não há uso de admintoken, criação de instâncias, contratação ou exposição de tokens no painel. A migration `0007` adiciona metadados operacionais e a identidade da linha na conversa, preservando as conversas Meta. QR é efêmero, somente PNG e obtido de `/instance/status`; não é salvo no banco, logs ou evidências reais. Webhooks validam o token da linha antes de persistir somente campos normalizados. Ingressão, outbox e fan-out limitado preservam deduplicação e recuperação; importação de histórico não produz respostas. Conversas novas começam humanas; mensagens enviadas pelo celular pausam o agente. Respostas da Inbox são roteadas pela linha e recibos fora de ordem não regridem leitura. A implementação e validação usam UAZAPI simulada, ampliando D-010 para esse provider. Conexão de conta real e envio externo permanecem pendentes de configuração e autorização específica. OpenRouter, contexto editável por agente e sincronização completa de contatos ficam na próxima fatia.

## D-036 — Atendentes por linha com OpenRouter gratuito

Em 2026-10-19, o usuário solicitou priorizar OpenRouter e modelos gratuitos para atendentes WhatsApp com contexto editável. A migration `0008` cria atendentes com vínculo opcional e exclusivo por linha UAZAPI; rascunhos independem da conexão WhatsApp. Admin/gestor editam contexto/modelo e testam uma mensagem sem histórico de cliente nem envio. `OPENROUTER_API_KEY` permanece apenas no servidor. A cada geração, o catálogo deve confirmar um modelo de texto `:free` ou `openrouter/free` com preços zero; o pedido impõe teto zero e não usa fallback pago/plugins. Isso substitui D-006 para linhas UAZAPI, preservando OpenAI no caminho Meta. Histórico, resumo e mensagens recentes continuam no D1 existente. Conversas novas entram automáticas somente quando houver configuração habilitada e chave; histórico e conversas humanas não são promovidos. Falhas/JSON inválido/cota esgotada pausam para humano. Desativação/desvinculação pausa conversas; a checagem de versão/identidade antes do envio impede geração obsoleta de responder. Sem publicação ou WhatsApp real nesta onda. O usuário autorizou criar uma chave dedicada com teto US$ 0/30 dias, guardar localmente e testar somente mensagem fictícia.

A validação real no painel identificou que o workerd alvo aceita apenas `follow/manual` em redirect: os clientes OpenRouter e UAZAPI usam `manual` e rejeitam 3xx para preservar credenciais. O contexto institucional editado pela equipe é conhecimento confiável em mensagem de sistema; histórico/mensagem atual são dados separados. Ausência de catálogo não exige handoff para perguntas institucionais que o contexto já responde.

## D-037 — Publicação UAZAPI limitada ao recebimento

Em 2026-10-20, o usuário retomou a correção do webhook e autorizou o Wrangler na conta New Wed, em perfil exclusivo. Publicar o receptor e migrations 0007/0008 sem ativar as integrações comerciais: eventos UAZAPI usam fila/consumidor próprios, com DLQ, e o cron recupera apenas essa família. O consumidor força atendimento humano sem chave OpenRouter, não processa envios, e-mail ou cobrança e não recebe credenciais de provedores. A fila comercial permanece sem consumidor. A ativação do webhook no provedor deve aguardar autenticação, deduplicação, ingestão até a Inbox e limpeza de um evento sintético; QR, pareamento e mensagens reais não fazem parte desta autorização.

## D-038 — Estado conectado com JID textual UAZAPI

Em 2026-10-20, a conexão real confirmou que `/instance/status` retorna `status.jid` textual com sufixo de dispositivo. O parser passa a aceitar texto e o objeto legado com user, sem alterar o estado no provider. O número é extraído somente de um JID individual válido e somente no estado connected; grupos/LIDs não viram telefones. Essa correção utiliza apenas refresh/GET e não reconecta, desconecta, gera QR nem envia mensagens.

## D-039 — Novo QR somente por ação explícita

Em 2026-10-21, o usuário relatou que o WhatsApp rejeitou o QR. As consultas consecutivas ao status retornaram a mesma imagem, e a tentativa passou a `disconnected`; a UI não tinha ação para substituir um QR de uma tentativa pendente. Quando o operador pedir outro QR, a UI oferece **Gerar novo QR Code** somente em `connecting`. O backend usa o lock por linha, confirma o estado antes de desconectar, verifica a desconexão e só então inicia uma nova conexão QR. Não há renovação automática nem envio de mensagens. A ação pode habilitar o webhook configurado para recebimento.

## D-040 — Polling de status somente durante conexão

Em 2026-10-21, o usuário confirmou a linha conectada e relatou o botão **Atualizar estado** sendo acionado repetidamente. A UI fazia refresh automático a cada cinco segundos sem considerar o estado. Faça uma consulta inicial ao abrir/selecionar a linha e mantenha polling somente enquanto `connecting`; pare ao conectar, desconectar ou pausar. A atualização manual permanece disponível. Não desconecte a linha nem altere o webhook.

## D-041 — Importação de histórico sem Queue por mensagem

Em 2026-10-21, a UAZAPI confirmou a linha conectada, mas a Inbox local estava vazia. O callback configurado apontava ao domínio publicado, enquanto `localhost:4173` usa um D1 isolado; a consulta somente de contagens encontrou 236 conversas e 9.401 mensagens no D1 publicado, contra zero local. Também havia 201 mensagens históricas pendentes após a Queue exceder o limite diário de escrita. Processe o histórico em grupos limitados diretamente no D1 e recupere eventos pendentes pelo cron, sem respostas automáticas ou cópia de dados reais para o D1 local.

## D-042 — Conclusão comercial com UAZAPI

Em 2026-10-25, o usuário aprovou atendimento, checkout e confirmação textual na mesma linha UAZAPI. Qualificação e autorização de cobrança continuam humanas. Novos checkouts vinculam conversa e linha; checkouts Meta anteriores permanecem conciliáveis. Anexos, agenda, grupos e LID ficam fora desta versão. Manter a imagem do hero até receber o vídeo.

## D-043 — Liberação progressiva e proteção do backlog

Envio manual, agente, checkout, confirmação e e-mail possuem controles independentes, desligados por padrão. Operações anteriores à ativação ficam retidas para revisão, nunca são disparadas só porque o consumidor foi publicado. Aceite incerto exige reconciliação e não reenvio automático. O receptor de entrada continua sem credenciais externas.

## D-044 — Capacidade e validação local

Otimizar e medir antes de propor capacidade paga; contratação exige orçamento aprovado. Homologação usa D1 e filas isolados, sem R2. O usuário escolheu testar localmente; Asaas sandbox e e-mail ainda precisam ser preparados. Validar código com fixtures sintéticas sem substituir testes externos por resultados simulados. Não redirecionar o webhook da linha ativa ao localhost.

## D-045 — Confirmação e estorno sem repetição cega

A confirmação textual do pagamento tem identidade estável por checkout e usa exclusivamente a conversa/linha UAZAPI autorizadas na criação. Resultado incerto é conciliado individualmente; falha conhecida pode ser reenviada por ação auditada. O estado de comunicação não desfaz PAID. Estorno solicitado/em andamento/parcial não libera toda a vaga; somente o evento de estorno concluído faz essa transição, e eventos de pagamento atrasados não revertem REFUNDED.
