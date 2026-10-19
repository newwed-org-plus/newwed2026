# Status de execução

Atualizado em: 2026-10-19

## Estado geral

- Onda atual: onda 15, atendentes WhatsApp com OpenRouter gratuito.
- Branch: `codex/wave-15-openrouter-agents`; base local na onda 14 em `a593cb5`.
- Dados legados: inexistentes; o projeto começa vazio.
- Usuário autorizou deploy, conexão GitHub restrita ao repositório, publicação sem R2 e conexão do domínio existente em 2026-09-30.

## Concluído antes das ondas

- Institucional, FAMTOUR, formulário e dashboard existentes, com schema D1 comercial e integrações iniciais; 20 unitários e 33 baselines no início.

## Ondas 0–5 concluídas

- Contexto recuperável, schema D1, checkout assíncrono, outbox, assinatura/deduplicação de webhooks, inbox humana/agente, relatórios, tarefas e notificações implantados.
- Gates finais: 64 unitários, 18 invariantes D1, 6 cenários Workers, build, 33 visuais e auditoria aprovados no momento dessas ondas.
- Commits e evidências detalhadas em `checkpoints/CP-00.md` a `CP-05.md`; CI final `34864801713`.

## Onda 6 validada localmente

- Home institucional branca segue a referência editorial, com quatro projetos, indicadores, Cindy e chamada final; commit `127f1f3`.
- Gate local aprovado; sem schema, envio externo ou deploy nessa onda. Detalhes em `checkpoints/CP-06.md`.

## Onda 7 publicada

- Conta Cloudflare New Wed: `41245f76790f4922487ec395c9e3bcec`.
- D1 production criado: `2263d378-59c9-4e5a-8d9b-a6e0140767dd`.
- Queue production criada: `8e18d7f59d554826bb425c633c6441fa`.
- R2 production removido por escolha explícita do usuário; assets continuam no build.
- Publicação inicial: `e6a6614`; configuração de domínio publicada em `2d768bd`, Worker version `0cfbd22d-62b6-4f47-ad63-12decbb102d5`.
- Workers Build `f96de1e2-3067-4a1d-bb3c-aeee80de073d` aprovado às 16:43 de 2026-09-30 (America/Recife).
- CI GitHub `36767408991` aprovado; site em `https://new-wed-platform-production.royal-leaf-8110.workers.dev`.
- Migrations 0000–0005 confirmadas no console D1; oito páginas públicas responderam HTTP 200 no Chrome.
- Scripts selecionam production no build e publicam o artefato sem recompilar em development.
- Tipos, lint, typecheck, 64 unitários, 18 invariantes D1, 6 cenários Workers, build production, dry-run e 33 visuais aprovados.
- Os dois casos visuais com ERR_EMPTY_RESPONSE passaram na repetição direcionada.
- `fast-uri` atualizado de 3.1.7 para 3.1.8; auditoria de produção sem vulnerabilidades.

- Domínios `newwed.com.br` e `www.newwed.com.br` conectados por rotas Workers, preservando DNS e e-mail existentes.
- Build de domínio `5e18cd05-6dc8-47cc-94ad-c59a70b98313` aprovado às 17:05; apex revalidado HTTP 200/HTTPS após o deploy. CI GitHub `36770039580` aprovado.

## Onda 8 publicada

- Menus e links institucionais navegam por seções atuais; URLs antigas redirecionam para a home branca.
- Card Destinos conecta `/famtour`; a navegação da landing foi revisada na onda 9 após esclarecimento do usuário.
- Gate: tipos, lint, typecheck, 64 unitários, build production, 24 visuais/navegação e auditoria aprovados.
- Commit `c8dc547`; Workers Build `50059df3-a0ef-4eb2-8218-a1af3a392f14` aprovado às 17:55 de 2026-09-30 (America/Recife), version `62da01b3-f45f-4988-ab6f-37703ad240a0`.
- Os 12 links das navbars e o redirect de `/sobre` foram confirmados no Chrome público; CI GitHub `36775891576` aprovado.

## Onda 9 publicada

