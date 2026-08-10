# Investigação — Endomarketing 2025 e a varredura das bases de lançamentos

**Data:** 2026-08-10 · **Origem:** suspeita do Yan de que o Endomarketing de 2025 estava alto
demais, com receio de que outros valores da DRE e do Fluxo de Caixa também estivessem errados.
**Escopo pedido:** varredura completa das três bases — lançamentos **por categoria**, **por
movimentação** e **por vencimento (em aberto)** — procurando erros de cálculo.
**Método:** leitura do motor (migrations 0185/0187/0207/0188/0229) + consultas READ ONLY na
produção + reexecução do parser real sobre o arquivo-fonte + `get_dre_mensal` via REST/service_role.

> **Veredito curto:** a suspeita procede e é maior do que a linha que a originou. O motor da DRE
> está **correto**; o defeito está na **ingestão**. Um bug de coerção numérica multiplica por
> **1000** todo valor com exatamente 3 casas decimais. Ele **inverte o sinal do resultado de
> 2024 e de 2025**.

---

## 1. O que o Yan viu

`Endomarketing` em 2025, na DRE (confirmado chamando `get_dre_mensal(2025)` em produção):

| | Na tela | Correto | Erro |
|---|---:|---:|---:|
| **jul/2025** | −758.486,68 | **−4.781,14** | 753.705,54 |
| **Ano 2025** | −924.729,39 | **−171.023,85** | 753.705,54 |

O ano inteiro está **5,4× maior** que o real, e quase todo o erro mora num único mês.

## 2. Causa-raiz — provada

O título `176530-2` (MG Produções, "Endomarketing 2/2") aparece com **−188.615,00**.
A parcela `176530-1` do mesmo título vale **−377,23**. E `377,23 ÷ 2 = 188,615`.

O valor verdadeiro da parcela é **R$ 188,615** — três casas decimais. Virou **R$ 188.615,00**.

### O mecanismo, camada a camada

1. A célula do Excel é um **número nativo**, em notação de ponto decimal. Verificado no
   arquivo-fonte (`supabase/seed/data/Lancamentos_por_Movimentacao_tratada.xlsx`, linha 8252):

   ```
   numero: '184467-1'   valor_nativo_celula: -40.933   tipo: 'number'
   ```

   Ou seja: quarenta reais e noventa e três centavos.

2. **Os parsers leem com `raw: false`** (`src/lib/carga/parse-lancamentos-movimentacao.ts:170-177`
   e `parse-titulos-em-aberto.ts:167-174`). Isso **descarta o número nativo** e entrega ao
   coercionador o *texto formatado*: `"-40.933"`.

3. `toNum` (`src/lib/carga/coercao.ts`) tenta desambiguar a string e cai no ramo de **milhar BR**:

   ```js
   else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')   // "-40.933" → "-40933"
   ```

   `-40.933` casa o padrão (1–3 dígitos, ponto, exatamente 3 dígitos) e o ponto é removido.
   Resultado: **−40933**, ou seja **×1000**.

Comportamento reproduzido diretamente sobre o módulo canônico:

| Entrada | `toNum` devolve | Correto |
|---|---:|---:|
| `-40.933` | **−40933** | −40,93 |
| `188.615` | **188615** | 188,62 |
| `0.016` | **16** | 0,02 |
| `-30.4322` | −30,4322 ✔ | −30,43 |
| `1234.567` | 1234,567 ✔ | 1234,57 |

O gatilho é **exatamente 3 casas decimais** com 1–3 dígitos na parte inteira. Com 4 casas
(`-30.4322`) ou 4+ dígitos inteiros (`1234.567`) o padrão não casa e o valor passa correto — é
por isso que o defeito é **esparso e plausível**, não um erro visível em massa.

### Por que 3 casas decimais aparecem numa base financeira

Sempre que o Monde divide um título e a divisão não fecha em centavos inteiros — parcelamento,
rateio, conversão de moeda. `377,23 ÷ 2 = 188,615`. Foi assim em todos os casos encontrados.

## 3. Três provas independentes

**(a) A base se contradiz sozinha.** O título `150001` (TBO Holidays, "Fatura Fornecedor",
cobrança mensal recorrente na conta CCAB - VS) vale **−26.394,00** de ago/2024 a abr/2025 e
**−26,39 em mai/2025**. A mesma linha recorrente, 1000× diferente. Não é preciso oráculo externo.

