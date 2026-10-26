# Capacidade e orçamento

Leitura somente agregada em 25/10/2026. Produção: 358 conversas, 14.908 mensagens e nenhuma mensagem/lote histórico pendente. D1: 35.651.584 bytes, 829 consultas de leitura, 16.094 linhas lidas e nenhuma escrita nas 24 horas informadas pelo provedor. Consultas diagnósticas posteriores não fazem parte dessa janela. Esses números descrevem uma operação recente sem entrada; não são estimativa de pico sustentável.

A agregação dos timestamps armazenados nos últimos sete dias encontrou 14 mensagens em um minuto. Esse horário pode incluir histórico importado; não mede sozinho a taxa de chegada ao receptor. A carga local de aceitação dobra essa referência: 28 mensagens ao vivo, dois logins e importação limitada a 100 por execução, com retomada e 148 registros únicos. Isso prova isolamento/concorrência no cenário local, sem garantir SLA remoto.

## Dimensionamento antes de contratar

1. Medir durante staging/piloto: mensagens/minuto de chegada, p95 de login/recebimento, linhas D1 lidas/escritas por mensagem e importação, operações Queue, retries, pico diário e armazenamento.
2. Projetar pelo menos `2 × pico de chegada observado` com login e recebimento concorrentes. Medir novamente no ambiente candidato e comprovar ausência de perda/duplicação.
3. Para D1: projetar leituras/escritas como `custo por operação × volume`, acrescentando índices, cron, polling e recuperação. Para Queue: incluir escrita, leitura, confirmação e retries; histórico não publica por mensagem.
4. Comparar volume projetado com o plano da conta e preencher os orçamentos por dia ou mês. A coleta usa toda a conta, porque cotas podem ser compartilhadas por outros bancos/filas. Dados ausentes/desatualizados não são considerados zero.
5. Pausar importação em 80% de medição recente e manter limite 100/tick até revisão. Não aumentar esse limite nem contratar capacidade automaticamente.

Os preços e limites devem ser reconfirmados no momento do orçamento em [Workers/D1](https://developers.cloudflare.com/workers/platform/pricing/) e [Queues](https://developers.cloudflare.com/queues/platform/pricing/). O titular ainda não aprovou plano pago. Não foi feita contratação. O aceite de capacidade em produção permanece condicionado à medição e piloto, com os valores atuais da conta.
