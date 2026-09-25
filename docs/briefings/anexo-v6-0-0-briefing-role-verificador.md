# Anexo da v6.0.0 — briefing da role `verificador` (planejado como v5.11.0, adiado para a v6)

> **Nota da v6.0.0 (2026-09-21):** briefing original, incorporado **sem alteração de conteúdo** como spec da Frente A1/M1 da v6.0.0 (decisão 4 de `briefing-v6-0-0-fundacao-ingestao.md`). A numeração citada abaixo está **defasada**: próxima migration livre é a **0273**, próximo ADR livre é o **0175** (conferir no remoto no ato). O número v5.11.0 foi usado pela Estante Welcome. As missões M1–M7 deste anexo correspondem à M1 da v6.0.0.

---

# Briefing v5.11.0 — Role `verificador`: a credencial que verifica não escreve

**Tipo:** MINOR · **Migration:** **1 aditiva** (role + grants; numerar na hora — próxima livre `0271`) · **ADR:** **1 novo** (próximo livre `0174`, conferir no remoto) — "Separação entre credencial de verificação e credencial de aplicação" · **Base:** `main` (v5.10.2) · **Branch:** `feat/v5-11-0-role-verificador` · **Rota A**

> ## ⛔ GATE — a prova adversarial fecha a versão
> A versão **não fecha** sem a reprodução controlada do incidente: uma varredura que chame uma RPC de
> escrita (`truncar_*`) com a credencial de verificação tem de receber **`PERMISSAO_NEGADA`**, e o
> mesmo comando com `service_role` (fora do escopo do agente) continuar funcionando. Barreira que não
> foi vista negando não vale — lição paga três vezes na v5.10.0.

## Objetivo

O incidente de 12–13/09 zerou 306.261 linhas porque uma varredura chamou todas as RPCs "para ver quais
devolviam 500", com `service_role`, e entre elas havia funções de truncate. A lição foi para a skill, mas
**não há enforcement mecânico** — este é o risco residual mais relevante que a v5 deixou.

Esta versão fecha a classe: a credencial que o agente usa para **verificar** deixa de poder **escrever**.
A barreira é do servidor (grants), não da disciplina, e é complementada por sondas que impedem o retorno
à credencial antiga.

## Estado medido (10–14/09, catálogo vivo — não presumir, já foi conferido)

- **`app.exigir_acesso` NÃO precisa mudar.** O corpo vivo não checa papel além do caso `service_role`:
  exige claims presentes, `sub` não-nulo, usuário **ativo** em `app.rbac_usuarios` e área compatível. Um
  JWT com `role: 'verificador'` **e** `sub` de um usuário real ativo percorre o caminho normal de usuário.
  A função de segurança central fica **fora do escopo**.
- **Volatilidade NÃO serve de critério de grant.** `public` tem 65 `STABLE` e **191 `VOLATILE`**, e entre
  os `VOLATILE` há leitores puros (`get_cagr`, `get_acumulado_weddings`, `get_cagr__nucleo`) — `VOLATILE`
  é o default do `CREATE FUNCTION` e ninguém declarou. "EXECUTE só nas STABLE" quebraria a suíte.
- **Há sobrecargas** (`get_acumulado_weddings`, `delete_gerencial_lancamento`,
  `delete_gerencial_lancamentos_bulk` aparecem 2×). Grant é **por assinatura**.

## Decisões do Yan (firmes — embutir, não rediscutir)

- **Allowlist explícita**, não heurística de volatilidade: o `verificador` nasce sem nada e recebe
  `EXECUTE` só no que a verificação chama.
- **JWT de validade longa, fixo no `.env.local`** (`SUPABASE_VERIFICADOR_KEY`). Sem geração sob demanda
  nesta versão.
- **O usuário de verificação recebe TODAS as áreas de leitura** — minimizar áreas encareceria os casos de
  contrato sem reduzir a superfície que importa (a de escrita, que os grants já fecham).

## Frente A — Banco (migration aditiva)

1. **`CREATE ROLE verificador NOLOGIN`** + `GRANT verificador TO authenticator` (é assim que o PostgREST
   troca de papel) + `GRANT USAGE` nos schemas que as funções da allowlist habitam. **Nada mais.**
