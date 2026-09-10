# Relatório de Auditoria v5 — Fase 1 (v5.10.0) · **GATE 1: triagem pendente**

Data: 2026-09-10 · Base: `main` em `885da65` (v5.9.6) · Branch `chore/v5-10-0-limpeza-fechamento-v5` ·
Briefing: `docs/briefings/briefing-v5-10-0-limpeza-fechamento-v5.md`.

Este relatório consolida os 10 arquivos por dimensão desta pasta. **As colunas `triagem` e `nota` de
cada tabela estão vazias por desenho**: o Yan e o Chat preenchem cada achado com `agir agora` ·
`backlog v6` · `descartar`, e o relatório triado (commitado de volta) é a spec da Fase 2. Achado que não
estiver em `agir agora` não é tocado.

## Baseline (o que "zero mudança de comportamento" tem de preservar)

| medida | valor | fonte |
|---|---|---|
| Testes | **1207** em 72 arquivos, 0 skip, 103 s | `_insumos/vitest-tempos.limpo.txt` |
| `tsc --noEmit` / `eslint` | ambos limpos | `_insumos/lint-baseline.txt` |
| Funções no banco (schemas do app) | 296 (public 266 · app 18 · analytics 4 · financeiro 4 · patrimonio 4) | `_insumos/catalogo-funcoes.txt` |
| Relações (tabelas/views/MVs) | 85 · colunas 758 · índices 311 (119 com `idx_scan=0`) | `_insumos/catalogo-*.txt` |
| Constraints / triggers / policies | 141 / 15 / 4 | `_insumos/catalogo-constraints-triggers-policies.txt` |
| Dependências | 13 prod + devDeps; 21 desatualizadas (6 majors) · 13 vulnerabilidades (1 critical, 7 high) | `_insumos/npm-*.{txt,json}` |
| `docs/briefings/` | 163 arquivos (92 pré-v5 + 71 v5) | `ls` |
| `WORKING-CONTEXT.md` | 1.240 linhas | — |
| `zinc-*` em `src/` | 1.675 ocorrências / 1.301 linhas / 137 arquivos | D9 |

## Contagem por dimensão × classe (gerada por `_insumos/contar-classes.mjs`)

| dimensão | achados | apagar | corrigir | simplificar | documentar | decidir |
|---|---|---|---|---|---|---|
| D1-codigo-morto | 25 | 6 | 2 | 4 | 3 | 10 |
| D2-banco-objetos | 16 | 5 | 1 | 1 | 7 | 2 |
| D3-banco-desempenho | 7 | 0 | 0 | 1 | 0 | 6 |
| D4-tipagem | 15 | 0 | 4 | 3 | 7 | 1 |
| D5-erros-latentes | 7 | 0 | 2 | 0 | 5 | 0 |
| D6-dependencias | 14 | 0 | 3 | 0 | 8 | 3 |
| D7-testes | 10 | 0 | 0 | 1 | 7 | 2 |
| D8-documentacao | 23 | 4 | 5 | 1 | 6 | 7 |
| D9-nomenclatura-residuo | 21 | 0 | 6 | 0 | 9 | 6 |
| D10-harness-config | 7 | 0 | 1 | 0 | 3 | 3 |
| **total** | **145** | **15** | **24** | **11** | **55** | **40** |

`documentar` (55) inclui os checks que saíram **limpos** (RLS, grants anon, skills sem lição falsa, sonda
exata, sem TODO real) — registrados para não serem reinvestigados, não são trabalho.

## O que salta (leitura da sessão principal, por prioridade)

**Segurança — fora da lógica de "limpeza", mas o mais grave do lote**
- **D6-003** `next` 16.2.9 tem 2 CVEs *critical* (RCE) com fix **minor** (16.3.4). Recomendo `agir agora`.
- **D6-004/005** `nodemailer` 9 e `vitest` 3 têm CVEs moderate/high com fix **major** → decisão.
- **D10-001** As regras `allow`/`deny` de permissões que o `CLAUDE.md` descreve (inclusive o `deny` de
  `db push` cru) **não existem em nenhum `settings.json`** — a "terceira camada" é prosa. Ato humano.

**Banco (Fase 2 blocos 2–4)**
- Aditiva (0269): grants explícitos em 21 funções (**D2-010**), `COMMENT ON FUNCTION` nas centrais
  (**D2-016**), texto de erro "WT Finance" em função viva (**D9-015**), `NOTIFY`.
- Destrutiva (GATE 2, fora da pasta até a hora): 9 funções mortas (**D2-001…005**), constraint redundante
  (**D2-013**), e — se decidido — 3 RPCs da branch stand-by #213 (**D2-007**). Índices `idx_scan=0`
  (**D3-001…003**) são indício, não prova: remedir antes; sugiro v6.
- **Nunca**: `admin_set_enforcement` (**D2-006**, kill switch do runbook), `pode_assinar_area` (policy RLS),
  3 trigger functions — falsos positivos do grep que o relatório corrige.

**Código**
- Morto de fato: 6 componentes/arquivos em `src/` + 6 scripts de debug em `supabase/seed/` (**D1-006…012**).
  Ao apagar os scripts, recontar o mapa RPC→chamadores antes da destrutiva.
- Export supérfluo (não código morto): ~4 arquivos de schemas/helpers (**D1-015…019**) — remover só o `export`.
- `admin/acessos/actions.ts` descarta o `error` de duas RPCs (**D5-002/003**) — bug latente real, sem teste
  local; regra 1 do briefing diz "corrige se coberto" → decidir se a Fase 2 escreve o teste.