**(b) Bate ao centavo com o dashboard da controladoria.** Reprocessando o arquivo-fonte de julho
com o parser real, o erro introduzido é **exatamente −40.892,07**. Esse é, ao centavo, o mesmo
delta que a auditoria de paridade da v5.3.0 registrou e **atribuiu a "Endomarketing re-lançado"
no Monde** (out-briefing v5.3.0, REX jan/2026). **Não era re-lançamento: era este bug.**

**(c) A correção reconstrói o oráculo.** jul/2025 Endomarketing: `demais (−4.026,68) +
título ÷ 1000 (−754,46) = −4.781,14` — **diferença 0,00** contra o oráculo congelado.

## 4. Alcance — varredura das três bases

Universo pela condição necessária (inteiro, último dígito ≠ 0, |v| entre 1.000 e 999.999):
**3.000 linhas**. Filtrando por outlier contra os pares limpos do mesmo fornecedor+categoria:

| Classe | Linhas | Efeito |
|---|---:|---:|
| **Confirmadas** (valor > 5× o maior valor legítimo do par) | **33** | **R$ 7,52 Mi** |
| Incerta (dentro da faixa legítima do fornecedor) | 1 | R$ 142 mil |
| A revisar (outlier 20–100×) | 65 | — |
| Indeterminadas (sem pares suficientes) | 1.073 | R$ 1,19 Mi |

As 33 confirmadas são quase todas **cobranças mensais recorrentes em conta-cartão**:

| Fornecedor | Categoria | Na base | Real | Ocorrências |
|---|---|---:|---:|---:|
| RCA Turismo (`130452`) | Pagamento ao Fornecedor | −659.532,00 | −659,53 | 9 meses |
| Nestlé (`147321`) | Copa e Cozinha | −107.626,00 | −107,63 | 9 meses |
| MG Produções (`176530-2`) | Endomarketing | −188.615,00 | −188,62 | 4 linhas |
| Secrets Cap Cana (`115998`) | Dif. Taxa de Câmbio | +872.566,00 | +872,57 | 1 |
| Conti di San Bonifácio | Dif. Taxa de Câmbio | +205.951,00 | +205,95 | 1 |
| Shopee.com (`184467-1`) | Material de Escritório | −40.929,00 | −40,93 | 4 parcelas |
| PARK HYATT MENDOZA | Pagamento ao Fornecedor | −68.809,00 | −68,81 | 1 |
| Banco Itau | Aplicações e Investimentos | +5.238,00 | +5,24 | 1 |

O caso da RCA é o mais didático: o título `130452` debita −659.532,00 **todo dia 15, por nove
meses seguidos**, sempre pareado com um "Desconto Obtido" de +2,00 (que é o ×1000 de R$ 0,002).
O maior pagamento legítimo da RCA em toda a base é **−28.869,62**.

**Falso positivo declarado:** Rextur Turismo, −142.459,00 (20/10/2023). A Rextur tem pagamentos
legítimos de −247.978,25, −179.580,97, −158.681,13. O suspeito está dentro da faixa normal dela —
**não** foi contado.

## 5. Efeito no resultado — o que importa para a decisão

`= RESULTADO DO EXERCÍCIO` (chave `REX`), lido de `get_dre_mensal` em produção:

| Ano | Na tela | Correção | Corrigido | |
|---|---:|---:|---:|---|
| 2023 | −3.369,77 | −196.210,59 | −199.580,36 | |
| **2024** | **−6.286.322,67** | +6.369.137,48 | **+82.814,81** | **inverte o sinal** |
| **2025** | **−967.461,35** | +1.306.363,29 | **+338.901,94** | **inverte o sinal** |
| 2026 (jan–jun) | −1.488.440,26 | +40.892,07 | −1.447.548,19 | |

Todas as 33 linhas caem **dentro** do de-para da DRE e **nenhuma** está em categoria excluída —
a correção inteira chega ao resultado.

2024 e 2025 aparecem hoje como **prejuízo** e são **lucro**. Em 2024 a distorção é de
R$ 6,37 milhões, concentrada num único fornecedor recorrente.

## 6. O que foi verificado e está CORRETO