2. **`REVOKE ALL ON ALL FUNCTIONS`** nos schemas do app **FROM `verificador`** (nascer fechado, explícito,
   mesmo sendo o default) + **`ALTER DEFAULT PRIVILEGES … REVOKE`** para função futura não nascer aberta
   (a armadilha do `pg_default_acl` que a v4.13 já pagou).
3. **Allowlist:** `GRANT EXECUTE` **por assinatura (`oid`)** nas funções que a verificação realmente chama.
   A lista é **derivada mecanicamente** do `rpc-contrato.test.ts` (e dos scripts de verificação vivos),
   não escrita à mão; o script de derivação vai no commit e a lista entra no header da migration.
4. **Usuário de verificação:** linha ativa em `app.rbac_usuarios` com **todas as áreas de leitura**
   (derivar de `rbac_role_permissoes`; nenhuma área administrativa). Nome inequívoco
   (ex.: `verificador@janus.interno`) para nunca ser confundido com pessoa.

**Fail-closed por construção — o ganho que justifica a allowlist:** RPC nova nasce **inalcançável** pela
verificação; o caso de contrato dela falha com `PERMISSAO_NEGADA` até alguém conceder deliberadamente.
Isso é desejado, e precisa estar no ADR e na mensagem de erro do helper de verificação, senão a próxima
versão vai achar que quebrou algo.

## Frente B — Credencial

- JWT assinado com o segredo do projeto, claims `role: 'verificador'` + `sub` do usuário de verificação,
  validade longa. Vai para `SUPABASE_VERIFICADOR_KEY` no `.env.local` **e** no `.env.example` (só nome +
  comentário, nunca o valor — regra da v5.10.0/D10-003).
- **Procedimento de geração e de rotação** em `docs/runbooks/` (curto): como gerar, onde guardar, como
  revogar (desativar o usuário em `rbac_usuarios` mata o JWT imediatamente, porque `exigir_acesso` exige
  `ativo` — isso é a alavanca de emergência e vale escrever).
- `SUPABASE_SERVICE_ROLE_KEY` **continua existindo** (o app precisa dela: admin, Storage) — o que muda é
  **quem pode usá-la**.

## Frente C — Barreiras (o item que justifica a versão)

**C1 — Sonda de credencial.** Reprova `SUPABASE_SERVICE_ROLE_KEY` fora dos **pontos declarados**
(cliente admin da aplicação, wrapper de migration, e o que o grep no ato provar legítimo — lista fechada
e nomeada no próprio teste). Teste de contrato, script de medição e varredura passam a usar
`SUPABASE_VERIFICADOR_KEY` ou não passam no gate. Molde: `sonda-teste-escreve-banco.test.ts` — **análise
estática do código-fonte**, nunca leitura de saída de runner (lição da v5.10.1: sonda estática atravessa
major ilesa).

**C2 — Trava read-only nos scripts de medição.** Todo acesso por `SUPABASE_DB_URL` fora dos testes que
escrevem-e-revertem (convenção v5.9.6, 3 arquivos inventariados) abre com
`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` — precedente da medição do baseline da v5.4.5. A
mesma sonda cobra. É a porta que a role **não** alcança.

**C3 — Ambas vistas reprovando por mutação**, sob o vitest 5: um arquivo mutante usando
`SUPABASE_SERVICE_ROLE_KEY` num script de verificação, outro abrindo `pg` sem a trava. Remover os
mutantes antes do commit (o `git status` limpo é parte da prova).

## Invariantes (inegociáveis)

1. **`app.exigir_acesso` NÃO é alterada.** Se a implementação descobrir que precisa, **PARE** — muda a
   natureza da versão e volta ao Chat.
2. **Zero mudança de comportamento para usuário final:** `authenticated`, `anon` e `service_role`
   continuam exatamente como hoje. Caso de contrato provando os três (inclusive a negação a `anon`).
3. **Grants por assinatura**, nunca por nome (há sobrecargas).
4. **A allowlist é derivada, não redigida** — script no commit, lista no header da migration.
5. **Nenhum segredo em arquivo versionado.** `.env.example` leva só o nome da chave.
6. **A prova adversarial é obrigatória** (GATE): `truncar_*` com a credencial de verificação ⇒
   `PERMISSAO_NEGADA`; leitura da suíte ⇒ 200. Transcrita no out-briefing.
