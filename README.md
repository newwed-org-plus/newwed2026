# New Wed Platform

Plataforma unificada do institucional New Wed, FAMTOUR, CRM comercial, WhatsApp e pagamentos. O frontend usa Next.js App Router sobre vinext; o backend roda no Cloudflare Workers com D1, Queues, R2/Images, Turnstile e Cloudflare Access.

## Desenvolvimento local

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

O institucional fica em `/`, o FAMTOUR em `/famtour` e o dashboard em `/admin`. Para testar o dashboard localmente, use `ALLOW_LOCAL_ACCESS=true` apenas no `.dev.vars`; o primeiro acesso provisiona um administrador local.

## WhatsApp UAZAPI

A área **WhatsApp** do painel conecta linhas por QR Code e reaproveita o histórico e a Inbox. Veja [configuração e operação](docs/UAZAPI.md) para preparar instância, segredos e consumidor de eventos.

## Validação

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:visual
```

Consulte [arquitetura](docs/ARCHITECTURE.md), [deploy](docs/DEPLOYMENT.md) e o [plano contínuo de execução](docs/execution/MASTER_PLAN.md).

- Atendentes com OpenRouter gratuito: [configuração e operação](docs/OPENROUTER.md).
