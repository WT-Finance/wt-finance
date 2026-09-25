# Anexo v6.0.0 / M5 — desenho da carga atômica (Frente D)

> **O que é.** O desenho que a M5 implementa, escrito antes do código, a partir dos corpos **vivos**
> do catálogo (não das migrations de origem — `CREATE OR REPLACE` se escreve do catálogo vivo).
> Escrito em 2026-09-22. Migrations livres: **0277** e **0278**. ADR livre: **0176**.

---

## 1. O achado que muda a ordem do briefing

**O filtro `Setor Macro != "Welcome"` nunca existiu em código.** Ele vivia no script R
(`analise_casamentos2.R`), e o card antigo subia o arquivo **já tratado** — por isso
`raw.vendas_excel` nunca teve linha de Welcome. O parser da M3 lê o **cru**, que as traz; o
caminho de aplicação da M4 já está vivo; e o filtro só entraria no transform na **M7** (Frente G).

Medido nos anexos de 21/09, pelo parser do projeto:

| | |
|---|---|
| linhas com `Setor Macro = 'Welcome'` | **210** |
| Σ Valor Total dessas linhas | **470.320,84** |
| Σ Receitas dessas linhas | **5.242,80** |
| vendas distintas que só existem em Welcome | **141** |
| vendas distintas **sem** Welcome | **29.458** |
| `analytics.fato_venda` hoje | **29.458** |

Os três primeiros números são, ao centavo, os que o briefing §3 decisão 8 declara. O quarto explica
o `+141` que o gate humano da M4 mostrava. E o quinto bate exatamente com a base viva.

**Conclusão: aplicar uma carga de Vendas hoje adicionaria 141 vendas e R$ 470.320,84 ao
`fato_venda`** — violação direta do invariante 1 ("zero mudança de número em qualquer tela"), sem
erro nenhum. O filtro **entra na M5**, antecipado da M7, porque a M5 é onde `promover_carga_vendas`
é reescrito e porque a própria prova da M5 é "snapshot de fatos antes/depois idêntico".

**Onde ele entra, e a armadilha:** uma view nomeada
`analytics.vendas_excel_para_fato`, que o `transform_raw_to_analytics` passa a ler no lugar de
`raw.vendas_excel` nas **cinco** leituras (as três dimensões, `fato_venda` e `fato_venda_item`) —
um lugar só, com `COMMENT` citando a decisão 8. O predicado é
`setor_macro IS DISTINCT FROM 'Welcome'`, **nunca `<> 'Welcome'`**: `setor_macro` é anulável, e
`NULL <> 'Welcome'` é `NULL`, o que excluiria em silêncio toda linha sem setor macro.

---

## 2. O que a M5 entrega

| # | O quê |
|---|---|
| 1 | Filtro Welcome no transform (§1) — antecipado da M7 |
| 2 | `raw.vendas_excel.intermediario` (+ staging, + `inserir_lote_staging`, + `promover`) — decisão 7 |
| 3 | Quatro staging `UNLOGGED` novas: demonstrativo, movimentação, aberto, operação |
| 4 | `raw.lancamentos_operacao` — a raw que falta; `fato_lancamento_operacao` passa a derivar dela |
| 5 | `limpar_staging_*` / `inserir_lote_staging_*` / `validar_carga_*` / `promover_carga_*` × 4 |
| 6 | Checksum conferido **dentro** do banco, contra o que ficou gravado |
| 7 | `pg_advisory_xact_lock` por base + `SET LOCAL lock_timeout` |
| 8 | Idempotência por `carga_id` |
| 9 | `aplicar.ts` troca o pipeline antigo pelo atômico, com a credencial `ingestor` |

**Não entrega:** o `DROP` de `truncar_*`/`inserir_lote_*` (é a destrutiva do GATE 3, M10, depois que
o card deployado deixar de chamá-las), o grafo de dependência (M7) e a tela/alarmes (M6).

---

## 3. Migrations

Duas, as duas **aditivas**, para o `revisor-db` conseguir julgar cada uma pelo que ela é:

### `0277_ingestao_estrutura_atomica.sql` — estrutura
- Quatro staging `UNLOGGED`, cada uma `(LIKE <raw> INCLUDING DEFAULTS)`, molde de
  `raw.vendas_excel_staging` (0116). ⚠️ `INCLUDING DEFAULTS` **não** traz `CHECK` — se a raw tiver
  constraint que importa para a validação, ela precisa ser declarada na staging de propósito.
