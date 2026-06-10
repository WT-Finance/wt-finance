# Auto-auditoria adversarial — v4.13 (Autenticação e RBAC)

**Data:** 2026-06-10 · **Escopo:** S11 da missão v4.13 · **Método:** auditoria determinística (orquestrador) + workflow adversarial de 5 atacantes em ângulos disjuntos (sessão/proxy, escalação/RBAC, RPCs/wrappers, RLS/grants, ciclo de vida de identidade) + verificação de 2ª ordem dos achados alto/crítico por um auditor cético independente.

**Resultado:** 0 críticos confirmados ao final. 2 achados **corrigidos durante a auditoria** (1 crítico determinístico + 1 médio); 4 correções de endurecimento aplicadas; demais aceitos com justificativa ou encaminhados à ativação. Nenhum caminho confirmado em que um usuário veja o que sua role não permite.

---

## Achados corrigidos (com migration/código nesta entrega)

### C1 (CRÍTICO, determinístico) — Policies RLS permissivas herdadas (`USING true`)
17 policies de migrations antigas (0007/0021/0026) davam `SELECT` a `{anon,authenticated}` em tabelas sensíveis (`analytics.fato_venda`, `fato_venda_item`, `fato_lancamento_operacao`, `dim_operacao_weddings`, `app.meta_setor`…). Viola "RLS não-permissivo"; furo latente se um grant for reconcedido.
**Correção:** migration **0123** — DROP de todas as policies dos 6 schemas exceto a granular `rbac_usuarios_proprio_registro`. Verificado: resta 1 policy; leitura via RPC (anon, flag OFF) segue 200 (S5 intacto).

### M1 (MÉDIO, confiança alta) — `ALTER DEFAULT PRIVILEGES` de tabela para anon nunca revertido
A 0007 fez `ALTER DEFAULT PRIVILEGES IN SCHEMA analytics/app GRANT SELECT ON TABLES TO anon, authenticated`. `pg_default_acl` confirmou: tabela **futura** nasceria legível por anon — gêmeo, no nível de tabela, do furo de funções da 0122.
**Correção:** migration **0124** — `ALTER DEFAULT PRIVILEGES … REVOKE … ON TABLES/SEQUENCES FROM anon, authenticated` nos 6 schemas.

### M2 (MÉDIO, confiança alta) — Matcher do proxy excluía qualquer path `.png/.svg/...`
`matcher` excluía `.*\.(svg|png|…)$` no path inteiro → uma rota dinâmica `/api/.../[id]` com id terminado em `.png` escapava da camada 1 (sessão). Contido hoje pelos guards de camada 2, mas quebrava a promessa "rota nova nasce protegida pelo proxy".
**Correção:** `src/proxy.ts` — matcher por allowlist de assets reais (prefixos `_next/`, `logos/` + ícones de metadata por nome); páginas/APIs com ponto no nome sempre passam pelo proxy.

### B1 (BAIXO) — `nextSeguro` aceitava backslash
`/\evil.com` (≡ `//evil.com` no browser) passava o filtro anti-open-redirect (hoje neutralizado porque consumidores usam `url.pathname`, mas foot-gun para consumidores futuros).
**Correção:** `src/lib/auth/areas.ts` — rejeita `\`, `%2f`, `%5c`, `/auth` (case-insensitive); endurecido.

### B2 (BAIXO) — Usuário desativado mantinha sessão/JWT até expirar
Fail-closed (o guard nega por request), mas sem **revogação ativa** da sessão já emitida.
**Correção:** `admin/acessos/actions.ts` — ao desativar, `auth.admin.signOut(userId)` (best-effort) encerra as sessões vivas.

### Higiene (informativos) corrigidos
- `/auth/confirm`: `type` validado contra allowlist (sem cast cego de query string).
- `/auth/signout`: checagem de `Origin == host` (anti logout-CSRF real) + comentário corrigido.
- `config.toml`: `enable_signup = false` (fonte versionada da intenção convite-only).

---

## Achados verificados e descartados como exploráveis (2ª ordem)

### A1 (reportado ALTO) — Signup público do GoTrue aberto → "convite-only" furado
**Veredicto: não é caminho de exposição de dados.** Os fatos conferem (signup remoto aberto até o passo manual de ativação; a anon key é pública; `shouldCreateUser:false` só governa o magic-link do app, não o endpoint `/auth/v1/signup`). Porém uma conta-fantasma é **sem dentes**: `app.exigir_acesso` rejeita qualquer `authenticated` sem linha **ativa** em `app.rbac_usuarios` (independe da flag de enforcement); os leitores de dado reais (`__nucleo`) são service-role-only; as `admin_*` exigem `admin/acessos`; RLS deny-by-default. → passa o proxy, mas não lê nada nem executa nada privilegiado.
**Encaminhamento:** hardening de ativação (fechar signup no Dashboard) — runbook §1.4; intenção agora versionada no `config.toml`. O invariante de **acesso** ("quem não foi convidado não vê nada") é verdadeiro por construção; preciso ajustar a redação do ADR-0106 (era "login impossível"; correto é "acesso impossível").

---

## Achados aceitos por design (decisão de produto, documentados)

### D1 — Área `performance` (aba Geral) e `executiva`/`metas` veem agregados/detalhe cross-setor
`areas_do_setor('todos') = ['executiva','performance']`; RPCs como `get_kpis`/`get_ranking_*`/`get_executiva_kpis` com `p_setor='todos'` são liberadas a quem tem `executiva`, `performance` ou `metas`. **É a semântica pretendida:** a aba Geral de Performance, a Executiva e Metas são visões consolidadas da empresa — agregam todos os setores por definição. Não é vazamento cross-setor: um usuário restrito a `performance/trips` (sem `executiva`/`performance`/`metas`) é negado nesses agregados (verificado no S2). Quem precisa de separação estrita de setor recebe apenas a área do setor. Registrado para revisão de produto caso a diretoria queira granularidade mais fina dentro de Metas.

---

## Verificações determinísticas (todas ✅)

- 23/23 rotas de API com `requireAreaApi`; 12/12 páginas guardadas (exceto `/`, `/login`, `/sem-acesso` — corretas); 3 grupos de server actions com `requireAreaAction` (login = público por design).
- Nenhuma função `__nucleo` executável por anon/authenticated; `get_my_profile` (resquício v4-1) revogada (service-role-only).
- 45 funções `public` executáveis por anon = 44 wrappers de leitura guardados + `rbac_verificar_guard`; nenhuma não-`get_` fora disso.
- RLS habilitado em 33/33 tabelas; 4 matviews sem grant a anon/authenticated.
- Bordas do matcher (trailing slash, caixa alta, `?x=.png`, `%2e`) re-protegidas no preview.
- Mapa de áreas banco↔app em paridade (teste de contrato).

## Conclusão

A missão atende ao S11: a auditoria adversarial encontrou achados reais, **todos os de severidade ≥ médio foram corrigidos** (migrations 0123/0124 + endurecimento de código), e os residuais são hardening de ativação documentado ou decisões de produto explícitas. Nenhum bypass de autenticação, escalação de privilégio, RLS permissivo ou caminho de exposição cross-role permanece em aberto.