7. **A suíte inteira roda com a credencial nova** e mantém 1.220 testes, 0 skip. Teste que passar a
   pular porque a chave não alcança a RPC é **regressão**, não skip legítimo.

## Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M1** | **Derivação da allowlist:** script que extrai de `rpc-contrato.test.ts` (+ scripts de verificação) o conjunto de RPCs chamadas, resolve para `oid`/assinatura no catálogo vivo e emite o bloco de `GRANT`. Reportar a contagem e as que ficaram de fora por serem de escrita. | a lista cobre 100% das RPCs chamadas pela suíte; sobrecargas resolvidas por assinatura |
| **M2** | **Migration aditiva** (role, grants, default privileges, usuário de verificação com todas as áreas de leitura). `classificarSql` ⇒ `aditiva`. `revisor-db` **antes** de aplicar. | ensaio em transação revertida; `revisor-db` sem CRÍTICO/ALTO |
| **M3** | **Credencial:** gerar o JWT, `.env.local`, `.env.example`, runbook de geração/rotação/revogação. | REST com a chave nova executa uma RPC de leitura da allowlist (200) |
| **M4** | **Troca de chave** nos testes de contrato e scripts de verificação; suíte completa com a credencial nova. | **1.220 testes, 0 skip** — contagem idêntica |
| **M5** | **Sondas C1+C2**, vistas reprovando por mutação (C3). | mutantes reprovados e removidos; `git status` limpo |
| **M6** | **GATE — prova adversarial:** varredura sintética chamando `truncar_*` com a credencial de verificação. Transcrever a negação. | `PERMISSAO_NEGADA` em toda função de escrita tentada |
| **M7** | **Fechamento:** v5.11.0; CHANGELOG; CHANGELOG_DIRETORIA (uma linha: reforço de segurança interno, sem mudança para quem usa); **ADR** da separação de credenciais; skill `banco-e-rpc` (a verificação usa `SUPABASE_VERIFICADOR_KEY`; `service_role` só no wrapper humano; RPC nova nasce fora da allowlist **de propósito**); WORKING-CONTEXT. | — |

## Gates

`tsc`+`lint` por missão; `build`+`test` na fronteira (após M4) e no fechamento (baseline 1.220).
`revisor-db` na M2 antes de aplicar; `revisor` ao fim. Verificação pós-aplicação via REST. Sem
`verificador-visual` (sem UI). `database.ts` **não** se regenera (nenhuma RPC criada ou alterada).

## Checkpoint do Yan

Aplicar a aditiva; ler o parecer do `revisor-db` sobre os grants e os default privileges; **assistir à
prova adversarial da M6** (é o coração da versão); guardar o JWT; validar o runbook de rotação lendo-o
como quem vai usá-lo às 3h da manhã.

## Fronteira

**Fora:** alterar `app.exigir_acesso`; declarar `STABLE` nos ~191 leitores marcados `VOLATILE`
(**backlog v6** — item novo: além de tirar significado da volatilidade, custa otimização, e quando feito
o filtro `provolatile <> 'v'` vira segunda camada barata de verdade); geração de JWT sob demanda; role
`pg` read-only separada para `SUPABASE_DB_URL` (a trava de sessão resolve por ora); `harness-base`
(próximo passo, depois desta); qualquer mudança de UI ou de RPC.

## Skills a ler

- `.claude/skills/banco-e-rpc/SKILL.md`
- `.claude/skills/contrato-rpc-front/SKILL.md` (só se algum contrato mudar — não deve)
- `.claude/skills/orquestracao/SKILL.md` (Carta, antes de despachar)

## Commits sugeridos

1. `docs(v5-11-0): briefing da versao`
2. `chore(db): script de derivacao da allowlist de verificacao`
3. `feat(db): role verificador com allowlist por assinatura`
4. `chore: verificacao passa a usar SUPABASE_VERIFICADOR_KEY`
5. `test: sondas de credencial e de trava read-only`
6. `chore(release): v5.11.0`
