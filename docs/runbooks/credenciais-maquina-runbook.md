# Runbook — credenciais de MÁQUINA (`verificador`, `ingestor`) · v6.0.0

Duas roles do Postgres, dois usuários de máquina, dois JWTs. A que **verifica** (suíte de
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
| variável | `SUPABASE_VERIFICADOR_KEY` (`.env.local`) | `SUPABASE_INGESTOR_KEY` (`.env.local` + Vercel) |
| quem usa | `npm test`, `scripts/dre-oracle.mjs`, varreduras | a rota de ingestão, do lado do servidor |

`app.exigir_acesso` **não mudou**: o JWT tem `role` (papel do Postgres) e `sub` (o usuário de
máquina, **ativo**), e percorre o caminho normal de usuário. São **duas camadas independentes**:
a allowlist de EXECUTE (grants) e o RBAC de área (usuário). Ter o grant não basta; ter a área
não basta.

## 1. Criar (uma vez por credencial)

```bash
# 1) aplicar a migration da role (0273 / 0274) — aditiva
npm run db:migrate -- --aditiva

# 2) criar o usuário de máquina (conta Auth + vínculo RBAC ativo). Idempotente: se já existir,
#    só imprime o user_id. Usa a service_role — é ato administrativo, um dos pontos declarados.
node scripts/credencial/bootstrap-usuario-maquina.mjs verificador
#    → "sub para o JWT: <uuid>"

# 3) gerar o JWT (HUMANO). O JWT secret vem de Dashboard → Project Settings → API → JWT Settings.
#    Só na linha de comando, nunca em arquivo.
SUPABASE_JWT_SECRET='…' node scripts/credencial/gerar-jwt.mjs verificador <uuid>
#    → cole o token em .env.local como SUPABASE_VERIFICADOR_KEY=…

# 4) provar
npm test -- src/lib/rpc-contrato.test.ts      # a suíte inteira com a chave nova, 0 skip
```

Para o `ingestor`, o mesmo com `ingestor`; o token vai também para o ambiente da Vercel
(`SUPABASE_INGESTOR_KEY`).

## 2. Revogar / rotacionar — as duas alavancas

**Alavanca 1 — desativar o usuário (imediata, sem tocar em segredo).** `exigir_acesso` exige
`ativo = true`; um JWT válido com `sub` de usuário inativo recebe `USUARIO_INATIVO` (42501) em
**toda** RPC gated. Pela tela `/admin/acessos` (desativar `verificador@janus.interno`) ou:

```sql
UPDATE app.rbac_usuarios SET ativo = false WHERE email = 'verificador@janus.interno';
-- (UPDATE em dado existente = destrutiva: pelo SQL Editor do dashboard, ato humano)
```

**Alavanca 2 — trocar o JWT.** Gerar um novo (`gerar-jwt.mjs`, passo 3) e substituir na
variável. O antigo continua **válido até o `exp`** (10 anos por default) — por isso a alavanca 1
é a de emergência: ela vale para qualquer token daquele `sub`, novo ou velho. Rotação
"de verdade" (token antigo morto, novo vivo) = desativar o usuário atual, criar outro
(`bootstrap` com outro e-mail — ajustar `CREDENCIAIS` no script) e gerar o JWT para o novo `sub`.

**Para o `ingestor` há uma terceira**: revogar a chave `x-api-key` em `/admin/api-externa`
(⇒ 401 imediato na rota). Ela corta a porta HTTP; as duas acima cortam o banco.

## 3. Sintomas e diagnóstico

| Sintoma | Causa provável | Onde olhar |
|---|---|---|
| `npm test` pula os casos de contrato | `SUPABASE_VERIFICADOR_KEY` ausente no `.env.local` | `sonda-skipif-silencioso` lista as variáveis exigidas |
| caso de contrato de RPC **nova** falha com `PERMISSAO_NEGADA`/403 | a RPC nasceu **fora** da allowlist — é o fail-closed desejado | rodar `node scripts/credencial/derivar-allowlist.mjs verificador` e acrescentar o GRANT numa migration aditiva |
| `USUARIO_INATIVO` em tudo | alavanca 1 acionada (ou usuário nunca criado) | `SELECT email, ativo FROM app.rbac_usuarios WHERE email LIKE '%@janus.interno'` |
| `PGRST301`/JWT inválido | secret errado no `gerar-jwt.mjs`, ou token com `role` não concedido a `authenticator` | `SELECT rolname FROM pg_roles WHERE rolname IN ('verificador','ingestor')`; `pg_auth_members` |
| 57014 timeout numa RPC de contrato | teto de 8 s do `verificador` (= UI) | é achado sobre a RPC, não sobre a credencial |

## 4. O que NÃO fazer

- Não conceder `admin/*` ao usuário de máquina "para o teste passar": a prova negativa
  (`GATE 2` em `rpc-contrato.test.ts`) existe exatamente para isso reprovar.
- Não escrever a allowlist à mão: regenerar pelo script e colar o bloco na migration.
- Não voltar a `SUPABASE_SERVICE_ROLE_KEY` em teste/medição: a sonda C1 nomeia o arquivo.
- Não gravar `SUPABASE_JWT_SECRET` em `.env.local` nem em lugar nenhum do repositório.
