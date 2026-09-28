# Scripts R do tratamento manual — referência histórica (v6.0.0)

Cópia dos scripts que, até a v6.0.0, transformavam os exports crus do Monde nas planilhas
"tratadas" que os cards de `/admin/uploads` recebiam. A v6.0.0 porta cada um para um parser TS
no servidor, provado por oráculo célula a célula (GATE 1 do briefing). **Só se aposentam quando o
oráculo TS da base está verde** — o out-briefing da versão nomeia o teste que substitui cada um.

| Script | Base | Substituto (TS) |
|---|---|---|
| `tratamento_demonstrativo_v1.R` | Demonstrativo de Resultado (competência) | `src/lib/ingestao/parsers/demonstrativo-competencia.ts` |
| `ajuste_vendas_teste.R` | Vendas por Produto (3 arquivos, por ano) | `src/lib/ingestao/parsers/vendas-produto.ts` |
| `tratamento_lancamentos_v2.R` | Lançamentos por Movimentação **e** por Vencimento em Aberto | `src/lib/ingestao/parsers/lancamentos-categoria.ts` |
| `extracao_casamentos.R` | scrape da página de operações do Monde (RSelenium) → `Análise de Operações.csv` | **fora da v6.0.0** — a extração automática é v6.1+ |
| `analise_casamentos2.R` | `Análise de Operações.csv` + Lista de Operações + 8 XLSX de contas → `Lançamentos por Operação.csv` | `src/lib/ingestao/parsers/lancamentos-operacao.ts` (com `Vencimento` vindo das bases Aberto/Movimentação, decisão 10) |

Os caminhos dentro dos scripts são os da máquina de origem (`C:/Users/…`) e ficam como estão:
isto é registro, não código vivo. Copiados em 2026-09-21 de `Office 365/Welcome - Documentos/12.
Dados Monde/` e `Desktop/Yan (Financeiro)/Análise Casamentos/`.
