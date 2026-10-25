# Recuperação e rollback

## Interrupção operacional

Diante de perda, duplicidade financeira, vaga inconsistente ou falha de segurança, desligar manual, agente, checkout, confirmação e e-mail nos serviços correspondentes. Preservar o receptor, webhooks autenticados, D1 e evidências. Não apagar mensagens, pagamentos, outbox ou DLQ para fazer o painel parecer saudável.

503/DATABASE_UNAVAILABLE exige nova tentativa; nunca habilitar bypass de autenticação. Diante de cota diária, importação para e volta do progresso persistido após a recuperação. Não repetir operações de resultado incerto.

## Backup anterior à janela

1. Registrar commit, CI, versões dos três Workers, migrations/DO e flags. Obter bookmark atual com `wrangler d1 time-travel info` para o banco/ambiente correto.
2. Fazer export lógico de schema e dados separadamente com `wrangler d1 export <banco> --remote --no-data --output <arquivo-schema>` e `--no-schema --output <arquivo-dados>`, usando configuração/ambiente/perfil corretos. Guardar fora do repositório, com acesso restrito e criptografia; não incluir dumps em relatórios.
3. Testar restauração em banco isolado: criar todas as tabelas antes dos dados; importar com `PRAGMA defer_foreign_keys=ON`, schema, dados e depois `OFF`. Export intercalado pode tentar inserir filhos antes de criar pais. Conferir `foreign_key_check`, contagens, migrações e índices.
4. O ensaio local automatizado `npm run test:recovery` cobre esse procedimento com fixtures sem dados reais. Restaurar produção exige decisão explícita do responsável e janela de incidente.

[Time Travel oficial](https://developers.cloudflare.com/d1/reference/time-travel/) sobrescreve o banco. Conferir retenção disponível no plano, registrar o bookmark anterior e preservar export posterior ao incidente antes de qualquer restauração. Reconciliar entradas e pagamentos que ocorreram após o ponto restaurado, para não perder dados válidos.

## Conciliação sem replay cego

- Mensagem UAZAPI incerta: conferir WhatsApp/provider, registrar evidência na Inbox e escolher entregue/não enviada. Checkout concilia seu próprio eixo; confirmação é mensagem separada.
- E-mail incerto: conferir ID/resultado no serviço, registrar evidência individual em Relatórios. Somente ausência de envio comprovada permite nova tentativa. Aceite incerto nunca vai para retry automático.
- Checkout criado sem resposta: procurar pela `externalReference` antes de nova cobrança. A rotina de criação já procura a referência ao retomar. Checkout expirado não cria cobrança ao sair da retenção.
- Pagamento: comparar valor, método, referência, parcelas e capacidade. Somente conciliação financeira promove PAGO. `PAID_WITHOUT_CAPACITY`, estorno parcial/pendente exigem revisão; falha de comunicação não reverte pagamento.
- Backlog anterior: revisar por ID e motivo. `PRE_ACTIVATION_REVIEW`/função desabilitada podem ser liberados individualmente se ainda válidos; pedido antigo de IA não deve responder. Resultados desconhecidos exigem conciliação específica.
- Histórico: cursor, orçamento e lock por linha persistem. Falhas transitórias têm backoff; finais ficam visíveis para investigação. Não reiniciar do zero nem publicar Queue por mensagem.

## Rollback compatível

Migrations 0009–0013 são aditivas, mas 0011 altera o significado da outbox. Não voltar a consumidores anteriores à onda 24 após aplicar 0011: eles ignoram HELD e podem executar backlog. Usar um commit compatível com retenção, flags e schema corrente, com efeitos externos desligados. Se não houver binário compatível, pausar consumidor comercial e preservar receptor compatível; publicar correção aditiva.

Não executar down migration nem remover colunas/dados. Registrar commit revertido, versão compatível, flags, migrations mantidas, smokes e divergências. Revalidar em staging e ativar progressivamente somente após a conciliação.

## Ausência de progresso e limites

Revisar alerta após três comparações consecutivas de cron sem progresso ou três falhas. Primeira execução estabelece a referência; fila vazia não gera falso alerta. Falhas finais crescentes e uso em 80% geram notificação deduplicada por dia no painel/e-mail conforme flag. Se D1 estiver totalmente indisponível, a gravação do próprio alerta pode falhar: usar também alertas externos de execução/erro no Cloudflare e verificar o último sucesso há mais de 15 minutos.
