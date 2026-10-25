# Checklist de liberação

- [ ] PRs empilhadas revisadas e CI aprovado no commit candidato; resolver a PR antiga/supersedida ao integrar a onda 21.
- [ ] Validação local aceita pelo usuário. Nenhum merge/publicação automática durante essa revisão.
- [ ] Recursos/credenciais de staging separados e linha exclusiva disponível; Asaas sandbox, Turnstile e e-mail preparados.
- [ ] Orçamentos/alertas configurados conforme plano aprovado; nenhuma compra sem aprovação.
- [ ] Backup/bookmark registrado e ensaio de restauração aprovado.
- [ ] Preflight estático staging aprovado; secrets e recursos reais conferidos sem expor valores.
- [ ] Migrations 0000–0013 aplicadas sequencialmente em staging; DOs de login disponíveis. Não aplicar down migration.
- [ ] Publicar receiver, comercial e web compatíveis com retenção, inicialmente com funções desligadas; registrar versões, CI, migrations e smokes.
- [ ] Revisar backlog anterior. Nenhuma ativação publica efeitos retidos automaticamente.
- [ ] Recebimento → manual → IA → checkout → confirmação → e-mail aprovados, por linha/destinatários autorizados.
- [ ] Fluxo completo, última vaga, duplicidade/ordem de webhook, timeout, opt-out, RBAC/CSRF e indisponibilidade D1 aprovados.
- [ ] Piloto de uma edição conciliado por pelo menos 24 horas; capacidade medida para pelo menos o dobro do pico observado.
- [ ] Responsáveis treinados, contingência validada e nenhuma pendência crítica.
- [ ] Vídeo final recebido e revisão visual concluída, ou aceite explícito da imagem atual.

Evidências: commit, links do CI, migrations, versões de cada Worker, horário/ambiente, IDs sintéticos/técnicos e resultados dos smokes. Não anexar conteúdo real de clientes, destinatários ou secrets. Produção ampla depende do aceite comercial, operacional e técnico. Recuperação: RECOVERY_RUNBOOK.md.
