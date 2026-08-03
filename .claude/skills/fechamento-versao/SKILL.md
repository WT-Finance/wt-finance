---
name: fechamento-versao
description: Ritual de fechamento de versão do Janus — o Definition of Done integral como procedimento, com gates escalonados (build+test no fechamento), despacho dos revisores (revisor sempre; revisor-db se migration/RPC; verificador-visual se UI), out-briefing com Parecer da revisão, WORKING-CONTEXT, CHANGELOG.md + CHANGELOG_DIRETORIA (regra da data real), version bump, avaliação de aprendizado pela régua de 5 destinos e abertura do PR. Use ao fechar qualquer versão ou patch (/fechamento-versao), depois que todas as missões do briefing estiverem implementadas.
---

# /fechamento-versao — DoD integral

Pré-condição: todas as missões da versão implementadas na worktree; auto-auditoria adversarial
do orquestrador feita (verificar a realidade contra o briefing — inclusive erros DELE).

## 1. Revisão de contexto separado (ANTES dos gates)

Despachar em paralelo, com delegação autocontida (objetivo da missão, lista EXATA de arquivos
modificados, "Skills a ler" do escopo):
- **`revisor`** — sempre.
- **`revisor-db`** — se a versão contém migration/RPC (ANTES de aplicar qualquer migration).

Achados **CRÍTICO/ALTO → corrigir antes dos gates**; MÉDIO/BAIXO → endereçar ou registrar no
out-briefing com justificativa. O parecer integral entra na seção "Parecer da revisão".

## 2. Gates completos (serializados, na worktree)

```bash
npm run build && npx tsc --noEmit && npm run lint && npm test
```

Todos limpos/verdes; lint sem warnings NOVOS. Smoke das áreas afetadas.

⚠️ **Se o `next dev` rodou nesta worktree** (conferência visual do passo 3), o `next build` seguinte
deixa `.next/dev/types/*` para trás e o `npx tsc --noEmit` acusa erro **em arquivo gerado**
(`routes.d.ts`, `validator.ts` — o `**/*.ts` do tsconfig os varre). Não é o código e **não se toca
no tsconfig para calar**: `rm -rf .next` e rodar a sequência de novo. **O mesmo vale ao REMOVER uma
rota** (ex.: a rota de preview de um gate): o `validator.ts` do build anterior segue importando a
página deletada e o `tsc` quebra em arquivo gerado — `rm -rf .next/types` basta. (v5.4.2.) Ordem que evita o retrabalho:
gates → revisores → visual (com dev) → `rm -rf .next` + gates de novo se algo mudou depois. (v5.3.3.)

## 3. Conferência visual (se a versão tocou UI)

O orquestrador sobe `npm run dev` (serializado — subagente NUNCA sobe servidor), despacha o
**`verificador-visual`** com URLs + o que deveria existir + estados a exercitar, derruba o
servidor ao final. Parecer entra no out-briefing.

## 4. Banco (N/A declarado se a versão não tem migration)

- Aplicar via `npm run db:migrate -- --aditiva [--fora-de-ordem]` (destrutiva = SEMPRE humano
  em TTY; bloqueio do harness → protocolo D5 do core, nunca contornar).
- Verificar RPCs novas **via REST com service_role** (`db query` não executa o corpo).
- Rodar os casos de contrato (`npx vitest run src/lib/rpc-contrato.test.ts`).
- Enquanto a renumeração pós-v5.3 não sai: **remover as cópias 0950–0954** antes do merge
  (`rm supabase/migrations/095[0-4]_*.sql`) e conferir que nenhuma entrou em commit.
- Conferir que NENHUMA migration destrutiva ficou pendente na pasta `supabase/migrations/`.

## 5. Documentação da versão

1. **ADR(s)** — verificar a numeração REAL (`ls docs/adr/`), nunca a do briefing.
2. **CHANGELOG.md** — entrada Keep-a-Changelog no topo.
3. **CHANGELOG_DIRETORIA** (`src/data/changelog-diretoria.ts`) — entrada no topo em **linguagem
   de negócio** (efeito/implicação, NUNCA mecanismo — a diretoria não sabe o que é RPC).
   Tipo(s): novidade/correção/melhoria. **Data/hora REAL de autoria** (`date`, fuso −03) —
   NUNCA hora redonda chutada; reconciliar ao horário real do merge no `/pos-merge`.
   TODA entrega entra; patch puramente técnico ganha descrição genérica honesta.
4. **Version bump** — `package.json` (o `src/lib/version.ts` deriva dele).
5. **Out-briefing** — `docs/briefings/WT_Finance_Out_Briefing_<versão>_<Nome>.md`: missões
   implementadas, migrations, ADRs, pendências, arquivos modificados, seção **Parecer da
   revisão** (achados e como foram endereçados). Out-briefing é parte do DoD, não pós-entrega.
6. **WORKING-CONTEXT.md** — versão, bloqueios, filas ativas, data. Item resolvido SAI.

## 6. Aprendizado permanente (régua de 5 destinos)

Avaliar o que a versão revelou e rotear: (1) enforcement mecânico → hook/lint/permissão;
(2) já coberto → nada; (3) toda-sessão + permanente + transversal + custou caro → core
(CLAUDE.md, teto 180 linhas — adicionar é também podar); (4) situacional → skill de domínio;
(5) procedimento → ritual. **Convenção de BANCO mudou? Atualizar a skill `banco-e-rpc` E o
checklist inline do `revisor-db`** (nota cruzada D-12 — os dois andam juntos).

## 7. Consolidar e abrir o PR

```bash
# um commit por missão já deve existir; commits finais específicos (nunca git add -A)
git push origin feat/<vX-Y>
gh pr create --title "<vX.Y.Z> — <nome>" --body "<sumário apontando o out-briefing>"
```

**NUNCA fazer merge. NUNCA fazer deploy** (Vercel deploya no merge). Reportar ao usuário:
o que fechou, pendências, e o que aguarda decisão humana.