- `raw.lancamentos_operacao`: espelha o CSV do scrape (as colunas do `LancamentoOperacaoCru`),
  mais `arquivo_origem`/`carregado_em`, RLS ligada, `REVOKE` de `PUBLIC`/`anon`/`authenticated`,
  `GRANT` só a `service_role` — a mesma postura de `raw.titulos_em_aberto` (0186).
- `raw.vendas_excel.intermediario text` e a coluna gêmea na staging (anulável — aditiva).
- `analytics.vendas_excel_para_fato` (view) + `transform_raw_to_analytics` lendo dela (§1).
- `ingestao.promocao` — a linha que torna a promoção idempotente: `(base, carga_id) UNIQUE`,
  `promovido_em`, `resultado jsonb`. Escrita **dentro** da mesma transação da promoção; é o que
  permite repetir a chamada sem repetir o efeito.

### `0278_ingestao_pipeline_atomico.sql` — as RPCs
Quatro conjuntos, no molde do catálogo vivo de `promover_carga_vendas` + o que o briefing §5-D
acrescenta. Nomes seguindo a convenção que já existe (`*_vendas`, `*_pessoas`):

```
limpar_staging_demonstrativo()        inserir_lote_staging_demonstrativo(jsonb)
validar_carga_demonstrativo()         promover_carga_demonstrativo(jsonb, uuid)
… idem _movimentacao, _aberto, _operacao
```

e `promover_carga_vendas` ganha a mesma assinatura `(p_checksums jsonb, p_carga_id uuid)`.

⚠️ **`CREATE OR REPLACE` não adiciona parâmetro** — mudar a assinatura de `promover_carga_vendas`
exige `DROP FUNCTION` + `CREATE` (ADR-0126, v4.23.0). `DROP FUNCTION` é **destrutivo** pelo
classificador. Duas saídas, e a escolha é do orquestrador: (a) criar a versão nova com a
assinatura nova e deixar a antiga morrer no GATE 3 — mantém a migration aditiva; (b) DROP+CREATE
numa destrutiva com TTY. **Escolha (a)**: a função antiga fica órfã por uma versão e sai com as
outras na M10, que é exatamente o que o briefing já planejou para `truncar_*`/`inserir_lote_*`.

### Corpo de cada `promover_carga_{base}`, na ordem

1. `SET LOCAL lock_timeout = '<n>s'` e `pg_advisory_xact_lock(<chave da base>)` — hoje só existe
   a chave `4017001` (Vendas); cada base ganha a sua, declarada numa constante comentada.
2. **Idempotência:** `carga_id` já em `ingestao.promocao` para esta base ⇒ devolve o `resultado`
   guardado e **não** repete o efeito.
3. Validações **antes** de qualquer destruição (é o que faz a base anterior sobreviver): staging
   não vazia; faixa de data contra `analytics.dim_data` onde houver FK; o que `validar_carga_*`
   daquela base apurar.
4. `TRUNCATE` + `INSERT … SELECT` da staging para a raw.
5. **Conferência do checksum contra o que FICOU GRAVADO** (§4).
6. `regenerar_*`/`provisionar_*`/`transform_*` da base, **dentro** da mesma transação.
7. Grava `ingestao.promocao` e `TRUNCATE` da staging.
8. `RETURNS jsonb` com as contagens — o que `aplicar.ts` já espera.

---

## 4. O checksum conferido no banco (o coração da missão)

O contrato §4 e o invariante 5 dizem que **checksum falho nunca aplica**. Hoje a conferência é do
servidor: o parser compara o que LEU contra o que o arquivo DECLARA. Isso não cobre o trecho entre
o parse e a tabela — serialização, cast, arredondamento de `NUMERIC(18,2)`, lote perdido.

A M3 já deixou o gancho pronto: `Checksum.centavosArredondados` existe, nas palavras do próprio
código, para "a RPC de promoção conferir contra a tabela depois do `INSERT`, já que lá só existe o
valor arredondado". **É contra esse campo que o banco confere**, nunca contra `centavosApurados`
(que é a soma dos valores brutos, com mais de 2 casas, e por construção difere em alguns centavos).

