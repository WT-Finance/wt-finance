---
name: graficos
description: Gráficos do Janus (Recharts) — criar OU alterar QUALQUER gráfico do dashboard: adicionar/mudar série, linha de projeção tracejada, legenda, tooltip, eixo (fmtAxisBRL/fmtAxisPct/fmtAxisMes) e cor de série pela paleta canônica por contexto semântico (série principal --brand, margem --brand-deep, cash-flow --positive/--negative, subsetor e cross-setor por token; sólido = real, tracejado = referência/projeção). Sempre pelos primitivos de @/components/charts — nunca Recharts cru. Use para qualquer trabalho em gráfico: visualização nova, série nova, projeção, legenda, eixo, tooltip ou cor de gráfico.
---

# Gráficos (Janus)

Todo gráfico da plataforma (Recharts) passa pelos mesmos primitivos e pela mesma paleta —
não reconfigurar Recharts à mão, não escolher hex "que combina" na hora. A causa-raiz
histórica de divergência visual é a mesma de sempre: cada tela montando o próprio gráfico
do zero.

## Primitivos de `@/components/charts` (ADR-0095)

Gráfico novo usa o tema central da pasta `@/components/charts`, não `recharts` cru:

- Tema central (cores base, grade, linha-do-zero).
- `ChartLegend` para a legenda.
- `CustomTooltip` para o tooltip.
- Formatadores de eixo prontos: `fmtAxisBRL`, `fmtAxisPct`, `fmtAxisMes`.

Convenção de traço: **sólido = real/efetivo**, **tracejado = referência/projeção**. Eixo
temporal é sempre **contínuo** (sem buraco/salto entre pontos, mesmo quando falta dado).

Gráfico legado que ainda não usa os primitivos não precisa ser migrado de uma vez —
migração é incremental, feita quando a tela é tocada por outro motivo.

## Paleta canônica por contexto semântico (ADR-0103)

A cor de uma série **nunca é hex literal** — é sempre o token certo para o contexto. A
regra central é: a cor comunica o que o dado É, não é decoração. O mapeamento:

- **Série principal única** → `--brand` (herda a cor da aba ativa via `[data-theme]` —
  por isso o mesmo componente de gráfico muda de cor sozinho ao trocar de setor).
- **Ênfase** (destacar um ponto/série dentro do mesmo gráfico) → `--brand-deep`.
- **Multi-série YoY** (ano atual vs. ano anterior) → a **cor** distingue a métrica
  (`--brand`/`--text-secondary`), o **traço** (sólido/tracejado) distingue o período —
  nunca as duas dimensões na mesma variável.
- **Margem** → `--brand-deep`.
- **Cash-flow** (entrada/saída/resultado) → `--positive`/`--negative`, via `fluxoColors`,
  no drawer de operação e no Financeiro.
  - **Exceção deliberada:** os cards de cash-flow da **visão principal de Weddings**
    (Fluxo de Caixa Mensal, Acumulado de Recebimentos e Pagamentos) usam a identidade
    Welcome turquesa/mostarda (`--chart-fluxo-entrada`/`--chart-fluxo-saida`), por decisão
    de identidade visual — não é um esquecimento de padrão, é intencional e localizado.
- **Composição por subsetor** → `--subsetor-*` (fallback `--brand` quando o subsetor não
  tem token próprio), resolvido por `subsetorColor` de `@/lib/config`.
- **Breakdown cross-setor** (comparando setores entre si) → `--setor-*`/`SETOR_COLORS`.

### Duas cores por setor — não confundir

Um setor (Trips/Weddings/Corporativo) tem **duas** cores diferentes, para dois papéis
diferentes:

- **DESTAQUE** — `--brand` (a cor da aba, ativa **dentro** da aba daquele setor).
- **IDENTIDADE** — `--setor-*` (usada **só** em gráficos cross-setor, quando setores
  aparecem lado a lado).

Usar `--brand` num gráfico cross-setor (ou `--setor-*` dentro da aba de um setor) mistura
os dois papéis e produz cor errada silenciosamente — nenhum lint pega isso, é leitura de
contexto.

**Atenção especial:** o `--brand` de Trips resolve para `#0091B3`. Não hardcode esse hex
como cor de série principal em telas de Trips que também tenham cash-flow — colidiria
visualmente com as cores de fluxo de caixa.

(Telas de **plataforma**, não-setoriais — auth, `/admin/*`, `/sem-acesso` — usam uma
paleta neutra própria, independente de `[data-theme]`; isso é assunto de
`ui-design-system`, não deste gráfico.)

## Eixos e formatação de valores

- **Eixo Y monetário** → `ChartYAxisBRL`/`fmtAxisBRL`: rótulo compacto ("R$ 1,8 Mi", 1
  casa decimal). Formato longo (com todos os centavos) quebra linha em larguras de tela
  menores — sempre validar o gráfico numa largura estreita, não só no monitor do dev.
- **Casas decimais em agregado/eixo de gráfico** → sempre abreviado, via `fmtMi`/
  `fmtAxisBRL` ("R$ 1,8 Mi"). Nunca formatação local reinventada no componente do
  gráfico. (O caso de **valor de operação individual**, com 2 casas via `fmtBRL2`/
  `numBRL2`, não é responsabilidade deste gráfico — vive em `tabela-densa`/
  `ui-design-system`, porque ali o valor está numa célula, não num eixo.)

## Ver também

- `tabela-densa` — quando o dado é melhor representado em tabela (valor monetário denso,
  `<ValorContabil>`) em vez de gráfico.
- `ui-design-system` — tokens de cor gerais, paleta neutra de telas de plataforma
  (`--action-*`), primitivos de UI fora de gráfico.
