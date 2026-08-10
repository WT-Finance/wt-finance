# Briefing v5.5.0 — Weddings: Rendimento potencial do float

**Tipo:** MINOR *(métrica nova de produto; confirmar numeração no `/nova-versao` conforme a fila com a v5.4.3)* · **Migrations:** **aditivas** (tabela de taxas CDI + RPC + agendamento da ingestão) · **ADR:** novo (definição da métrica + ingestão — fechar ao FINAL da versão) · **Base:** `main` · **Branch:** `feat/v5-5-0-rendimento-float` · **Rota A**

> ## ⛔ GATE leve — só no gráfico
> A **M5** apresenta o gráfico **com dados reais** dentro do card de Fluxo de Caixa e **PARA** para o OK do Yan antes de finalizar. M1–M4 não dependem do gate. Os mockups de referência (coluna, bloco do drawer, gráfico de duas curvas) foram aprovados em Chat nesta sessão de planejamento.

## Objetivo

Weddings recebe antes de pagar — o float é valor financeiro real do modelo de negócio, hoje invisível. Entra o indicador **Rendimento potencial do float**: quanto o caixa antecipado de cada operação renderia a 100% do CDI, em regime composto, com a **taxa alimentada automaticamente pela API do BACEN** — a feature nasce completa e autossuficiente numa única minor, sem rotina manual residual. Três pontos de UI: coluna na Lista de Operações, bloco no drawer da operação, e gráfico de duas curvas (saldo real × conta virtual) dentro do card de Fluxo de Caixa, abaixo do Acumulado. **Sem KPI agregado nesta versão** — a visão de portfólio emerge do gráfico com filtro "Todas".

## Definição da métrica (firme — embutir, não rediscutir)

- **Modelo = conta virtual remunerada:** `saldo_virtual(t) = saldo_virtual(t−1) × (1 + i_t) + fluxo_t`, mês a mês. **Indicador = saldo_virtual_final − saldo_contábil_final.** Regime composto — nunca juros simples.
- **Simétrico por construção:** saldo virtual negativo "rende" negativamente (custo teórico de captar a CDI). Sai de graça da fórmula — sem ramo especial.
- **PROJETADO, coerente com Resultado Prev.:** inclui lançamentos efetivados (por data de liquidação) **e** previstos (por data prevista/vencimento), até o horizonte da operação. Mesma base que já alimenta Resultado Previsto e o gráfico Acumulado.
- **Granularidade mensal:** saldo do mês rende o mês cheio. Refinamento diário é débito consciente, não escopo.
- **Benchmark = 100% do CDI mensal**, série SGS do BACEN. Mês corrente e futuros: **última taxa fechada conhecida mantida constante** (premissa — validar no checkpoint). O CDI do mês só existe após o mês fechar, então a premissa cobre naturalmente o corrente; quando a taxa real entra via ingestão, o número previsto flutua — mesmo comportamento do Resultado Prev., coerência desejada.
- **Nome:** "Rendimento potencial do float"; coluna: **"Rend. Float"**. Sempre acompanhado da nota: *"rendimento teórico a 100% do CDI · não representa aplicação real"*.

## Ingestão CDI (BACEN)

- **Fonte:** API SGS do BACEN, série do **CDI acumulado no mês** (verificar o código da série na implementação; candidata: 4391), JSON público, sem autenticação.
- **Destino:** `analytics.dim_taxa_cdi` (mês, taxa, origem, atualizado_em). Upsert **idempotente** — rodar duas vezes não duplica nem corrompe.
- **Backfill = a própria ingestão:** a carga inicial ago/24→último mês fechado roda pela mesma função, uma vez, na entrega. **Sem seed manual em migration** — um caminho só para os dados (fonte única).
- **Agendamento mensal** (sugestão: dia 3, buscando o mês anterior fechado). Preferência: **pg_cron + chamada HTTP do próprio banco** (dado nasce e mora no banco, sem passar pelo front); se a extensão HTTP não estiver disponível/estável no Supabase, fallback: rota interna + Vercel Cron. Registrar a escolha no ADR.
- **Fail-safe (princípio da casa):** falha na API do BACEN **não derruba nada** — o indicador segue com a última taxa conhecida (que a premissa já usa para o corrente/futuro) e a falha fica registrada (log + `atualizado_em` estagnado). Staleness > 2 meses ⇒ sinalizar discretamente no tooltip da coluna ("taxa de referência de MMM/AA").

