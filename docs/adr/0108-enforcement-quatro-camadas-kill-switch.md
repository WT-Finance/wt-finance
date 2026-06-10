# ADR 0108 — Enforcement em 4 camadas com janela de compatibilidade (kill switch)

**Status:** Aceito
**Data:** Junho/2026
**Versão:** v4.13

## Contexto

Duas restrições em tensão: (a) **nenhum acesso anônimo a nada**, com RLS granular não
permissivo no banco; (b) a **`main` atual (sem auth) precisa continuar funcionando com o
banco migrado até o merge** — produção é usada ativamente pela diretoria.

Agravante descoberto no recon: **todas as 72 funções `public` tinham EXECUTE para
`anon` no banco vivo** — incluindo `truncate_dynamic_tables()` e
`promover_carga_vendas()`. Os `REVOKE ... FROM PUBLIC` das migrations nunca cobriram o
grant automático dos *default privileges* do Supabase para `anon`/`authenticated`.
Qualquer pessoa com a anon key (pública por design, vai no bundle) podia **apagar a
base de produção via PostgREST**. A v4.13 fecha isso.

## Decisão — quatro camadas

1. **Middleware (sessão).** Toda rota fora de `/login`/`/auth/*` exige sessão; páginas
   redirecionam para `/login`, APIs respondem 401 JSON.
2. **Guards de área no app.** Cada página, route handler e server action declara sua
   área (`requireArea`/`requireAreaApi`/`requireAreaAction`, mapa único em
   `src/lib/auth/areas.ts`). Rotas parametrizadas por setor mapeiam o parâmetro
   (`?setor=Weddings → performance/weddings`).
3. **Guards no banco (backstop).** As RPCs de **leitura** expostas ganham *wrapper*:
   a função original vira `<fn>__nucleo` (EXECUTE só `service_role`) e o nome público
   passa a um `SECURITY DEFINER` de mesma assinatura que faz
   `PERFORM app.exigir_acesso(<áreas>)` e delega. RPCs com `p_setor` derivam a área via
   `app.areas_do_setor()`. RPCs de **mutação** e internas (cargas, transform, gerencial
   write, contadores) têm `anon`/`authenticated` **revogados imediatamente** — o app
   sempre as chamou com service role, então não há janela: o buraco crítico fecha já.
4. **RLS deny-by-default.** RLS habilitado em TODAS as tabelas dos schemas `analytics`,
   `app`, `audit`, `dim`, `financeiro`, `raw` — sem policy permissiva (a ausência de
   policy nega tudo a `anon`/`authenticated`; única policy criada é a de auto-leitura
   do próprio registro em `rbac_usuarios`). `SECURITY DEFINER` (owner `postgres`) e
   `service_role` (BYPASSRLS) seguem funcionando; o app nunca acessou tabela
   diretamente (verificado: zero `.from()` no código).

### Janela de compatibilidade + kill switch

`app.exigir_acesso` lê a flag **`auth_enforcement`** em `app.config`:

- **JWT de usuário presente → valida SEMPRE** (ativo + permissão), flag ligada ou não.
  O preview (branch) roda RBAC pleno desde o primeiro deploy.
- **Sem JWT (anon) → permitido enquanto a flag está OFF** — é exatamente o caminho da
  `main` em produção (server client com anon key), que continua intacta até o merge.
- **Flag ON → anon recebe `42501` (HTTP 403)** em tudo. Ligada na ativação, pós-merge.

A mesma flag é o **mecanismo de emergência (S3)**: desligar =
`select public.admin_set_enforcement(false)` (ou UPDATE direto em `app.config` via
SQL editor/`supabase db query`) — um único comando restaura o comportamento legado sem
deploy e sem tocar em código. A função `public.rbac_verificar_guard(p_area)` permite
**testar o caminho negado sem ligar a flag global** (força o enforcement via GUC local
de transação) — usada na verificação S11.

## Alternativas consideradas

- **REVOKE imediato de anon em tudo** — descartada: derrubaria a `main` em produção na
  hora (S5). Mutações são exceção segura (main usa service role nelas — verificado).
- **Duplicar RPCs (`get_x_v2` autenticada, antiga preservada)** — descartada: ~46
  funções duplicadas, dois contratos para manter, remoção arriscada depois. O wrapper
  preserva nome/assinatura/defaults e o diff é auditável.
- **Reescrever o corpo de cada RPC com o guard embutido** — descartada: re-emitir ~46
  corpos copiados das migrations é o tipo de operação que regride silenciosamente
  (vide lição do parser único, v4.12.1). O wrapper não toca no corpo original.
- **Enforcement só no app (sem guards no banco)** — descartada: a anon key é pública;
  PostgREST continuaria servindo dados a qualquer um. Violaria "RLS granular no banco —
  não permissivo" e o S1 de fato.
- **Rotacionar a anon key no merge** — descartada como mecanismo principal: quebra a
  `main` no instante da rotação (mesma chave), não fecha `authenticated` sem RBAC, e
  não é operável por migration. (Continua válida como medida operacional futura.)

## Consequências

- Pré-merge: produção idêntica ao comportamento atual; preview com enforcement pleno
  para usuários logados; mutações via PostgREST anônimo **já impossíveis**.
- Pós-ativação: nenhum dado sai do Postgres sem JWT válido + permissão de área.
- Negação no banco vira `42501` → HTTP 403 → `unwrapRpc`/`parseRpc` logam e a tela
  degrada para o estado de erro discreto existente (`ErroCarregamento`) — sem tela branca.
- Custo por chamada: 1 EXISTS indexado (sub-ms) — irrelevante ante o timeout de 8s do
  role `authenticated` (o app deixa de correr como `anon`/3s, ganhando folga).