O lote de checksums viaja como `jsonb`, um objeto por checksum, com `escopo`, `chave` (array),
`campo`, `linhas` e `centavos`. A RPC **reagrupa a própria tabela pelas mesmas chaves** e compara:

| base | como o banco reagrupa | quantos |
|---|---|---|
| movimentação / aberto | `GROUP BY grupo_categoria` e `GROUP BY categoria`, mais o total | 148+1 / 95+1 |
| vendas | `GROUP BY arquivo_origem`, 4 somas + contagem | 4 por arquivo |
| demonstrativo | pelos níveis do pivot que viraram coluna (`tipo`, `grupo`, `descricao`) + Total Geral | até 557 |
| operação | não há checksum no arquivo — o cruzamento é ALARME, não bloqueio (contrato §4) | — |

**Checksum que a base não consegue reagrupar não é silenciado:** a RPC devolve, no jsonb de
retorno, quantos conferiu e quantos não tinha como conferir. "Conferi 0 de 557" e "conferi 557 de
557" não podem ter a mesma aparência — foi exatamente assim que a cobertura do cruzamento sumiu
na M4.

Qualquer divergência ⇒ `RAISE`, a transação inteira volta, **a base anterior fica**.

---

## 5. Armadilhas nomeadas (todas já custaram caro neste projeto)

- **`IS DISTINCT FROM`, não `<>`**, em toda comparação com coluna anulável (§1).
- **"Hoje" dentro da RPC é o de São Paulo**: `(now() AT TIME ZONE 'America/Sao_Paulo')::date`. As
  app roles têm `timezone` setado (0152), mas a promoção roda `SECURITY DEFINER` com owner
  `postgres`, que está em **UTC** — usar `CURRENT_DATE` cru classificaria errado por ~3 h todo dia.
  Vale para o `status` de Operação (§6).
- **`CREATE OR REPLACE` não adiciona parâmetro** (ADR-0126) — ver §3.
- **`LIKE … INCLUDING DEFAULTS` não traz `CHECK`** — ver §3.
- **Staging é `UNLOGGED`**: não sobrevive a crash/failover no meio de uma carga multi-lote. O
  sintoma é "staging vazia" na validação, e a ação é refazer o upload — a base viva fica intacta.
- **`db push` empurra TODO o conjunto pendente** — nunca deixar migration destrutiva na pasta.
- **Verificação pós-push é via REST com `service_role`**; `db query` não executa o corpo.

## 6. Lançamentos por Operação, o caso que muda de forma

Hoje o CSV vira `analytics.fato_lancamento_operacao` direto. Com `raw.lancamentos_operacao`, a
cadeia passa a ser `staging → raw → fato`, e o `promover` deriva o fato **em SQL**:

- `data_final = coalesce(liquidacao, vencimento)`;
- `status` pela regra do R, inclusive o ramo `TRUE ~ Tipo` (sem ele, lançamento sem data final
  sai do realizado — ver o durável da M4), com "hoje" em São Paulo;
- `mes_ano = to_char(data_final, 'YYYY-MM')`;
- as linhas-placeholder do scrape (`valor` nulo, `tipo` fora de Entrada/Saída, `operacao` nula)
  ficam na **raw** e não passam para o fato — hoje elas são descartadas no servidor e somem sem
  deixar rastro; com a raw própria, passam a ser auditáveis.

O `Vencimento` continua vindo de `ingestao_vencimentos_por_numero` (0276), resolvido no servidor
antes do staging — não muda nesta missão.

## 7. Prova da missão

1. **Ensaio em transação revertida**: chamar `promover_carga_*` com um checksum FALSO e ver
   `RAISE` + base intacta; e com o checksum certo, ver aplicar. Tudo dentro de `BEGIN … ROLLBACK`
   contra produção, no molde de `reverter-diario.test.ts` (skill `banco-e-rpc` §6).
2. **Snapshot de fatos antes/depois** (invariante 1): contagem e soma de `fato_venda`,
   `fato_venda_item`, `fato_fluxo`, `fato_lancamento_operacao` e `vw_dre_competencia` antes e
   depois de uma carga completa das cinco bases — **idênticos**, exceto o que o briefing declara
   como exceção visível (`Intermediário` preenchido).
3. `revisor-db` **antes** da aplicação, como manda o briefing §8.
