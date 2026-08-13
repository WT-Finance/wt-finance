# Briefing v5.6.2 — Meta de Assessorias no Comparativo (Weddings)

**Tipo:** PATCH · **Migration:** `0249` (aditiva: RPC nova de leitura) · **ADR:** nenhum ·
**Base:** `main` @ v5.6.1 · **Branch:** `feat/v5-6-2-meta-assessorias` · **Rota A curta**
(planejado no chat de 2026-08-11, na sequência da investigação read-only que provou a
identificação de "Contrato de casamento" no espelho da API).

## Objetivo

No Comparativo da página `/metas`, **apenas com Weddings selecionado**, o card do anel (3º card)
encolhe um pouco o visual e ganha, abaixo dele, uma **barra de progresso "Meta de Assessorias"**:
contratos de casamento vendidos no **mês em foco** contra a meta mensal **travada em 14**.

## Decisões do Yan (chat, firmes)

- **Fonte do realizado = API/espelho Monde** (não o upload): RPC nova aditiva contando por
  descrição — regra validada ao vivo (239 contratos desde 2023; 1 item = 1 venda; 100% Weddings).
- **Só contrato novo conta**: `TRIM(produto) ILIKE 'contrato de casamento%'` (inclui a variante
  "- venda online"; exclui "Atualização de Contrato de Casamento" por construção).
- **Meta fixa em 14/mês "por ora"** — constante nomeada (`META_ASSESSORIAS_MENSAL`), trocar é
  editar 1 linha.
- Nome exibido: **"Meta de Assessorias"**.

## Derivadas (defaults do orquestrador)

- A barra acompanha o **mês em foco** (presets e Personalizado), como todo o resto da seção.
- Contagem = `COUNT(DISTINCT venda)` de itens **ativos** (filtro na leitura — regra v5.4.5).
- Fail-safe: RPC falhou/negada ⇒ barra **omitida** (nunca "0 de 14" falso; zero real só quando a
  RPC respondeu 0).
- Anel reduzido (~132px) para a barra caber **sem crescer o card**.
- A barra vive no card do anel; se o mês em foco não tiver meta cadastrada (card ausente), a
  barra não tem onde morar — edge raro, registrado.

## Invariantes

1. **Migration aditiva mínima** (`0249`, número conferido local×remoto): RPC
   `get_contratos_casamento_mes(p_from, p_to)` no padrão INLINE (`exigir_acesso` na 1ª linha,
   áreas `['metas/acompanhamento','metas']` — as mesmas de `metas_listar`), `SECURITY DEFINER`,
   `SET search_path TO ''`, REVOKE/GRANT explícitos. Verificação pós-push **via REST/service_role**.
2. `revisor` + `revisor-db` antes do fechamento; caso de contrato em `rpc-contrato.test.ts`.
3. Sem tocar: Visão geral, card "Contratos" (fonte upload permanece como está), demais setores.

## Gates

`tsc` + lint por edição; `build` + `test` no fechamento; migration via
`npm run db:migrate -- --aditiva`; smoke visual da barra ao vivo (Chrome/Edge).

## Checkpoint do Yan

Selecionar Weddings no Comparativo e conferir a barra ("N de 14") em Este mês/Último
mês/Personalizado; trocar de setor e ver a barra sumir; conferir o N contra o conhecimento do
negócio.
