# Deploy e configuração Cloudflare

## Publicação inicial do site — 2026-09-30

O usuário autorizou publicar o repositório `newwed2026/newwed2026` na conta New Wed e escolheu manter R2 desabilitado nesta primeira publicação.

- Conta: `41245f76790f4922487ec395c9e3bcec`.
- Worker: `new-wed-platform-production`.
- D1: `new-wed-platform-production`, ID `2263d378-59c9-4e5a-8d9b-a6e0140767dd`.
- Queue: `new-wed-events-production`, ID `8e18d7f59d554826bb425c633c6441fa`.
- Build no Workers Builds: `npm run build:production`.
- Deploy no Workers Builds: `npm run db:migrate:production && npm run deploy:production`.

O ambiente é selecionado no build com `CLOUDFLARE_ENV=production`; o deploy usa a configuração gerada e não recompila no ambiente de desenvolvimento. A migração remota ocorre antes da publicação.

O site usa seus assets empacotados e não depende de uploads R2. O consumidor de eventos, Access, Turnstile e as integrações externas ainda exigem provisionamento próprio. O painel mantém `ALLOW_LOCAL_ACCESS=false`, e o formulário falha de forma segura enquanto Turnstile não estiver configurado. Esta publicação não representa aceite do piloto comercial. Os requisitos atuais estão no preflight por função e no checklist operacional; R2 é opcional.

## Arquitetura vigente nas ondas 21–26

R2/Access são opcionais. Login próprio usa D1 e Durable Objects. UAZAPI tem receptor/fila/DLQ próprios; consumidor comercial separado usa OpenRouter gratuito, UAZAPI, Asaas e e-mail. Configuração atual: [EXTERNAL_CONFIGURATION.md](operations/EXTERNAL_CONFIGURATION.md).

Staging D1 `d67175d9-52b6-47f7-b7a0-4a75a05af32d` e quatro filas staging já criados; somente 0000–0008 foram aplicadas remotamente. Ondas 22–26 não foram implantadas. Migrations 0009–0013 são aditivas, sequenciais e requerem binários compatíveis com retenção após 0011. Consulte [RECOVERY_RUNBOOK.md](operations/RECOVERY_RUNBOOK.md).

1. Concluir gate/CI e revisão local; merge em main aciona Workers Builds e exige janela específica.
2. Registrar bookmark/export, commit, CI e flags; aplicar migrations em staging, conferir DOs e preflight por função.
3. Publicar receiver e comercial compatíveis inicialmente desligados, depois web; registrar versões dos três. Não usar o canal antigo para liberar backlog retido.
4. Configurar secrets mínimos por serviço, sem credenciais de envio/IA no receiver. Conferir linha exclusiva e callbacks sem tocar a linha ativa.
5. Ativar progressivamente e executar smokes conforme LAUNCH_CHECKLIST.md e PILOT_RUNBOOK.md.
6. Após aceite e piloto de 24 h, repetir o processo de produção, registrando versões/migrations/smokes. Rollback mantém schema aditivo e consumidor capaz de respeitar HELD/flags; nunca voltar ao consumidor antigo.

### Domínio institucional

`https://newwed.com.br` e `https://www.newwed.com.br` usam rotas Workers específicas no ambiente production. Os registros A/CNAME existentes e MX/TXT de e-mail permanecem intactos, incluindo o alias mail que depende do apex. Não substituir esses registros por Custom Domains sem separar essa dependência legada. As rotas estão versionadas em `wrangler.jsonc` para os builds automáticos.
