# Briefing v5.6.4 — Metas: período contíguo no Personalizado + carrossel no Modo TV

**Tipo:** PATCH · **Migration:** nenhuma prevista (metas são mensais; trimestre/ano = soma
pró-rata das mensais, motor já existe) · **ADR:** nenhum previsto · **Base:** `main` @ v5.6.3
(`3e747ca`) · **Branch:** `feat/v5-6-4-metas-periodo-e-carrossel` · **Rota A**

> Pedido do Yan em 2026-08-14, no chat, com um print do popover "Selecione o mês" do
> Comparativo como referência. Duas frentes na página de Metas.

## Objetivo

1. **Seletor Personalizado do Comparativo** (`/metas`, seção Comparativo): permitir a seleção
   de **períodos contíguos de meses** (ex.: jan até abr) — clica no primeiro mês para marcar o
   **início** do período e no segundo mês para o **final**.
2. **Modo de exibição (Modo TV, `/metas/tv`)**: hoje só exibe as metas do **mês**; adicionar
   **rotação para a meta do trimestre e do ano**, com **animação tipo carrossel**, e ajustar a
   legenda para **"A seta indica o valor esperado para hoje, considerando o período já
   decorrido."**

## Decisões do Yan (firmes — embutir, não rediscutir)

- Range **contíguo** de meses no Personalizado, mecânica de dois cliques (início → fim).
- Rotação do TV entre **mês → trimestre → ano** (semestre fica fora — o pedido cita
  trimestre e ano), com animação de carrossel.
- Texto exato da legenda: *"A seta indica o valor esperado para hoje, considerando o período
  já decorrido."* (generaliza o atual, que terminava em "no mês").

## Decisões derivadas (default do orquestrador — registrar no out-briefing)

- **Ordem dos cliques indiferente** (clicar abr e depois jan produz jan–abr); **terceiro
  clique reinicia** a seleção com o mês clicado como novo início. Range de 1 mês (dois
  cliques no mesmo mês, ou Aplicar após um clique) ≡ comportamento atual.
- **Range atravessa a virada de ano** (ex.: nov/25–fev/26) — a grade é uma linha do tempo.
  **Teto de 12 meses** (mesmo teto derivado do briefing da v5.6.1); acima disso o Aplicar
  desabilita com dica.
- **A unidade do Comparativo generaliza de mês para PERÍODO** (preset = período de 1 mês):
  colunas Previsto × Realizado agregados do período; **YoY automático preservado** — o mesmo
  range nos `ANOS_YOY` anos anteriores; **anel ≡ Previsto do período** (invariante v5.6.1).
  Rótulos: "ago/26" (1 mês), "jan–abr/26" (mesmo ano), "nov/25–fev/26" (cruza ano).
- **Dados por período, não por mês**: `get_executiva_kpis(p_from, p_to)` aceita janela
  arbitrária — 1 chamada por período/ano YoY (não N por mês). Weddings mantém
  `get_contratos_casamento_mes` com a janela do período.
- **TV**: os 3 recortes carregados no RSC em paralelo (`carregarAcompanhamento` ×3:
  mensal/trimestral/anual); carrossel client-side com **todos os slides montados** (`inert`
  nos inativos — padrão da cortina), avanço automático (~12s por slide), curva canônica
  450ms `cubic-bezier(.32,.72,0,1)`, `motion-reduce:transition-none`, rótulo do período
  visível a distância + indicador de posição (dots).
- O popover muda o título de "Selecione o mês" para "Selecione o período" (copy acompanha a
  mecânica nova).

## Invariantes (inegociáveis)

1. **Sem migration.** Metas seguem mensais; trimestre/ano derivados por soma/pró-rata
   (`metaAcumulada`/`calcularRitmo`, que já são agnósticos de granularidade).
2. **Paridade preservada:** para período de 1 mês, os números do Comparativo permanecem
   idênticos aos de hoje (mesma RPC, mesma janela `janelaDoMes`). No TV, os valores de cada
   slide batem com a página `/metas` no preset correspondente (mesma fonte,
   `carregarAcompanhamento`).
3. **Reuso antes de construção:** `MetaProgressBar`, `carregarAcompanhamento`,
   `resolverPeriodoMetas`, primitivos de `@/components/charts`; skills `ui-design-system`,
   `react-padroes`, `graficos`, `contrato-rpc-front` lidas antes de editar.
4. **Nada de hex/cor crua** — tokens; carrossel não introduz cor nova.
5. **Escopo trancado:** não tocar o cadastro de metas, o Modo de Comparação (Upload×Monde),
   as pills de período da Visão geral nem o eixo de subsetor de Weddings.

## Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M1** | **Range contíguo no Personalizado.** `SeletorMeses` com estado início/fim (2 cliques, swap, reinício no 3º), realce do intervalo na grade, teto 12; `comparativo.ts`/`use-comparativo.ts` generalizam mês→período (resolver, YoY, janela, rótulo); visuais consomem o período agregado. | preset de 1 mês ⇒ números idênticos aos atuais; jan–abr soma exatamente os 4 meses; YoY desloca o range ano a ano; teto 12 respeitado |
| **M2** | **Carrossel no Modo TV.** `tv/page.tsx` carrega mensal+trimestral+anual em paralelo; `TvTela` ganha carrossel (3 slides montados, `inert`, avanço ~12s, curva canônica, dots, rótulo do período); legenda trocada pelo texto exato do Yan. | slides batem com `/metas` nos 3 presets; rotação não desmonta conteúdo (sem piscar); `motion-reduce` respeitado; legenda idêntica ao pedido |
| **M3** | **Fechamento.** v5.6.4; CHANGELOG; CHANGELOG_DIRETORIA (negócio: "o telão de metas agora alterna mês/trimestre/ano e o comparativo aceita períodos de vários meses"); out-briefing; WORKING-CONTEXT; PR. | — |

## Gates

Escalonados: `tsc --noEmit` + lint ao fim de cada missão; `build` + `test` no fechamento.
**revisor** sempre; **revisor-db** não se aplica (sem migration); **verificador-visual** após
os gates (UI). Smoke da página de Metas e do Modo TV no fechamento.

## Checkpoint do Yan

Em `/metas` → Comparativo → Personalizado: selecionar jan até abr (dois cliques), conferir
que colunas/anel somam os 4 meses e que o YoY mostra jan–abr/25 e jan–abr/24; selecionar um
único mês e conferir que nada mudou vs. hoje. Em `/metas/tv`: observar a rotação
mês → trimestre → ano, conferir os números contra a página nos presets Mensal/Trimestral/Anual
e a legenda nova.

## Fronteira

**Fora:** meta "nativa" de trimestre/ano no banco; semestre no carrossel; seta/ritmo dentro
do Comparativo; qualquer mudança no cadastro de metas, no Modo de Comparação ou nas pills de
período da Visão geral; controles manuais de navegação do carrossel além do essencial.