- Navbar/rodapé navegam pelas seções da FAMTOUR; query de edição preservada e menu mobile fecha após o clique.
- Galerias e inscrição retornam à landing; alvos respeitam a navbar fixa. Código publicado `5a0cc17`, CI `36777558836`; sem migrations novas.
- Gate: tipos Cloudflare, lint, typecheck, 64 unitários, build production, 27 visuais/navegação e auditoria aprovados.

## Onda 10 integrada, segurança pendente

- Fedra Light 300, Book 350 e Bold 700 locais; BlockGothicRR 500 no destaque FAMTOUR, sem síntese de estilos.
- Cards usam Solicitar informações (edição selecionada no formulário) e Ver informações da edição (detalhes, sem envio/cobrança).
- Navbar, rodapé e cabeçalho de edição oferecem Grupo New Wed e Projetos, preservando âncoras locais.
- Commit `86aa631`, PR #1: tipos, lint, typecheck, 64 unitários, build e 39 visuais macOS aprovados. Baselines Linux revisados pelo CI; revalidação em andamento.

## Onda 11 integrada

- Usuário autorizou correção e deploy em 2026-10-15 após confirmação no site público.
- Páginas Feira/Guia/Workshop recuperadas do histórico com visual branco e fontes oficiais.
- Cards e menus abrem páginas próprias; navegação FAMTOUR preservada. Decisão D-032 substitui D-028 nesses projetos.
- Tipos Cloudflare, lint, TypeScript, 64 unitários, build production, dry-run e 39 cenários visuais/navegação aprovados.
- PR #2 integrada em `31979fa`; CI `38786022714` aprovou também D1, Workers e 39 cenários Linux, falhando somente na auditoria preexistente.
- Integração Workers Builds reconectada a `newwed-org-plus/newwed2026`, branch `main`, comandos production e token existente; acompanhamento final na PR #2.

## Onda 12 publicada

- Usuário solicitou e-mail e senha próprios após bloqueio do onboarding Zero Trust; decisão D-033.
- Migration `0006` adiciona credenciais scrypt e sessões revogáveis; APIs mantêm usuários ativos e papéis.
- Verificação scrypt e limite por identidade em Durable Object SQLite (plano Free, RPC privado), migration Workers `admin-password-v1`; handler web em `workers/web.ts`.
- Login com rate limit, CSRF, cookie HttpOnly/Secure/SameSite e logout no servidor; provisionamento por operador, sem segredo no Git.
- Tipos, lint, TypeScript, 76 unitários, 14 cenários Workers, migrations locais repetíveis e build production aprovados; 43 cenários visuais aprovados, incluindo login real/reload/logout após ajuste de CPU.
- OAuth Wrangler autorizado pelo usuário para D1, mas retorno falhou por state incompatível; nenhum token/profile New Wed foi persistido. Console D1 preparado como alternativa.
- PR #3 integrada em `906f412`; Workers Build `96b29de5-c0cd-43fe-a0f7-ddb0619f3fa0` Ready, versão `39e00b42` ativa.
- Migration 0006 e cadastro inicial confirmados em produção. Login, papel admin, reload, logout/revogação e novo login reais aprovados; evidências finais na PR #3. O handoff descrito em CP-12 foi uma interpretação excessiva para cadastro inicial e não foi necessário.
- CI `38792552504`: todos os gates funcionais e 43 visuais aprovados; falha somente na auditoria preexistente.

## Onda 13 validada localmente

- Referências e assets oficiais recebidos na conversa indicada pelo usuário, somente mensagens de hoje; nenhuma mensagem enviada.
- Logo script marsala nos cabeçalhos em uso; marca FAMTOUR retorna à home, preservando menus locais.
- Quatro banners oficiais da home em proporção 9:16, sem repetir as marcas em texto, com descrições e links preservados.
- Botões institucionais usam o marsala do logo; nova foto de Cindy na seção inferior com enquadramento à direita.
- Parceiros FAMTOUR em fundo claro, grade fixa 2/4 colunas, sem ticker/divisórias e com contraste para os logos brancos.
- Vídeo principal fica pendente de material; usuário confirmou que será incluído depois. Imagem atual do hero preservada.
- Tipos, lint, TypeScript, 76 unitários, build production e 43 cenários visuais/navegação aprovados localmente; nove baselines macOS atualizados. Seis baselines Linux revisados no CI `38826677583`, que aprovou os gates funcionais; nova validação/publicação em acompanhamento.