## Invariantes (inegociáveis)

1. **Teórico nunca se mistura com contábil:** nenhuma coluna/célula soma float a resultado, margem ou faturamento. Lado a lado, nunca fundidos.
2. **A nota teórica aparece nos três pontos:** tooltip do header da coluna, rodapé do bloco do drawer, legenda/subtítulo do gráfico.
3. **Cor:** positivo em **dourado Weddings** (token do setor, variante legível — não verde: verde/vermelho já significam resultado real); negativo em **danger**. Registrar o padrão "dourado = valor teórico/financeiro" no DS doc.
4. **Formatação:** coluna e drawer são contexto de operação individual ⇒ **2 casas decimais** via `fmt.ts` (convenção vigente). Eixos do gráfico abreviados.
5. **Nulos/sem lançamentos ⇒ travessão.** Nunca `NaN`/`Infinity`.
6. **Sem regressão na Lista:** busca, filtros, ordenação, paginação e Exportar seguem funcionando; Exportar **inclui** a coluna nova.
7. **O gráfico obedece à janela e ao filtro do card** (v5.4.2): mesma janela do slider; com o acumulado reiniciando na borda esquerda, **as duas curvas seedam no saldo real da borda** — o gap exibido é o rendimento gerado *dentro da janela*. Filtro "Todas" agrega o portfólio.
8. **Migrations aditivas** numeradas na hora, backup-gate, verificadas via REST/service_role.
9. **Ingestão idempotente e fail-safe:** re-execução não duplica; falha da API não quebra RPC, UI nem o job seguinte. A RPC falha explicitamente apenas se **nenhuma** taxa existir na tabela (estado impossível pós-backfill).
10. **Escopo trancado:** nenhuma alteração em faturamento, resultado previsto, margem ou nas RPCs existentes além do estritamente aditivo.

## Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M1** | **Banco.** Tabela `analytics.dim_taxa_cdi` (mês, taxa, origem, atualizado_em); RPC do float: conta virtual composta e simétrica sobre `fato_lancamento_operacao` (efetivados + previstos), devolvendo **total por operação** (consumo da Lista/drawer) e **série mensal** saldo real × saldo virtual (consumo do gráfico), com parâmetro de operação opcional (nulo = portfólio). Mês corrente/futuros com última taxa fechada conhecida. | recomputar na mão a conta virtual de 1 operação em planilha e bater com a RPC; caso sem lançamentos devolve nulo, não zero |
| **M2** | **Ingestão BACEN.** Função de ingestão (fetch SGS → upsert idempotente em `dim_taxa_cdi`); **backfill ago/24→último mês fechado executado pela própria função**; agendamento mensal (pg_cron preferencial, fallback Vercel Cron); fail-safe + log; sinal de staleness no contrato da RPC (mês da taxa vigente). Validar o código da série SGS contra o CDI publicado antes de fixar. | rodar a ingestão 2× seguidas: mesma contagem de linhas; taxa de 3 meses conferida contra o site do BACEN; simular falha de rede: nada quebra |
| **M3** | **Coluna na Lista de Operações.** "Rend. Float" entre "Resultado Prev." e "Margem"; ordenável; dourado/danger por sinal; travessão nos nulos; 2 casas; tooltip no header com a definição em uma frase + nota teórica (+ staleness quando houver); incluir no Exportar. | 144 registros paginando/ordenando; ordenar pela coluna e conferir os extremos manualmente |
| **M4** | **Bloco no drawer** (seção Fluxo de Caixa): saldo médio do float, meses com saldo positivo (N de M), rendimento teórico (+), custo teórico (−), linha de total "Rendimento potencial do float"; rodapé com a nota teórica. Mockup aprovado em Chat como referência. | os números do bloco conferem com a coluna da Lista para a mesma operação |
| **M5** | **GATE leve — gráfico no card de Fluxo de Caixa**, abaixo do Acumulado, dentro do mesmo card: linha saldo real (neutra, sólida) × linha conta virtual (dourada, tracejada), preenchimento dourado translúcido entre elas; obedece slider e filtro (invariante 7); distinção passado/futuro no padrão vigente do card; tooltip com os dois saldos + rendimento acumulado no mês. **Apresentar com dados reais e aguardar OK do Yan.** | gap nunca encolhe em janela sem taxa negativa; curvas seedadas na borda; arrastar o slider não refetcha |
| **M6** | **Fechamento.** v5.5.0; CHANGELOG; CHANGELOG_DIRETORIA ("Weddings passou a medir quanto o caixa recebido antecipadamente renderia aplicado — o valor financeiro do nosso modelo de recebimento, com a taxa CDI atualizada automaticamente do Banco Central"); **ADR** da métrica + ingestão (conta virtual composta, simétrica, projetada, mensal, 100% CDI, premissa da taxa futura, série SGS escolhida, mecanismo de agendamento) fechado ao final; DS doc (padrão dourado-teórico); out-briefing com a conferência manual da M1, a validação da série da M2 e prints dos três pontos. | — |

