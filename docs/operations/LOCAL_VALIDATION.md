# Validação local

Execute no checkout da onda 26. Nenhum passo abaixo aponta o callback da linha ativa ao computador.

```bash
npm ci
npm run local:prepare
npm run dev:local
```

Abrir `http://127.0.0.1:4173/admin`. O script aplica migrations somente ao D1 local e inclui a edição **VALIDACAO local — demonstração**, um lead e uma conversa sintética. A linha da fixture não tem provider e permanece desconectada. Repetir a preparação preserva registros já existentes. A fixture é exclusivamente de desenvolvimento e nunca deve ser aplicada remotamente.

Se login for necessário, provisionar a própria conta local com `npx tsx scripts/provision-admin.ts <seu-email> --local`; a senha será pedida de forma oculta. Não enviar a senha pelo chat. O bypass de desenvolvimento existente é restrito à configuração local; produção sempre exige autenticação.

## O que revisar na interface

1. Pipeline: abrir a ficha VALIDACAO, revisar histórico, tarefas, responsável e qualificação humana.
2. Inbox: abrir a conversa sintética, conferir ambiente/recebimento, assumir e devolver. Com funções pausadas, envio não é executado.
3. Checkout: selecionar explicitamente uma conversa UAZAPI válida. A linha de demonstração não é elegível para uma cobrança real. A interface informa pausas/erros da função.
4. Relatórios: conferir contagens, operação retida, execução de cron ainda não registrada e cota indisponível sem configuração. Dado indisponível não é lista vazia nem consumo zero.
5. Formulário: revisar campos, consentimento e edição. `ENABLE_PUBLIC_LEADS` está desligado por padrão; habilitar somente em configuração local para persistir inscrições. Turnstile sem secret é permitido exclusivamente em desenvolvimento.

O banco local é independente de produção; mensagens reais da linha ativa continuam chegando ao banco publicado. Não importar conversas reais para testar telas.

## Fluxo completo reproduzível com providers simulados

```bash
npm test
npm run test:workers
npm run test:recovery
npm run test:visual
```

Workers executa D1/Queue/Durable Objects locais e intercepta providers: inscrição → atendimento → qualificação → checkout UAZAPI → recibo → pagamento → confirmação única. Inclui Pix/cartão/parcelas, concorrência, estorno, timeout, retenção e reconciliação. Nenhuma credencial real de `.dev.vars` é carregada pela configuração Workers.

O teste de capacidade concorrente usa 28 mensagens ao vivo, dois logins e orçamento histórico de 100 por cron; a retomada chega a 148 mensagens únicas sem saída automática. Testes de interface usam fixtures autenticadas e três viewports. Backup/restauração são exercitados em bancos temporários separados e limpos ao terminar.

Para validação externa ainda são necessários Asaas sandbox, e-mail verificado, Turnstile e linha de teste própria, além da janela/destinatários aprovados. Os testes simulados não aprovam produção nem substituem o piloto de 24 horas.
