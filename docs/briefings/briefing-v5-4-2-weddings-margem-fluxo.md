# Briefing v5.4.2 — Weddings: Margem anualizada + Fluxo de Caixa unificado

**Tipo:** PATCH *(a pedido do Yan, para não inflar a numeração — a próxima frente pega o minor)* · **Migration:** uma **aditiva** (alargar a janela da RPC dos gráficos) · **ADR:** novo (definição da Margem a.a. + janela/slider) · **Base:** `main` @ **v5.4.1** · **Branch:** `feat/v5-4-2-weddings-margem-fluxo` · **Rota A**

> **Sessão B de duas em paralelo.** A outra é a v5.4.1 (DRE), que **mergeia primeiro**. Fronteiras em *Coordenação*, no fim.
>
> ## ⛔ GATE — só na parte dos gráficos
> A **M0** entrega um **mockup interativo com dados reais** do card dos gráficos e **PARA** para o OK do Yan. A **M1 (Lista) não depende do gate** e segue em paralelo.

## Objetivo

Duas melhorias na Performance/Weddings. **(1) Lista de Operações:** a margem absoluta distorce a análise — 17,5% em 30,4 meses não valem o mesmo que 17,5% em 12. Entra a coluna **Margem a.a.**, aberta espaço por duas colunas levemente reduzidas. **(2) Fluxo de Caixa:** os dois gráficos separados viram um card único com janela ajustável, dentro de uma TopSection nova, com os totais em card próprio.

## Decisões do Yan (firmes — embutir, não rediscutir)

- **Margem a.a. = LINEAR:** `margem × 12 / duração_meses`. **Nunca composta** (`(1+m)^(12/n)−1`). É "margem por ano de operação ocupada" — explicável em uma frase. Documentar no ADR como definição de métrica.
- **Colunas da lista:** "Operação / Casal" → **"Operação"** (largura levemente reduzida); "Resultado Previsto" → **"Resultado Prev."** (idem); coluna nova **"Margem a.a."** logo após "Margem", ordenável, com o mesmo tratamento de cor por sinal.
- **Duração curta = sinal, não cap:** operações de duração muito curta (sugestão: < 6 meses) recebem sinal visual discreto; o valor é exibido **cru**, porque anualizar ciclo curto é frágil (3,9 meses a 32,5% ⇒ 100% a.a.).
- **Explicitar "Duração":** a anualização divide por ela, então a semântica passa a valer dinheiro. Confirmar a definição vigente da coluna e registrá-la no **tooltip** da Margem a.a. e no **ADR**.
- **TopSection nova "Fluxo de Caixa"**, nesta ordem: **filtro por operação no topo da TopSection** (valendo para os dois cards) → **card de totais** → **card único dos gráficos**.
- **Totais = compromisso total:** "Total a receber" / "Total a pagar" em card próprio acima dos gráficos, do escopo da operação filtrada, **não da janela do slider** (um compromisso assumido não é um recorte). Rotular.
- **Slider de janela ancorado no "hoje", entre os dois gráficos:** esquerda = quantos meses para trás, direita = quantos para frente, passo de 1 mês. Ele funciona como o eixo de tempo compartilhado — **os dois gráficos obedecem à mesma janela**.
- **Acumulado reinicia na borda esquerda da janela:** vale para **todos** os elementos (entradas acumuladas, saídas acumuladas, linha de resultado). Nenhum pode continuar acumulando desde o início da série enquanto os outros reiniciam.
- **Referência "Total previsto de saídas" continua, recalculada na janela:** com o acumulado reiniciando, uma referência absoluta sairia de escala e achataria o gráfico. Passa a ser o total previsto **dentro da janela**, com rótulo explícito ("…na janela").
- **O slider não refetcha:** a RPC devolve uma **janela larga fixa** uma vez (sugestão: 48 meses atrás + 36 à frente) e o cliente fatia. Arrastar é instantâneo.

## Invariantes (inegociáveis)

1. **Gate honrado:** nada definitivo nos gráficos antes do OK do Yan sobre o mockup. A Lista segue livre.
2. **Margem a.a. é derivada** de `margem` e `duração` que a lista já devolve — nenhum número existente muda. Se der para computar no cliente, computar no cliente.
3. **Coerência do reinício:** acumulado reiniciando **e** referência recalculada andam **juntos**. Não entregar um sem o outro.
4. **Nulos e divisão por zero:** duração nula/zero ou margem ausente ⇒ travessão. Nunca `Infinity`/`NaN`.
5. **Sem regressão na lista:** busca, filtros (Todas/Realizados/Futuros/Personalizado), ordenação, paginação e **Exportar** seguem funcionando; o Exportar inclui a coluna nova.
6. **Migration aditiva** numerada na hora, backup-gate, **verificada executando via REST/service_role**; medir o crescimento do payload com a janela maior e confirmar que os consumidores atuais não quebram.
7. **Escopo trancado:** não tocar `financeiro/dre` (outra sessão); se precisar de helper de formatação, criar **local** e **não editar `fmt.ts`** até a v5.4.1 mergear.

## Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M1** | **Lista de Operações** *(independe do gate)*. Renomear/reduzir as duas colunas; inserir "Margem a.a." (linear) após "Margem"; ordenável; cor por sinal; travessão nos nulos; sinal para duração curta; tooltip com a fórmula **e** a definição de "Duração"; incluir no Exportar. | os 144 registros seguem paginando/ordenando; margem a.a. confere na mão em 3 linhas |
| **M0** | **GATE — mockup interativo dos gráficos.** Rota de preview com **dados reais**: card de totais, card único com os dois gráficos, slider entre eles, acumulado reiniciando na borda, referência "…na janela". **Parar, apresentar ao Yan, iterar até o OK.** Só então M2/M3. | gate honrado: nada definitivo antes do OK |
| **M2** | **TopSection + totais + filtro.** Criar a TopSection "Fluxo de Caixa" (padrão da casa, com a cortina); mover o filtro por operação para o topo dela; card de totais rotulado. Remover os totais do cabeçalho do gráfico mensal. | filtro afeta os dois cards; totais não variam com o slider |
| **M3** | **Card único + slider.** Unir os dois gráficos; slider entre eles (passo 1 mês, ancorado no "hoje"), com rótulo da janela; ambos obedecem; acumulado reinicia na borda (todos os elementos) e a referência é recalculada. Migration aditiva alargando a janela; cliente fatia (sem refetch ao arrastar). | arrastar é instantâneo; nenhum elemento acumula desde fora da janela |
| **M4** | **Fechamento.** v5.4.2; CHANGELOG; CHANGELOG_DIRETORIA ("a lista de operações passou a mostrar a margem anualizada e o fluxo de caixa dos casamentos ganhou janela ajustável"); **ADR** (Margem a.a. linear como definição de métrica + janela larga fatiada no cliente + reinício do acumulado); DS doc (slider de janela, se couber); out-briefing com a conferência da margem a.a. e prints. | — |

## Gates

Escalonados: `tsc --noEmit` + lint **ao fim de cada missão**; `build` + `test` nas **fronteiras de fase** (após M1; após o OK do gate; após M3) e no **fechamento**. Testes de tabela da Margem a.a. com fronteiras: duração 0/nula, margem negativa, duração curta. Migration com backup-gate + verificação via REST. Conferência visual ao vivo.

## Checkpoint do Yan

**(gate)** aprovar o mockup interativo. **(final)** conferir a margem a.a. na mão em 3 operações de durações bem diferentes; olhar a lista ordenada pelas duas colunas de margem e ver se a leitura faz sentido; arrastar o slider nos extremos (os dois gráficos mudam junto, o acumulado zera na borda, a referência acompanha); confirmar que o slider **não** altera os totais e que o filtro de operação altera os dois cards; conferir o Exportar com a coluna nova.

## Fronteira

**Fora:** qualquer mudança nas definições de faturamento / resultado previsto; o pipeline de Weddings; a terceira frente (adiada pelo Yan, entra como minor).

## Coordenação (duas sessões em paralelo)

- **Mergeia depois** da v5.4.1 (DRE).
- **Não tocar `financeiro/dre`** nem **`fmt.ts`** (território da outra sessão) — helper de formatação necessário nasce local e se consolida depois.
- Conflito garantido só nos arquivos-meta: **esta fecha por último, então rebase** antes do bump.

## Skills a ler (antes de implementar)

- `.claude/skills/tabela-densa/SKILL.md`
- `.claude/skills/graficos/SKILL.md`
- `.claude/skills/ui-design-system/SKILL.md`
- `.claude/skills/banco-e-rpc/SKILL.md`
- `.claude/skills/contrato-rpc-front/SKILL.md`

## Commits sugeridos

1. `feat(weddings): coluna margem anualizada (linear) + ajuste de colunas`
2. `feat(weddings): mockup interativo do card de fluxo de caixa — GATE`
3. `feat(weddings): topsection fluxo de caixa + card de totais + filtro no topo`
4. `feat(weddings): card unico com slider de janela (acumulado reinicia na janela)`
5. `chore(release): v5.4.2`