## Gates

Escalonados: `tsc --noEmit` + lint ao fim de cada missão; `build` + `test` nas fronteiras (após M2; após M4; após o OK do gate) e no fechamento. Testes de tabela da RPC: operação sem lançamentos, operação só com previstos, saldo que cruza zero (simetria), mês sem taxa dentro da série (falha explícita, não silenciosa). Ingestão: idempotência e falha simulada. Migrations com backup-gate + verificação via REST. verificador-visual nos três pontos de UI.

## Checkpoint do Yan

**(gate M5)** aprovar o gráfico com dados reais. **(premissa)** validar a taxa futura = última CDI fechada constante. **(final)** conferir o float de 2–3 operações contra a planilha da auto-auditoria; conferir 3 taxas da `dim_taxa_cdi` contra o site do BACEN; ordenar a Lista por "Rend. Float" e ler os extremos (faz sentido operacionalmente?); abrir o drawer de uma operação bem e outra mal sequenciada; arrastar o slider e confirmar que o gap zera na borda esquerda; conferir o Exportar; ler a nota teórica nos três pontos.

## Fronteira

**Fora:** KPI agregado no topo da aba (avaliar após a v1 rodar); confronto com rendimento efetivo registrado (grupo Receitas e Rendimentos Financeiros — depende do agregado); granularidade diária (a série diária SGS existe, mas a métrica é mensal por decisão); qualquer projeção-simulador ("e se postergarmos pagamentos"); "margem ampliada" em qualquer forma; UI de administração de taxas (a tabela é gerida pela ingestão; intervenção excepcional é ato humano via SQL).

## Skills a ler (antes de implementar)

- `.claude/skills/banco-e-rpc/SKILL.md`
- `.claude/skills/contrato-rpc-front/SKILL.md`
- `.claude/skills/ingestao-planilhas/SKILL.md` *(padrões de ingestão/idempotência da casa — adaptar, a fonte aqui é API)*
- `.claude/skills/tabela-densa/SKILL.md`
- `.claude/skills/graficos/SKILL.md`
- `.claude/skills/ui-design-system/SKILL.md`

## Commits sugeridos

1. `feat(weddings): dim_taxa_cdi + rpc do rendimento potencial do float (conta virtual composta)`
2. `feat(weddings): ingestao automatica do cdi via api sgs/bacen (backfill + agendamento)`
3. `feat(weddings): coluna rend. float na lista de operacoes`
4. `feat(weddings): bloco de float no drawer da operacao`
5. `feat(weddings): grafico saldo real x conta virtual no card de fluxo de caixa — GATE`
6. `chore(release): v5.5.0`