- 34 usos de `(x.rpc as any)` (26 em `faturamento-corp/actions.ts`, **D4-009/010**) + 9 route handlers sem
  `parseRpc` (**D4-006/007/008**) — a maior área sem rede de contrato.
- `/metas`: `buscarUltimaSincronizacaoMonde()` fora do `Promise.all` (**D3-005**, S, seguro).

**Docs (Fase 2 bloco 5)**
- 96 arquivos pré-v5 em `docs/briefings/` sem citação por caminho (**D8-001/002/003**) + `faturamento-legado`
  (**D8-006**); `audits/`, `investigacoes/`, `harness/`, `superpowers/` pedem leitura antes (**D8-005**).
- `README.md` descreve a v5.0.0 e abre como "WT Finance" (**D8-008…011**); `design-system.md` mente no
  cabeçalho (**D8-013**) e cobre menos que a página viva (**D8-014**).
- `WORKING-CONTEXT.md` é histórico empilhado (**D8-012**) → `estado-do-projeto.md`.

## Conflitos e correções entre dimensões (resolvidos na consolidação)

| tema | dimensões | resolução |
|---|---|---|
| `mockup-dados.ts` | D1-008 dizia `apagar`; D9-019 leu o cabeçalho: oráculo congelado com condição de PRODUTO | D1-008 reclassificado para `decidir` |
| `exportar.mjs`, hooks, `dre-oracle.mjs` | knip "unused"; D1-001/002/003 e D10-005 provam chamada por config/processo/ADR | manter (falso positivo do knip) |
| `pode_assinar_area`, `fn_*` | mapa RPC→chamadores dizia órfãs; D2-008/009 provam uso em policy RLS e triggers | excluídas da lista de órfãs; método corrigido |
| `@typescript-eslint/parser` | D1-014 = D6-002 | uma ação só (declarar devDependency) |
| `skipIf` silencioso | D5-004 = D7-004 | uma ação só (sonda/contador) |
| `TODO/FIXME` | D5-005 = D9-020: 39 hits são a palavra "todo" em pt-BR | zero marcador real; corrigir a metodologia |
| `package.json name` | D9-011 = D10-006 | decisão única do Yan (junto do nome do repo) |
| `docs/harness`, `docs/superpowers` | D8-005 e D10-007 | classificação única em D8-005 |

## Divergências briefing × repo encontradas na Fase 1

- `zinc-*`: **1.675 ocorrências**, não ~400 (D9-001).
- "Inventário dos que escrevem no banco — hoje 1": são **3** desde a v5.9.6, e a sonda enumera os 3 (D7-003).
- `database.ts` "congelado": é **manuscrito da M1** e cobre ~25% das RPCs — o helper frouxo é o caminho
  principal, não a exceção (D4, achado prévio).
- "13 pastas de skills": são **14** (D10-002).
- `TODO/FIXME` "39": zero reais (D5-005).
- Ferramentas (`knip`, `depcheck`) não estavam instaladas; rodaram por `npx` sem entrar no `package.json`.
- Exploradores não têm Bash/Write: os insumos mecânicos rodaram na sessão principal e ficaram em
  `_insumos/`; os arquivos D1–D10 foram gravados pela sessão principal a partir do retorno de cada explorador.

## Itens `decidir` que precisam do Yan (agrupados)

1. **Produto:** PR #213 stand-by (`metas_subsetor_*`) — mergear ou dropar (D2-007); `mockup-dados.ts`
   como oráculo (D1-008/D9-019); `seed-fluxo-caixa.ts` ainda usado? (D1-013); 2 scripts one-off (D1-004/005);
   `localStorage` `wt-finance-*` com migração de chave (D9-014).
- 2. **Infra/harness (ato humano):** regras `allow`/`deny` (D10-001); `engines.node` (D10-006);
   hook para `git add -A` (D8-022); nome do pacote/repo (D9-011/D10-006).
3. **Tipagem:** regenerar `database.ts` × manter congelado + helper (D4-001, D1-022).
4. **Segurança com major:** `nodemailer` 10, `vitest` 5 (D6-004/005) — v6 ou já.
5. **Docs:** `design-system.md` espelhar a página ou morrer (D8-014); `audits/`/`investigacoes/` (D8-005);
   3 runbooks sem citação (D8-007); apêndice ADR v3-6 (D8-016).

## Achei, não vou agir (consolidado — não reinvestigar)

Colunas do banco coluna a coluna (D2); FKs sem índice; UNIQUE×PK (a extração excluiu PKs); chamador exato
dos seq scans (D3-004); assinatura-a-assinatura das 55 RPCs do congelado (D4); 42 hits de "supersed" nos
ADRs (D8-018); skill `ingestao-planilhas` não verificada (D8-021); peso real do bundle (D6, Fase 2);
mapeamento tonalidade-a-tonalidade de `zinc` (D9).

## Fora do escopo desta versão, mas sinalizado

- **Nenhum CI de PR** (`.github/workflows` ausente) — gates dependem 100% da disciplina local (D10).
- Cor hardcoded via prop do Recharts escapa do lint (`kpi-detail-drawer.tsx`, D9-007) — generalizar a
  checagem é candidato de lint `wt/*`.
- Um 4º arquivo de teste que escreva-e-reverta dispara a reavaliação de ambiente de teste (D7-003).
