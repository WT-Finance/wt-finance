# ADR-0099 — Parser de data lê o valor nativo do Excel (não a string formatada)

**Status:** Aceito
**Data:** 2026-06-03
**Contexto:** A importação Gerencial gravava datas de Vencimento **invertidas** (dia↔mês). A planilha de origem tinha vencimentos concentrados em 28/05 a 12/06/2026, mas a Visualização Agregada não refletia junho. Causa raiz confirmada no código (`src/lib/gerencial/parser.ts`): `XLSX.utils.sheet_to_json(sheet, { raw: false })` entrega a data como **TEXTO no formato de exibição da célula** (a planilha vem em `mm-dd-yy`, formato americano). `parseVencimento` recebia uma string como `'06-05-26'` e, no caso ambíguo (ambas as partes ≤ 12), assumia `DD-MM` — **invertendo** 5 de junho em 6 de maio. O `cellDates: true` era inócuo porque `raw: false` reformatava para string antes do parser. Dias > 12 (28, 29) acionavam o ramo MM/DD e por acaso acertavam — foi a "sorte" que mascarou o bug, corrompendo só junho 1–12 e espalhando de jan a dez.

## Decisão

A importação (Gerencial e correlatas) deve ler o **valor `Date` NATIVO** da célula, não a string reformatada pelo formato de exibição:

- Ler a planilha também com `XLSX.utils.sheet_to_json(sheet, { raw: true, defval: null })` (com `cellDates: true`), e tomar o Vencimento do objeto `Date` nativo (`rowsRaw[idx]?.[colVenc]`), com fallback para a string quando a célula vier realmente como texto.
- O `Date` nativo é **inequívoco** (3 de junho é 3 de junho), eliminando a heurística DD/MM vs MM/DD na raiz.
- **Não inverter** a heurística DD/MM→MM/DD: isso só trocaria qual formato quebra (quebraria planilhas BR). A heurística de string permanece apenas como **fallback** para células que cheguem genuinamente como texto.
- Dados já corrompidos: a importação Gerencial **substitui** (não acumula); após corrigir o parser, o re-import limpa os registros invertidos. Re-importar com o parser velho **recorromperia** — a ordem é corrigir primeiro, validar uma data de teste, e só então re-importar.

## Justificativa

Adivinhar o formato de uma string de data é frágil por construção: qualquer ambiguidade (dia ≤ 12) é um chute. Ler o tipo nativo que o Excel já guarda elimina a ambiguidade na origem em vez de tentar desfazê-la depois. **Convenção** para qualquer importação que leia datas de Excel neste projeto: prefira o `Date` nativo (`raw: true` + `cellDates: true`); trate string só como fallback explícito.