Para delimitar o problema, o resto do caminho foi auditado e passou:

- **Motor da DRE (`get_dre_mensal`, 0207)** — quatro invariantes estruturais checadas na base,
  todas limpas: nenhuma categoria mapeada em dois blocos; nenhum bloco com categorias *e* fórmula
  (conflito de PK); nenhuma fórmula apontando para chave inexistente; nenhuma fórmula consumindo
  bloco de ordem maior (insumo não computado viraria 0 em silêncio).
- **Sem dupla contagem realizado × previsto** — zero `numero` em comum entre
  `raw.lancamentos_movimentacao` e `raw.titulos_em_aberto`.
- **Sem dupla contagem por conta-cartão** — a hipótese de que a "Abordagem B" tivesse se perdido
  no repoint da 0188 foi **refutada**: em 2025 inteiro, só **um** título aparece
  simultaneamente em conta-cartão e em banco (e é o do Endomarketing).
- **Base "em aberto"** — o arquivo-fonte de julho passa pelo parser **sem nenhuma célula
  corrompida**; o balde de vencidos (`venc`) soma −906.250,65 em 1.019 títulos.
- **`venc` sem filtro de ano** é **intencional** (semântica do modelo, documentada na 0207) e a UI
  o exibe em grupo próprio ("VENCIDOS"), não somado escondido no total.

## 7. Achados secundários (não confirmados como erro)

- **75 grupos de linhas byte-a-byte idênticas** em `raw.lancamentos_movimentacao` (94 linhas
  excedentes, R$ −1.215.060,51). Todas no **mesmo lote de carga**, com ids 1–14 de distância —
  ou seja, vêm **do próprio export do Monde**, não de reenvio de lote pelo app. **Atenção:** no
  caso do Endomarketing, a correção só do ×1000 já reconstrói o oráculo com as 4 linhas
  presentes, o que sugere que essas repetições podem ser **legítimas** (alocações separadas do
  Monde). **Questão para o provedor**, não defeito confirmado.
- **5 títulos com vencimento em 2049** em `raw.titulos_em_aberto` (−901,58) — data implausível.
- `raw.titulos_em_aberto` vai até 2031; o corte `pos_corte` (>2028) exclui ~R$ 16,8 Mi das séries
  mensais. Comportamento por design (0187 §3.4).

## 8. Correção recomendada

**Não mexer no contrato do `toNum`.** Para uma *string*, `"1.234"` é genuinamente ambíguo, e o
teste `coercao.test.ts:16` (`expect(toNum('1.234')).toBe(1234)`) consagra a leitura BR de
propósito — está certo para entrada textual.

**O erro é o parser destruir a informação que já tinha.** A célula era um número; `raw: false` a
converteu em texto ambíguo antes de perguntar.

**O padrão correto já existe no projeto:** `src/lib/gerencial/parser.ts:105-122` faz leitura
**dupla** — `raw:false` para exibição e `raw:true` em paralelo para preservar o tipo nativo,
casando por índice — exatamente para fugir da ambiguidade de locale (lá foi para datas).

Aplicar o mesmo em `parse-lancamentos-movimentacao.ts` e `parse-titulos-em-aberto.ts`: quando a
célula de `Valor` for `typeof === 'number'`, usar o número nativo e **não** passar pelo `toNum`.

**Alcance da mesma classe:** `raw: false` está nos **9 parsers** de `src/lib/carga/`
(vendas-produto, pessoas, contas-pagar-receber, lancamentos, vendas). Vale corrigir na origem.

**Depois de corrigir, re-subir os dois arquivos** — o upload é full-swap (`truncar` →
`inserir_lote` → `regenerar_fluxo_caixa`), então a reingestão resolve as 33 confirmadas, as 65 a
revisar e as 1.073 indeterminadas de uma vez, sem `UPDATE` destrutivo. É também a **única** forma
de fechar o número exato: o arquivo de 04/08 (116.713 linhas, 2023–2027) não está em disco, então
a enumeração acima é um **piso**, não um total.

**Guard sugerido:** teste que reprove `toNum` recebendo texto derivado de célula numérica, e um
alarme de ingestão que compare a soma do arquivo (valores nativos) com a soma gravada na base —
o mesmo delta que denunciou este bug (−40.892,07) teria acendido na carga.
