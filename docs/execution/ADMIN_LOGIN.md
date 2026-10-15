# Login administrativo

O painel em `/admin` redireciona visitantes para `/admin/login`. O login próprio aceita e-mail e senha; Cloudflare Access permanece opcional para identidades já provisionadas. Não há cadastro público nem promoção automática de papéis.

## Provisionamento

Aplicar migrations até `0006` no D1 correto antes de cadastrar usuários. O operador precisa de autorização para conceder o papel `admin`.

Com um perfil Wrangler autorizado na conta do projeto:

```bash
npx tsx scripts/provision-admin.ts administrador@example.test --profile=perfil-autorizado
```

A senha é lida do terminal com entrada oculta. Nunca passá-la como argumento, variável versionada, SQL em texto puro ou descrição de PR. O script gera scrypt com salt aleatório, grava usuário ativo e papel admin, substitui o hash e revoga as sessões anteriores desse usuário. O SQL temporário tem permissão `0600` e é removido ao encerrar; a saída do subprocesso não é exibida porque erros podem conter SQL.

Se o OAuth não concluir, preparar um arquivo **ignorado pelo Git** para o operador copiar e executar no console D1 da conta correta:

```bash
npx tsx scripts/provision-admin.ts administrador@example.test --prepare=tmp/admin-setup.sql
```

O próprio operador deve inserir e submeter essa nova credencial no navegador. Remover o arquivo após confirmar a configuração; não capturar sua tela nem compartilhar seu conteúdo. Uma rotação autorizada usa o mesmo procedimento e encerra sessões existentes.

## Proteções

- Verificação de senha e limite por identidade usam o RPC privado `AdminPasswordVerifier`, exportado em `workers/web.ts`; migration Workers `admin-password-v1`, sem URL pública ou senha armazenada no objeto. O limite de CPU de [30 segundos do Durable Object no plano Free](https://developers.cloudflare.com/durable-objects/platform/limits/) acomoda a derivação; o handler HTTP Free possui somente 10 ms.
- scrypt `N=16384,r=8,p=5`, salt aleatório de 128 bits e comparação constante; configuração de 16 MiB da [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), exercitada no runtime Workers.
- Cookie de produção `__Host-newwed_admin_session`: `Secure`, `HttpOnly`, `SameSite=Strict`, sem Domain; expiração absoluta de oito horas. Desenvolvimento usa cookie próprio sem Secure para HTTP local.
- Token aleatório de 256 bits; D1 armazena somente SHA-256 do token. Logout remove a sessão no servidor. Usuário ativo e papéis são relidos em cada solicitação.
- Login limitado por IP em buckets D1 e por identidade em um Durable Object SQLite; mensagens genéricas para credencial incorreta/usuário inexistente.
- Login, logout e mutações com cookie exigem Origin igual ao da requisição. APIs privadas continuam negando acesso sem identidade e sem papéis suficientes.
- Formulário só habilita após hidratação e usa POST como fallback, evitando dados de senha em URLs.
- O bypass de desenvolvimento continua impossível em production/staging. Access valida issuer/audience e só usa o e-mail assinado no JWT.

## Validação

`npm run test:workers` cobre login com D1 real local, hash, rate limit, CSRF, papéis, desativação, expiração e revogação. `npm run test:visual` provisiona somente uma identidade sintética local e cobre login/reload/logout, além da tela em três tamanhos. Com `VISUAL_BASE_URL`, a suíte não provisiona dados nem tenta senhas remotas.

No domínio publicado, validar primeiro que `/admin` redireciona, `/api/admin/me` retorna 401 e páginas públicas respondem 200. Depois do provisionamento, confirmar login autorizado e logout; não publicar dados reais ou cookies nas evidências.
