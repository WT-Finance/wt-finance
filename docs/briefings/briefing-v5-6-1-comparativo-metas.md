# Briefing v5.6.1 — Comparativo na página de Metas

**Tipo:** PATCH · **Migration:** nenhuma prevista (dados existentes cobrem tudo) · **ADR:** nenhum previsto · **Base:** `main` @ v5.6.0 · **Branch:** `feat/v5-6-1-comparativo-metas` · **Rota A**

> Planejado no chat em 2026-08-11 com duas imagens de referência: (1) as pills de setor do
> gráfico de ritmo do período (ativa sólida na cor do setor) e (2) um painel Excel com três
> visuais — colunas "Meta de julho" Previsto × Realizado, barras horizontais "Comparativo"
> por ano (2024/2025/2026, só realizado) e um anel "Meta Agosto" com a meta do mês seguinte.

## Objetivo

A página `/metas` (Acompanhamento) ganha uma **segunda TopSection "Comparativo"**, abaixo da
"Visão geral": pills de setor (Group, Trips, Weddings, Corporativo) que variam a cor como no
gráfico de ritmo, um seletor de período **"Este mês" / "Último mês" / "Personalizado"**
(Personalizado abre **seleção aditiva de meses individuais**, não um range) e os **três
visuais da referência**, adaptados ao design system.

## Decisões do Yan (firmes — embutir, não rediscutir)

- **Os três visuais entram:** colunas Previsto × Realizado do mês em foco; barras horizontais
  comparativas entre os meses selecionados; anel com a meta do mês seguinte.
- **YoY automático:** com "Este mês" ou "Último mês", o comparativo traz o mesmo mês nos anos
  anteriores com dado disponível (realizado do Monde existe desde 2024) — ex.: ago/26 × ago/25 × ago/24.
- **Barras do comparativo mostram só o realizado** (fiel à referência, "Valor Total") — o
  previsto aparece no gráfico de colunas e no anel, não nas barras.
- **Título da seção: "Comparativo"**, mesmo com o link "Modo de Comparação" (Monde × upload)
  existindo no header da página — conceitos distintos, risco de confusão aceito.

## Decisões derivadas (default do orquestrador — confirmar no checkpoint)

- **Mês em foco = o mais recente da seleção.** Ele alimenta as colunas Previsto × Realizado e
  o anel (meta do mês **seguinte** ao mês em foco). "Este mês" → foco ago/26, anel set/26;
  "Último mês" → foco jul/26, anel ago/26 (exatamente a composição da referência).
- **Personalizado:** grade de meses marcáveis (seleção aditiva, meses não-contíguos permitidos),
  desde jan/2024, **teto de 12 meses selecionados**. Referência visual: popover do filtro de
  período compartilhado (`periodo-filter-pills-url`), mas a mecânica (lista de meses, não range)
  é nova.
- **Mês sem meta cadastrada:** exibe só o realizado (coluna/barra de previsto omitida); anel sem
  meta ⇒ elemento omitido, nunca placeholder "sem meta" (lição da v5.2.1: nulo omite).
- **Pills de setor:** o padrão do ritmo-chart — `Tabs` com `corAtiva` e cores de
  `SETOR_MARCA_COLORS` — seleção única, Group incluído.

## Invariantes (inegociáveis)

1. **Paridade absoluta com a Visão geral:** para o mesmo mês/setor, os números do Comparativo
   são os MESMOS dos MetaCards (mesma RPC, mesmo campo, mesma janela). Conferir no checkpoint.
2. **Sem migration.** Compor com `metas_listar(ano)` + `get_executiva_kpis(from, to, setor)`
   (aceita range arbitrário). Se algo inesperado exigir banco: aditiva mínima, backup-gate,
   verificação via REST/service_role.
3. **Reuso antes de construção:** TopSection, `Tabs`+`corAtiva`, primitivos de
   `@/components/charts` (barras horizontais via `ChartXAxisBRL`/`ChartYAxisCategoria`),
   formatação canônica (`fmtBRL`/`fmtMi`/eixos). Skills `graficos`, `ui-design-system`,
   `react-padroes`, `contrato-rpc-front` lidas antes de editar.
4. **O anel é primitivo novo** (não existe donut/radial no app): nasce em
   `@/components/charts`, com tokens do DS — nunca Recharts cru no call-site, nunca hex.
5. **Cores pela semântica da skill `graficos`:** pills e destaque na cor de marca do setor
   selecionado; previsto × realizado com papéis distintos e consistentes nos três visuais.
6. **Escopo trancado:** não tocar a Visão geral, o Modo TV, o Modo de Comparação, o cadastro
   de metas nem o eixo de subsetor de Weddings.

## Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M1** | **Camada de dados.** Composição meta × realizado por (mês, setor): `metas_listar` por ano tocado + `get_executiva_kpis` por mês selecionado, em paralelo, sob demanda (mudança de seleção), com contrato validado (parseRpc/Zod) e loading derivado (skill `react-padroes`). | mesmo mês/setor ⇒ números idênticos aos MetaCards; N meses ⇒ N chamadas paralelas, teto 12 |
| **M2** | **Estrutura da seção.** TopSection "Comparativo" abaixo da "Visão geral"; pills de setor (`Tabs`+`corAtiva`); pills de período "Este mês"/"Último mês"/"Personalizado"; popover de seleção aditiva de meses (grade por ano, desde 2024, teto 12). | pills idênticas às do ritmo; popover não estoura viewport; seleção vazia impossível |
| **M3** | **Os três visuais.** Colunas Previsto × Realizado do mês em foco; barras horizontais do realizado por mês selecionado (rótulo com valor); anel da meta do mês seguinte (primitivo radial novo no DS), na cor de marca do setor. | YoY automático correto nos presets; mês sem meta omite previsto/anel; valores batem com M1 |
| **M4** | **Fechamento.** v5.6.1; CHANGELOG; CHANGELOG_DIRETORIA (negócio: "a página de Metas ganhou um comparativo entre meses e anos por setor"); out-briefing; PR draft. | — |

## Gates

Escalonados: `tsc --noEmit` + lint ao fim de cada missão; `build` + `test` na fronteira de fase
(após M3) e no fechamento. **revisor** sempre; **revisor-db** não se aplica (sem migration);
**verificador-visual** após os gates (UI nova). Smoke da página de Metas no fechamento.

## Checkpoint do Yan

Abrir `/metas`, expandir o Comparativo: trocar setor (cores das pills e dos gráficos acompanham),
alternar Este mês/Último mês (YoY automático), montar uma seleção personalizada com meses
não-contíguos, e conferir 2-3 números contra os MetaCards da Visão geral e contra a planilha de
referência (jul/26: previsto 1.125.660 × realizado 1.940.632, se a base bater).

## Fronteira

**Fora:** edição/cadastro de metas; subsetor de Weddings; qualquer mudança na Visão geral, no
Modo TV ou no Modo de Comparação; metas por conteúdo do anel além do valor da meta (sem % de
progresso do mês seguinte — é só o destaque do alvo).
