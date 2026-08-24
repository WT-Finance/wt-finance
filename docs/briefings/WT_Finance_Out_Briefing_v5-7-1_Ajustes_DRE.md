# Out-Briefing v5.7.1 — DRE: reconciliação do "Maiores variações", Receita Bruta como resultado, saída da Decomposição

**Branch:** `fix/v5-7-1-ajustes-dre` · **Data:** 2026-08-24 · **Rota C (patch)** — o escopo veio
do prompt do Yan, não de briefing `.md`; este out-briefing é o rastro em disco.
**Migrations:** `0253` (aditiva, **aplicada**) + 1 destrutiva **pendente** em `supabase/patches/`
**Sem ADR** (nenhuma decisão arquitetural nova; o critério da DRE segue o ADR-0168).
**Testes:** 989 (v5.7.0: 986).

---

## 1. O defeito que motivou o patch — e a medição

O card "Maiores variações" mudou de página na v5.7.0 e passou a viver logo abaixo do
Demonstrativo. As duas peças usavam janelas **diferentes** para a mesma ideia de "acumulado
do ano":

| | ano corrente | ano anterior |
|---|---|---|
| **Card** | `data_competencia <= hoje` | **`doy <= dia-do-ano de hoje`** |
| **Demonstrativo** | `meses[0..mês corrente]` | `meses[0..mês corrente]` (meses INTEIROS) |

Medido em 24/08/2026, categoria "Pagamento ao Fornecedor":

- ano corrente → card **−19.842.743,22** · DRE YTD 26 **−19.842.743,22** → **0,00** (batiam,
  porque os dois cortam em "hoje" e não existe realizado além da data-base);
- ano anterior → card **−15.518.502,72** · DRE YTD 25 **−16.157.462,20** → **638.959,48**,
  que são exatamente 25 a 31/08/2025.

Dois números com o mesmo rótulo e valores diferentes, um debaixo do outro.

## 2. A decisão, e o que ela custa

**A janela do Demonstrativo vence** (`0253`). "YTD = janeiro até o mês corrente" já é a
definição da casa em três lugares (tabela, Resumo Executivo, Consolidado); mudá-la ali
rippearia por toda a comparação ano-a-ano para consertar um card.

⚖️ **O que se perde, registrado:** o corte por dia-do-ano comparava o mesmo **número de dias**
decorridos — mais rigoroso. Com a janela por mês, no mês corrente compara-se um mês PARCIAL
do ano atual contra o mês INTEIRO do anterior. É a mesma assimetria que o YTD do
Demonstrativo já carregava. A troca é consciente: dois números que se contradizem na mesma
tela custam mais confiança do que um viés conhecido e **nomeado** — e por isso os cabeçalhos
passaram a dizer "YTD 2025"/"YTD 2026".

**Reverter é uma linha** (voltar o filtro do ano anterior para `doy <= v_doy` na `0253`), se
a decisão mudar.

## 3. Prova

Depois da `0253`, comparando o payload do ranking contra o YTD do Demonstrativo categoria a
categoria (casando por **nome real do Monde** — 6 categorias têm override só de
capitalização, e casar por rótulo daria falso negativo):

> **126 categorias no ranking · 0 divergências numéricas** nos dois anos.

O invariante virou **caso de contrato permanente** (`rpc-contrato.test.ts`): se as janelas
voltarem a divergir, o teste acusa com a lista de categorias.

## 4. As outras duas frentes

**Receita Bruta vira linha de resultado.** `RB_H` sempre foi um subtotal (`["REPASSE","RV"]`)
mas estava tipada como `blocoH` e desenhada **acima** de uma das parcelas que soma. O patch
põe `RV` antes dela (ordem 40) e promove `RB_H` a `tot` (ordem 50, rótulo `(=) …`). Não muda
um centavo — `tipo`/`ordem` não entram no cálculo de `get_dre_mensal`. De carona, o Resumo
Executivo deixou de marcar a Receita Bruta com `(+)`: a premissa de que ela era "a única que
ENTRA no cálculo" caducou.

