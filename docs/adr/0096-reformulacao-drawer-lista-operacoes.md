# ADR-0096 — Reformulação do drawer da Lista de Operações

**Status:** Aceito
**Data:** 2026-06-01
**Contexto:** O drawer que abre ao clicar numa operação na Lista de Operações de Weddings (`drilldown-drawer.tsx`) estava desalinhado do design system e exibia uma "Equação Financeira" (waterfall até Receita Líquida) baseada em **Custos Internos**, cujo cálculo não é confiável. Também usava barras douradas grossas fora do padrão de gráficos novo (ADR-0095) e um "Detalhamento dos Lançamentos" de baixa aderência.

## Decisão

Redesenhar o drawer alinhando-o ao design system e ao padrão de gráficos (ADR-0095), e **removendo a Equação Financeira** (Custos Internos não confiáveis → Custos Internos e Receita Líquida saem; a decomposição para na Receita Bruta, que é confiável e é o sentido de "Receita" no resto da plataforma).

### Nova estrutura (de cima para baixo)

1. **Cabeçalho empilhado, sem badge:** `W - <nome> - <DDMMMAA>` / nome do casal / data por extenso / hotel (sem rótulo).
2. **Informações Gerais** (faixa 3×2): Duração | Tipo de Contrato | Convidados; Faturamento | Receita Bruta | Margem Bruta (dourado). Tipo de Contrato = coluna "Contrato" (sem novo cálculo); Margem Bruta = Receita Bruta / Faturamento; Convidados reaproveitado da Lista.
3. **Fluxo de Caixa:** Entradas (Recebido / A receber) | Saídas (Pago / A pagar); Resultado Caixa | NCG. **NCG = A pagar − A receber** — positiva = necessidade (vermelho), negativa = sobra (verde), sem rótulo de texto.
4. **Composição por Subsetor:** tabela completa reusando o componente do drawer principal (`SumarioSubsetorCard`), com Total e linha Não Classif. sempre presente.
5. **Caixa Acumulado por Mês (Efetivo + Projetado):** trecho efetivo sólido (por liquidação), projetado tracejado (inclui agendado futuro), marcador vertical "hoje", eixo temporal contínuo (ADR-0095).

**Removidos:** Equação Financeira, Receita por Subsetor (barras antigas), Detalhamento dos Lançamentos (reavaliar no futuro se a gestora sentir falta da visão lançamento a lançamento).

### Dados (migration 0103)

`get_operacao_weddings` estendida para devolver `tipo_contrato`, `convidados`, `data_venda_contrato`, `decomposicao_subsetor` no formato `SumarioSubsetor` (faturamento/receita/margem/pct) e `acumulado_mensal` como curva contínua com `saldo_efetivo` (só liquidados) e `saldo_projetado` (inclui futuro). Escopo por operação, cabe em <3s (anon).

## Justificativa

Custos Internos não confiáveis tornavam a Receita Líquida do drawer enganosa — melhor parar na Receita Bruta (confiável) do que exibir um número errado. O resto alinha o drawer ao padrão visual e reaproveita componentes/curvas já existentes. O cálculo de Custos Internos fica como pendência de integridade de dado para revisão futura.
