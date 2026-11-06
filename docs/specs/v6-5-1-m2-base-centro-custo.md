# v6.5.1 / M2 — Contrato da base `lancamentos-centro-custo`

Fonte única para a migration 0304, o parser e o plumbing da base nova. Decisões do GATE 0 (D1–D7) em
`docs/auditoria/v6-5-1-m0-dre-centro-custo.md`; regras do rateio no briefing §3.2.

## 1. O arquivo (medido no export de 06/11/2026, `centro-custo-cru-2026-11-06.xlsx`)

- 1 aba; cabeçalho na linha 1, 12 colunas: `Pessoa` · (vazio) · `Descrição` · `Valor Lançamento` ·
  `% Centro Custo` · `Valor Centro Custo` · `Número` · `Emissão` · `Vencimento` · `Movimentação` ·
  `Centro de Custo` · `Valor Movimentação`. O cabeçalho "Pessoa" está na coluna A e o dado na B — não
  importa: `Pessoa` NÃO é lida.
- Linha de OUTLINE por centro: col. A = estado `-` (aberto) ou `+` (recolhido); col. B =
  `Centro de Custo :  WG - Corp (2980, R$ 1.325.290,56)` (dois espaços; valor pode vir `-R$ …`).
  Nome vazio (`Centro de Custo :  (n, R$ x)`) = grupo **sem centro**.
- Linhas de DETALHE: `Número` (TEXTO, 242 com sufixo `-N`), datas nativas, `Centro de Custo` com espaço
  na frente (`" WG - Corp"`), `% Centro Custo` na escala 0–100 (máx. 104,30; 362 vazios = lançamentos de
  valor líquido zero; 8 zeros), `Valor Centro Custo` **sem sinal** (0 negativos em 21.144),
  `Valor Movimentação` com sinal.
- Depois de cada grupo, uma linha de SUBTOTAL (só `Valor Centro Custo`); no fim, uma linha de TOTAL
  (soma `Valor Movimentação` repetido por centro — **não serve de checksum**, briefing §3.1).
- **Checksum = outline:** por grupo, `linhas` = n e `centavos` = Σ (`Valor Centro Custo` com o SINAL de
  `Valor Movimentação`). Fecha ao centavo nos 4 grupos de 06/11 (Corp 2.980 / 1.325.290,56 · CSC 1.849 /
  −4.114.460,58 · Trips 5.505 / 1.542.937,64 · Weddings 10.810 / 667.563,70).

## 2. Parser (`src/lib/ingestao/parsers/lancamentos-centro-custo.ts`)

`parseLancamentosCentroCustoRows(rows: Matriz, opcoes?: { hoje?: Date }): Parse<LancamentoCentroCustoCru>`

```ts
interface LancamentoCentroCustoCru {
  linha_origem: number            // 1-based com cabeçalho
  numero: string                  // texto inteiro, com sufixo -N se houver
  emissao: string | null          // ISO; guarda de faixa (errata 1) — fora da faixa vira null
  vencimento: string | null
  movimentacao: string | null
  centro_custo: string | null     // nome aparado (NBSP incluso); null = sem centro
  pct_centro: number | null       // escala 0–100, como vem; vazio = null
  valor_movimentacao: number      // 2 casas (toCentavos/100)
  valor_centro_custo: number      // 2 casas, COM o sinal de Valor Movimentação
}
```

- **Lista fechada (D6):** só essas colunas viram campo. `Pessoa`, `Descrição`, `Valor Lançamento`
  nunca. Nenhuma mensagem de erro reproduz conteúdo de linha além de `Número` e nome de centro.
- **Grupo recolhido (`+`) REJEITA a carga** (`ESTRUTURA_INESPERADA`, mensagem nomeando o centro e
  pedindo o export com todos os grupos abertos) — mesmo que o checksum fechasse.
- Detalhe cujo `Centro de Custo` ≠ nome do outline corrente ⇒ `ESTRUTURA_INESPERADA`. Detalhe antes de
  qualquer outline ⇒ idem. Outline repetido ⇒ idem.
- `Valor Centro Custo` negativo no arquivo ⇒ `ESTRUTURA_INESPERADA` (a convenção "sem sinal" mudou).
  Valor ilegível ⇒ idem.