## Onda 14 validada localmente

- Integração UAZAPI por linha, estado/QR efêmero, lock operacional, configuração server-side e RBAC admin/gestor; migration `0007`.
- Webhooks autenticados por instância, payload normalizado sem tokens, outbox/fan-out limitado e deduplicação.
- Histórico inicial e mensagens ao vivo entram nas tabelas e na Inbox existentes, com identidade de linha/contato; respostas manuais usam a linha correta. Recibos antecipados e fora de ordem preservam leitura.
- Mensagens do celular pausam o agente; importação de histórico não dispara respostas. Conversas novas entram humanas.
- Tipos Cloudflare, lint, TypeScript, 83 unitários, 21 Workers, migrations repetíveis, 18 invariantes D1 legadas e build aprovados. Suíte completa de 47 cenários visuais/navegação aprovada; inspeção visual mobile/desktop com QR sintético aprovada.
- Guia operacional: `docs/UAZAPI.md`. Sem credenciais reais, pareamento, envio externo, deploy ou alterações de dependências.
- OpenRouter/contexto por agente implementados na onda 15; contatos de demonstração/sincronização permanecem fora desta fatia.

## Onda 15 validada localmente

- Atendentes com nome/contexto/modelo, vínculo opcional e exclusivo por linha UAZAPI, versão otimista e RBAC admin/gestor; migration `0008` aplicada/repetida localmente.
- Rascunhos e teste sem WhatsApp disponíveis antes da UAZAPI. Catálogo atual filtra modelos gratuitos de texto compatíveis com JSON; cada geração confirma preço zero e impõe teto zero/sem fallback pago.
- Ingestão e Inbox existentes reaproveitadas: novos contatos podem entrar no agente; histórico/celular/conversas humanas preservam pausa. Contexto antigo, resumo e 12 mensagens recentes acompanham a resposta. Desativação/desvínculo e versão invalidam geração pendente.
- Chave dedicada OpenRouter criada no Chrome com autorização explícita do usuário: teto US$ 0, expiração 2026-11-18, somente `.dev.vars` ignorado/0600. Não há chave no banco nem nos assets client.
- Teste real fictício aprovado com `liquid/lfm-2.5-2.6b:free`, em português, sem envio WhatsApp. Tentativa anterior de roteador genérico encontrou saída inválida/limite; falhas tratadas sem envio.
- Tipos, lint, TypeScript, 90 unitários, 28 Workers, 18 invariantes D1 anteriores e build aprovados. Regressão completa de 51 cenários visuais aprovada. Após ajuste do runtime/redirecionamento, os 8 cenários afetados foram repetidos e aprovados.
- Teste real pelo painel confirmou os quatro projetos do contexto e continuidade com o atendente. Rascunho local Atendimento New Wed salvo/pausado, sem linha. Clientes OpenRouter/UAZAPI usam redirect manual e recusam 3xx, compatível com o runtime alvo.
- Guia: `docs/OPENROUTER.md`. Nenhum deploy, push, migração remota ou WhatsApp real nesta onda.

## Riscos e bloqueios atuais

- UAZAPI depende de URL/token de instância, callback HTTPS público e ativação do consumidor de eventos; nenhum deles foi validado com conta real nesta onda.
- Turnstile, Meta, Asaas, OpenAI e e-mail ainda dependem de configuração externa. OpenRouter foi validado apenas localmente com mensagem fictícia.
- O painel permanece autenticado; inscrições falham de forma segura sem Turnstile.
- O último registro de publicação cobre o site; o consumidor de eventos precisa ser ativado para a operação UAZAPI.
- O preflight comercial completo permanece bloqueado sem R2 e os demais requisitos de lançamento.
- Nenhum envio ou cobrança externa foi autorizado.
- Auditoria da onda 12 aponta 8 alertas altos transitivos em `braces`/`source-map-js` e dependentes; lockfile preservado e gate de auditoria continua integral.
