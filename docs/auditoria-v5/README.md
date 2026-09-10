# Auditoria v5 — formato único (v5.10.0, Fase 1)

Briefing: `docs/briefings/briefing-v5-10-0-limpeza-fechamento-v5.md`. Um arquivo por dimensão
(`D1-…md` a `D10-…md`), consolidado em `relatorio.md`. Insumos brutos das ferramentas ficam em
`_insumos/` (reprodutibilidade: cada achado aponta para um deles ou para `caminho:linha`).

## Tabela por dimensão (obrigatória, colunas nesta ordem)

| id | achado | evidência | risco | esforço | ação proposta | classe | triagem | nota |
|---|---|---|---|---|---|---|---|---|

- **id**: `D<n>-<seq>` (ex.: `D2-007`), sequência por dimensão, nunca reutilizado.
- **achado**: uma frase, verificável.
- **evidência**: `caminho:linha` (ou intervalo), ou `_insumos/<arquivo>` + query/linha. Sem evidência
  reproduzível o achado não entra.
- **risco** (de agir): `baixo` · `médio` · `alto`.
- **esforço**: `S` (≤ 1 missão curta) · `M` (uma missão) · `L` (várias missões / redesenho → backlog v6).
- **ação proposta**: verbo + objeto (ex.: "apagar `src/x.ts` e seu teste").
- **classe**: `apagar` · `corrigir` · `simplificar` · `documentar` · `decidir`.
- **triagem** (vazia na Fase 1; preenchida no GATE 1): `agir agora` · `backlog v6` · `descartar`.
- **nota**: vazia na Fase 1; comentário da triagem.

Após a tabela, cada arquivo traz: **Síntese** (≤ 5 linhas), **Contagem por classe** e
**"Achei, não vou agir"** (o que ficou fora por timebox, para não ser reinvestigado).

## Regras

1. Órfão de relatório não é órfão de fato — a prova definitiva é o grep **no ato** do commit (Fase 2).
   **A varredura tem de incluir `docs/runbooks/` e `docs/adr/`, não só código.** Custou um achado
   ALTO no Bloco 1 da v5.10.0: o `export` de `getPool` foi removido como órfão, mas o
   procedimento de restore em `docs/runbooks/db-backup-gate-runbook.md:65` o **importa** dentro
   de um code-fence — consumidor vivo que nem o knip nem um grep em `src`/`scripts`/`supabase`
   alcançam, e que só falharia com alguém recuperando o banco sob pressão.
2. Achado `L` ou que exige redesenho vai também ao rascunho de `docs/backlog-v6.md`.
3. Exploradores só leem; quem escreve estes arquivos é a sessão principal, a partir do retorno deles.