- Checksum por outline: `escopo:'centro'`, `chave:[nome]` (`''` = sem centro), `campo:'valor_centro_custo'`,
  apurado no BRUTO (`AcumuladorBruto`), `centavosArredondados` = Σ dos valores gravados. Tolerância zero;
  falha ⇒ `CHECKSUM_FALHOU`.
- Linhas de subtotal/total (sem `Número`) são puladas; outras linhas não vazias sem `Número` contam em
  `diagnostico.linhasIgnoradas`.

## 3. RPCs (migration 0304) — chave de lock 4017070

| RPC | Contrato |
|---|---|
| `limpar_staging_centro_custo()` | TRUNCATE da staging |
| `inserir_lote_staging_centro_custo(p_linhas jsonb)` | array de objetos com as chaves: `arquivo_origem`*, `linha_origem`, `numero`*, `emissao`, `vencimento`, `movimentacao` (ISO \| null), `centro_custo` (text \| null), `pct_centro` (number \| null), `valor_movimentacao`*, `valor_centro_custo`* (* obrigatório; ausente ⇒ `LOTE_LINHA_INVALIDA`) |
| `validar_carga_centro_custo()` | `{ok,total,erros[]}` — reprova: staging vazia; centro desconhecido (nome não cadastrado em `financeiro.centro_custo`, nomeado); `% Centro Custo` diferente entre movimentações do mesmo (Número, centro); `%` negativo |
| `promover_carga_centro_custo(p_checksums jsonb, p_carga_id uuid)` | replay por `ingestao.promocao`; TRUNCATE+INSERT da raw; conferência POR CENTRO contra o GRAVADO; regenera `financeiro.centro_custo_rateio` na mesma transação; devolve `{linhas, checksums_conferidos, checksums_nao_conferiveis:0, rateio:{numeros, multicentro, partes_iguais, por_centro}, avisos[]}` |

Checksum (array, um por outline): `{ "escopo": "centro", "chave": { "centro_custo": text | null }, "linhas": int,
"centavos": bigint }`. Vazio ⇒ `CHECKSUM_AUSENTE`; formato errado ⇒ `CHECKSUM_INVALIDO`; centro gravado sem
checksum ⇒ `CHECKSUM_AUSENTE`; divergência ⇒ `CHECKSUM_FALHOU`.

## 4. Rateio (`financeiro.centro_custo_rateio (numero, centro, peso)`) — briefing §3.2

Regenerado inteiro na promoção. Por Número:
1. Um registro por (Número, centro) — o `%` é do lançamento (a validação garante que não varia).
2. **Sem centro** com valor zero num Número que tem outro centro = sobra de arredondamento ⇒ sai.
3. `peso = % ÷ Σ %` dos centros do Número; **Σ % = 0** (lançamento de valor líquido zero, `%` vazio) ⇒
   partes iguais. Peso zero não entra.
4. O último centro (pela `ordem` da dimensão) recebe `1 − Σ dos outros`: Σ pesos = 1 EXATO. Guarda: Número
   sem rateio ou com Σ ≠ 1 ⇒ `RATEIO_NAO_FECHA` (RAISE, base anterior intacta).

Dimensão `financeiro.centro_custo (id, nome_monde, rotulo, ordem)`: trips/`WG - Trips`, weddings/
`WG - Weddings`, corp/`WG - Corp`, csc/`WG - CSC`, sem_centro/NULL. Centro novo no Monde ⇒ a carga reprova
nomeando-o (cadastrar por migration aditiva).

## 5. Plumbing

- `bases.ts`: `'lancamentos-centro-custo'` por ÚLTIMO; rótulo "Lançamentos por Centro de Custo"; um arquivo
  por carga; sem escopo de chave de API nem expectativa do vigia (sem RPA — fronteira §11).
- Base de FLUXO: alarma "ano fechado alterado" (não é isenta). `ingestao_soma_por_ano`: ano da
  movimentação, Σ `valor_centro_custo`.
- Grafo: independente (sem aresta). Seed: último na ordem.
- Até o patch destrutivo dos CHECKs (`supabase/patches/centro_custo_checks_ingestao.sql`, Yan em TTY), a
  abertura da carga falha FECHADA no CHECK de `ingestao.carga`.