**Decomposição sai da página, como código morto.** Saíram da `page.tsx` o import, a chamada
da RPC, o `parseRpc` e o JSX. **Não foram apagados:** o componente
`decomposicao-lancamentos.tsx`, o `decomposicaoBlocoSchema` e a RPC `get_decomposicao_bloco`
(0209). O caminho de volta está escrito no topo da `page.tsx`, item por item.
⚠️ Ponto de atenção durante a remoção: o índice **posicional** do ranking dentro do
`Promise.allSettled` andou de `+1` para `+0`. Tirar uma chamada do meio do array sem mexer
nisso faria o ranking ler o payload de um ANO da DRE — o `parseRpc` rejeitaria em silêncio e
o card viraria "sem movimentações".

## 5. Estado dos gates

| | |
|---|---|
| build · tsc · lint | verdes/limpos |
| suíte | **987/989** — os 2 vermelhos são as guardas da estrutura nova, que só ficam verdes quando a destrutiva for aplicada (mesmo desenho da v5.7.0) |
| `0253` | **aplicada**, gate verde, verificada por REST |
| destrutiva | **pendente**, em `supabase/patches/` |

## 6. Pendências e registros

| Item | Estado |
|---|---|
| **Aplicar a migration destrutiva** (`supabase/patches/dre-receita-bruta-vira-resultado.sql` → `0254`, `npm run db:migrate -- --destrutiva`) | ⏳ **do Yan** |
| **Conferência visual** | ⏳ **do Yan** — mesma limitação da v5.7.0 (rota 307 → `/login` sem sessão; sem jsdom/testing-library) |
| **O ranking inclui categorias que a DRE EXCLUI** | 📝 **registrado, não corrigido.** "Movimentação de Caixa - C" e "- D" (transferência interna) estão `excluida=true` no de-para, mas o ranking lê `fato_fluxo` direto e as enxerga. Hoje não aparecem no top-7, então não incomoda; se aparecerem, seria uma linha sem sentido no card. Pré-existente, não introduzido aqui, e fora do escopo pedido — **um filtro pelo de-para resolveria**, mas muda quais categorias o card mostra, e isso é decisão de produto. |
| Δ% do card | 📝 muda junto com os valores (é derivado deles) — esperado, não é defeito |

## 7. Aprendizado (régua de 5 destinos)

| Achado | Destino | Ação |
|---|---|---|
| Dois cards na mesma página com a mesma palavra ("acumulado do ano") e janelas diferentes | 1 — **enforcement**: caso de contrato que reconcilia os dois payloads | adicionado |
| Ao remover uma chamada de um `Promise.allSettled`, os índices posicionais dos vizinhos andam | 2 — **já coberto**: o próprio arquivo documenta a armadilha, e agora tem comentário no ponto exato | nada em prosa |
| `reverter_diario` pressupõe um toque por linha por lote | 2 — **já na skill** `banco-e-rpc` (v5.7.0); aqui foi **aplicado**: a destrutiva faz um UPDATE por linha | nada a adicionar |

---

## 8. Arquivos

**Novos:** `supabase/migrations/0253_ranking_janela_ytd_da_dre.sql` ·
`supabase/patches/dre-receita-bruta-vira-resultado.sql` · este out-briefing.

**Modificados:** `src/components/financeiro/ranking-caixa.tsx` (cabeçalhos + tooltip) ·
`src/components/financeiro/dre/resumo-executivo.tsx` (prefixo da Receita Bruta) ·
`src/app/financeiro/dre/page.tsx` (saída da Decomposição + índice do ranking) ·
`src/lib/rpc-contrato.test.ts` (2 guardas + a reconciliação) · `CHANGELOG.md` ·
`src/data/changelog-diretoria.ts` · `package.json` · `docs/WORKING-CONTEXT.md`.

**Preservados como código morto (de propósito):**
`src/components/financeiro/decomposicao-lancamentos.tsx`, `decomposicaoBlocoSchema` em
`src/lib/dre/schemas.ts`, RPC `get_decomposicao_bloco` (0209).
