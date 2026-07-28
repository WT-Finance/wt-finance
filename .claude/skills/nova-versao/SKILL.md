---
name: nova-versao
description: Ritual de abertura de versão do Janus — cria a worktree da versão a partir de origin/main, monta o ambiente (symlinks + supabase/.temp), posiciona as cópias provisórias 0950–0954 quando a versão toca banco, copia o briefing untracked para dentro da worktree e o commita (1º commit da versão), carrega a Carta do Orquestrador e entra em plan mode para validar o briefing contra o repo. Invocar manualmente como /nova-versao <vX-Y> no início de toda versão — Rota A, Rota B, e também Rota C (patch), que usa só os passos 1-3 e 6.1/6.3.
disable-model-invocation: true
---

# /nova-versao <vX-Y> — abertura de versão

Argumento esperado: a versão no formato `vX-Y` ou `vX-Y-Z` (ex.: `v5-4-1`), opcionalmente com
slug (`v5-4-1-nome-curto`). Sem argumento → perguntar antes de prosseguir.

**Quais passos rodam, por rota** (o ritual serve as três — não invente um caminho paralelo):

| Passo | Rota A (produto) | Rota B (técnica) | Rota C (patch) |
|---|---|---|---|
| 1-3 sincronizar / worktree / ambiente | sim | sim | **sim** |
| 4 cópias 0950–0954 | só se tocar banco | só se tocar banco | só se tocar banco |
| 5 briefing no 1º commit | sim | se houver briefing | **não existe** — o escopo é o prompt |
| 6.1 WORKING-CONTEXT + 6.3 Carta | sim | sim | **sim** |
| 6.2 ler o briefing | sim | se houver | não se aplica |
| 6.4 plan mode | sim | sim (o plano vira spec commitada) | **não** — vai direto, com gates |

Na **Rota C** o prompt do usuário É a especificação: não há `.md` em `docs/briefings/` para copiar
nem briefing para validar contra o repo em plan mode, e parar para pedir aprovação de plano trava
um patch de um arquivo. O rastro em disco da Rota C nasce no **out-briefing** do
`/fechamento-versao` (que cita o escopo pedido) e na mensagem do commit — não num briefing de
entrada. Tudo o mais é igual: worktree própria, gates escalonados, revisor, PR draft, merge humano.
(Registrado na v5.3.3, o primeiro patch nativo do harness novo.)

## 1. Sincronizar a raiz

Na **raiz do main** (nunca de dentro de outra worktree):

```bash
git pull --ff-only
```

Se o ff-only falhar, PARAR e reportar (a raiz tem estado divergente; não resolver sozinho
com reset/rebase).

## 2. Criar a worktree da versão

Branch: `feat/<vX-Y>[-slug]`. Preferir a ferramenta `EnterWorktree` do harness (cria em
`.claude/worktrees/` a partir de `origin/<default>`); fallback manual:

```bash
git worktree add .claude/worktrees/feat+<vX-Y>[-slug] -b feat/<vX-Y>[-slug] origin/main
```

⚠️ Se o `EnterWorktree` criar a branch com nome `worktree-...`, renomear de dentro da worktree:
`git branch -m worktree-<nome> feat/<vX-Y>[-slug]` (aconteceu na v5.3.2 — a convenção de
branch do projeto é `feat/vX-Y`).

## 3. Montar o ambiente (a worktree nasce crua)

```bash
RAIZ=<caminho da raiz do repo>; WT=<caminho da worktree>
ln -s "$RAIZ/node_modules" "$WT/node_modules"
ln -s "$RAIZ/.env.local"   "$WT/.env.local"
mkdir -p "$WT/supabase/.temp" && cp "$RAIZ"/supabase/.temp/* "$WT/supabase/.temp/"
```

Sem isso faltam dependências, env e o link do Supabase — gates e `npm test` não rodam.

<!-- REMOVER na renumeração pós-v5.3: bloco das cópias 0950–0954 (v5.4.0/PR #191).
     Quando a v5.4.0 mergear e as provisórias forem renumeradas (+ migration repair),
     este passo 4 inteiro deixa de existir. -->
## 4. Posicionar as cópias provisórias 0950–0954 — SÓ se a versão tocar banco

As migrations 0950–0954 estão aplicadas no banco remoto mas só existem na branch da v5.4.0
(PR #191). Sem as cópias, `npm run db:migrate` acusa drift. **Versão que não roda `db:migrate`
pula este passo inteiro** — posicionar cópias que ninguém vai usar só cria untracked para esquecer
de remover antes do merge (v5.3.3 pulou; nada faltou nos gates). Quando for tocar banco,
posicioná-las como **untracked**:

```bash
for f in 0950_api_externa_fundacoes_tipos 0951_api_chaves 0952_api_validacao_compartilhada \
         0953_api_outbox 0954_seed_tipo_abatimento; do
  git show origin/feat/v5-4-0-api-externa:supabase/migrations/$f.sql > supabase/migrations/$f.sql \
    || { rm -f supabase/migrations/$f.sql; echo "ERRO: $f não encontrada na branch de origem — PARAR e reportar (não deixar .sql vazio)"; break; }
done
```

⚠️ O `|| { rm ...; break; }` é obrigatório: `git show` que falha com a redireção deixaria um
`.sql` VAZIO na pasta — e o wrapper de migration varreria o arquivo vazio em silêncio.

Regras: aditiva nova roda com `npm run db:migrate -- --aditiva --fora-de-ordem`; as cópias são
**removidas antes do merge** (`rm supabase/migrations/095[0-4]_*.sql`) — nunca entram em commit.

## 5. Briefing dentro da worktree (1º commit)

O briefing `docs/briefings/briefing-<versão>.md` costuma estar **untracked na raiz** — worktree
não herda untracked. Copiar e commitar (é o que dá histórico ao briefing via PR, sem commit
manual do usuário):

```bash
cp "$RAIZ/docs/briefings/briefing-<versão>.md" "$WT/docs/briefings/"
git add docs/briefings/briefing-<versão>.md
git commit -m "docs(<vX-Y>): briefing da versão"
```

Se o briefing não existir (Rota B/C sem briefing), pular este passo.

## 6. Carregar contexto e validar

1. Ler `docs/WORKING-CONTEXT.md` (o hook `contexto-sessao` já injeta; se ausente, ler manualmente).
2. Ler o briefing da versão.
3. **Carregar a Carta do Orquestrador**: ler `.claude/skills/orquestracao/SKILL.md` — ela rege
   modelos por camada, delegação com "Skills a ler", paralelização e gates escalonados.
4. **Entrar em plan mode** (Rotas A e B — ver a tabela de rotas acima; a Rota C vai direto) e
   validar o briefing contra o repo real (numeração de ADR/migration, consumidores vivos,
   premissas) ANTES de editar qualquer coisa. Divergência entre briefing e repo → reportar no
   plano; ambiguidade real de produto → perguntar.

⚠️ Validar o **escopo** contra o repo vale em TODA rota, com ou sem plan mode: o enunciado erra.
Na v5.3.3 o prompt (herdando o registro da v5.3.2) listava `/trocar-senha` entre as telas
não-autenticadas afetadas — ela exige sessão e nunca esteve afetada; a tela pública que faltava
era `/auth/confirm`. Custou uma leitura de `src/app/trocar-senha/page.tsx`.
