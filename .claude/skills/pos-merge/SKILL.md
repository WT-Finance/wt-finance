---
name: pos-merge
description: Ritual de pós-merge do Janus — depois que o usuário mergeia o PR da versão, sincroniza o checkout raiz (git pull --ff-only), remove a worktree da versão com segurança (só com o trabalho já no main), poda referências e reconcilia a data do CHANGELOG_DIRETORIA ao horário real do merge. Use quando um PR de versão acabou de ser mergeado (/pos-merge) ou quando o usuário pedir a limpeza da worktree da versão.
---

# /pos-merge — sincronização e limpeza

Pré-condição: o PR da versão foi **mergeado pelo usuário** (confirmar com
`gh pr view <nº> --json state,mergedAt` — estado MERGED).

## 1. Sincronizar a raiz

Na **raiz do main** (nunca de dentro da worktree que será removida):

```bash
git pull --ff-only
```

## 2. Verificar que a worktree não tem trabalho fora do main

```bash
git -C <worktree> status --short          # nada relevante pendente (untracked de ambiente ok)
git log origin/main..feat/<vX-Y> --oneline # deve ser VAZIO (tudo mergeado)
```

Qualquer commit fora do main ou modificação não-commitada relevante → **PARAR** e perguntar
(barreira: nunca remover worktree com trabalho não-merjado). Cópias untracked 0950–0954 e
symlinks de ambiente não contam como trabalho.

## 3. Remover a worktree e podar

Sempre a partir da raiz:

```bash
git worktree remove .claude/worktrees/<nome> --force   # --force só limpa symlinks/untracked de ambiente
git worktree prune
git branch -d feat/<vX-Y>                              # a branch local já mergeada
```

## 4. Reconciliar a data do CHANGELOG_DIRETORIA

Regra do projeto: a entrada nasce com a hora real de AUTORIA; o ideal é refletir a hora real
do MERGE. Conferir:

```bash
git log --merges -1 --format='%ci %s'
```

Se a data da entrada da versão em `src/data/changelog-diretoria.ts` divergir do merge real
(fuso −03), corrigir **via PR próprio de docs** (precedente: PR #196) — nunca commit direto
no main.

## 5. Conferir o WORKING-CONTEXT

O `docs/WORKING-CONTEXT.md` do main deve refletir o estado pós-merge (versão em produção,
bloqueios que caducaram FORA). Se ficou stale, incluir a correção no mesmo PR de docs do
passo 4.
