# Runbook — credenciais de MÁQUINA (`verificador`, `ingestor`) · v6.0.0

Duas roles do Postgres, dois usuários de máquina, dois LOGINS. A que **verifica** (suíte de
contrato, medições, varreduras) não consegue escrever; a que **ingere** (rota `/api/ingestao`)
não consegue ler nem truncar. `SUPABASE_SERVICE_ROLE_KEY` continua existindo — o app precisa
dela (admin, Storage, Auth) — mas sai da mão de quem verifica (sonda `src/lib/sonda-credencial.test.ts`
reprova quem voltar a usá-la fora dos pontos declarados).

| | `verificador` (0273) | `ingestor` (0274) |
|---|---|---|
| role do Postgres | `verificador NOLOGIN`, concedida a `authenticator` | `ingestor NOLOGIN`, idem |
| EXECUTE | só a allowlist derivada de `rpc-contrato.test.ts` + `dre-oracle.mjs` (54 assinaturas, só leitura — 21/09/2026; nenhuma RPC de escrita) | só `inserir_lote_staging_*` + `promover_carga_*` das 5 bases |
| `statement_timeout` | 8 s (o mesmo da UI) | 0 (carga pesada) |
| usuário de máquina | `verificador@janus.interno` · role RBAC "Máquina · verificação" (todas as áreas fora de Administração) | `ingestor@janus.interno` · role RBAC "Máquina · ingestão" (só `admin/uploads`) |
| segredo | `SUPABASE_VERIFICADOR_SENHA` (`.env.local`) — senha do usuário de máquina | `SUPABASE_INGESTOR_SENHA` (`.env.local` + Vercel) |
| quem usa | `npm test`, `scripts/dre-oracle.mjs`, varreduras | a rota de ingestão, do lado do servidor |

**Como a identidade nasce (0275).** O projeto usa o regime novo de chaves do Supabase (JWKS
ES256 gerido pela plataforma), então ninguém assina JWT localmente. A credencial de máquina faz
**login** (`/auth/v1/token?grant_type=password`, e-mail + senha) e recebe um access token de 1 h;
o `custom_access_token_hook` (função `public.custom_access_token_hook`, registrada no Dashboard)
troca o claim `role` de `authenticated` para `verificador`/`ingestor` quando o `sub` é um usuário
de máquina **ativo**. O helper `src/lib/auth/credencial-maquina.ts` (`tokenMaquina`) faz o login,
cacheia o token e renova perto do `exp`. `app.exigir_acesso` **não mudou**: o token tem `role`
(papel do Postgres) e `sub` (o usuário de máquina, ativo), e percorre o caminho normal de usuário. São **duas camadas independentes**:
a allowlist de EXECUTE (grants) e o RBAC de área (usuário). Ter o grant não basta; ter a área
não basta.

## 1. Criar (uma vez por credencial)

```bash
# 1) aplicar as migrations (0273 verificador · 0274 ingestor · 0275 hook) — aditivas
npm run db:migrate -- --aditiva

# 2) criar o usuário de máquina (conta Auth + vínculo RBAC ativo). Idempotente: se já existir,
#    só imprime o user_id. Usa a service_role — ato administrativo, um dos pontos declarados.
node scripts/credencial/bootstrap-usuario-maquina.mjs verificador

# 3) definir a senha (segredo de longa duração) e gravá-la no .env.local
node scripts/credencial/definir-senha-maquina.mjs verificador --gravar
#    → SUPABASE_VERIFICADOR_SENHA=… no .env.local (ingestor: também no ambiente da Vercel)

# 4) ATO HUMANO, uma vez por projeto: registrar o hook.
#    Dashboard → Authentication → Hooks → "Customize Access Token (JWT) Claims" → Postgres →
#    schema `public`, função `custom_access_token_hook` → Enable.
#    Sem isso o login funciona mas o token sai com role=authenticated e toda RPC da allowlist
#    responde PERMISSAO_NEGADA/403 (fail-closed).

# 5) provar
npm test -- src/lib/rpc-contrato.test.ts      # a suíte inteira com a credencial, 0 skip
```

Para o `ingestor`, o mesmo com `ingestor`; a senha vai também para o ambiente da Vercel
(`SUPABASE_INGESTOR_SENHA`).

## 2. Revogar / rotacionar — as duas alavancas

**Alavanca 1 — desativar o usuário (imediata, sem tocar em segredo).** O hook só troca o
`role` de usuário **ativo**, e `exigir_acesso` exige `ativo = true`: um token já emitido para um
`sub` desativado recebe `USUARIO_INATIVO` (42501) em toda RPC gated, e o próximo login nem
recebe o papel de máquina. Pela tela `/admin/acessos` (desativar `verificador@janus.interno`) ou:

```sql
UPDATE app.rbac_usuarios SET ativo = false WHERE email = 'verificador@janus.interno';
-- (UPDATE em dado existente = destrutiva: pelo SQL Editor do dashboard, ato humano)
```

**Alavanca 2 — trocar a senha.** `node scripts/credencial/definir-senha-maquina.mjs <papel> --gravar`
redefine a senha na hora (a antiga deixa de logar). Tokens já emitidos valem até o `exp`
(1 h) — por isso a alavanca 1 é a de emergência.

**Para o `ingestor` há uma terceira**: revogar a chave `x-api-key` em `/admin/api-externa`
(⇒ 401 imediato na rota). Ela corta a porta HTTP; as duas acima cortam o banco.

## 3. Sintomas e diagnóstico

| Sintoma | Causa provável | Onde olhar |
|---|---|---|
| `npm test` pula os casos de contrato | `SUPABASE_VERIFICADOR_SENHA` ausente no `.env.local` | `sonda-skipif-silencioso` lista as variáveis exigidas |
| caso de contrato de RPC **nova** falha com `PERMISSAO_NEGADA`/403 | a RPC nasceu **fora** da allowlist — é o fail-closed desejado | rodar `node scripts/credencial/derivar-allowlist.mjs verificador` e acrescentar o GRANT numa migration aditiva |
| `USUARIO_INATIVO` em tudo | alavanca 1 acionada (ou usuário nunca criado) | `SELECT email, ativo FROM app.rbac_usuarios WHERE email LIKE '%@janus.interno'` |
| toda RPC da allowlist responde 403 `PERMISSAO_NEGADA` com login OK | o hook **não está registrado** no Dashboard (token sai com `role=authenticated`) | decodificar o claim `role` do token (`roleDoToken`); Dashboard → Authentication → Hooks |
| login recusado (HTTP 400 `invalid_credentials`) | senha do `.env.local` diferente da do Auth — rode `definir-senha-maquina.mjs --gravar` de novo | — |
| `PGRST301` | token expirado sem renovação (o helper renova sozinho) ou `role` do claim não concedido a `authenticator` | `SELECT rolname FROM pg_roles WHERE rolname IN ('verificador','ingestor')`; `pg_auth_members` |
| 57014 timeout numa RPC de contrato | teto de 8 s do `verificador` (= UI) | é achado sobre a RPC, não sobre a credencial |

## 4. O que NÃO fazer

- Não conceder `admin/*` ao usuário de máquina "para o teste passar": a prova negativa
  (`GATE 2` em `rpc-contrato.test.ts`) existe exatamente para isso reprovar.
- Não escrever a allowlist à mão: regenerar pelo script e colar o bloco na migration.
- Não voltar a `SUPABASE_SERVICE_ROLE_KEY` em teste/medição: a sonda C1 nomeia o arquivo.
- Não tentar assinar JWT localmente com o secret legado: o gateway só aceita a chave ES256 do JWKS (`No suitable key`). O caminho é login + hook.
