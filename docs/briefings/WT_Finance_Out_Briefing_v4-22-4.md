# WT Finance — Out-Briefing v4.22.4

**Data:** 2026-06-18 · **Branch:** `feat/v4-22-4-contas-reordenar` (base `main`) · **Versão:** 4.22.3 → **4.22.4** (PATCH)
**Tema:** Drawer "Gerenciar contas" — reordenação por arrastar-soltar + confirmação do "adicionar" abaixo da tabela. Migration 0153. **Merge e deploy ficam com o usuário.**

---

## Ajustes

### 1. Botões do "adicionar" abaixo da tabela (`contas-manager.tsx`)
Ao adicionar uma conta, os ícones ✓/✕ ficavam espremidos na coluna estreita de ações (40px), sobrepondo-se ao seletor de Papel. Agora a linha de "adicionar" **não tem mais** os botões inline; eles viraram **Salvar / Cancelar** num rodapé `flex justify-end` **abaixo da tabela** (Salvar = `--brand`; Cancelar = neutro). "Cancelar" reseta o formulário.

### 2. Reordenar contas por arrastar-soltar (`contas-manager.tsx` + migration 0153 + action)
- **UI:** coluna de **puxador** à esquerda (`GripVertical`, `cursor-grab`), draggable por linha (DnD nativo HTML5 — sem dependência nova). A `<tr>` é alvo de drop (`onDragOver`/`onDrop`); a linha arrastada fica `opacity-40`. Ao soltar: reordena **otimista** (`onContasChange` com `ordem` 1..N) + persiste + `router.refresh`. A ordem das linhas **define a ordem dos cards na Visualização Agregada** (ambos ordenam por `ordem`).
- **Persistência (migration 0153):** RPC nova `reordenar_gerencial_contas(p_contas TEXT[])` — `UPDATE ... SET ordem = posição` via `unnest(p_contas) WITH ORDINALITY` (atômico, um único UPDATE; só toca `ordem`). Born-hardened: `exigir_acesso(['financeiro/gerencial'])` + `GRANT authenticated`. Action `reordenarContas(ordem: string[])`.

## Banco — migration 0153
- **ADITIVA / retrocompatível:** RPC nova; o `UPDATE` só roda sob ação do usuário (arrastar) e reescreve apenas a coluna `ordem`. Sem DDL de tabela, sem escrita em dado pré-existente fora de `ordem`.
- ⚠️ O heurístico do db-gate marca destrutiva (literal `UPDATE` no corpo da função) → **aplicada sob confirmação humana consciente** (mesmo caso da 0150). _[após aplicar: ver §verificação]_

## Gates
`tsc --noEmit` **0** · `lint` **13** (= baseline) · `next build` **limpo** (47/47) · `npm test` **131**.

## Arquivos
**Novos:** `supabase/migrations/0153_gerencial_reordenar_contas.sql`, este out-briefing.
**Modificados:** `src/components/financeiro/gerencial/contas-manager.tsx` (drag handle + DnD + botões), `src/app/financeiro/fluxo-caixa/gerencial/actions.ts` (`reordenarContas`), `package.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`.
**Sem ADR** (RPC CRUD-adjacente; sem decisão arquitetural nova).

## Pendências / fora de escopo
- Reordenação é nível-DIA de UX (poucas contas); sem virtualização/biblioteca de DnD (nativo basta).
