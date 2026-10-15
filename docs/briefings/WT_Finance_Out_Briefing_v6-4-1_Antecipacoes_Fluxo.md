# Out-briefing — v6.4.1 · Antecipações em âmbar no "Fluxo de Caixa Mensal"

Patch de rota B (técnica, sem decisão de produto em aberto: as decisões vieram da v6.4.0, out-briefing §8).
Spec aprovada em plan mode: `docs/briefings/spec-v6-4-1-antecipacoes-fluxo.md`. Branch
`feat/v6-4-1-antecipacoes-fluxo`, a partir de `a8cefb5`.

## 1. Resumo

O gráfico **Fluxo de Caixa Mensal** (`/financeiro/fluxo-caixa`) passa a mostrar, dentro da barra de
**entradas efetivadas**, a parte que veio de **antecipação de recebíveis**, em âmbar:

- o valor é o **líquido** e cai no mês da `data` da antecipação, todas as contas somadas (decisão do Yan,
  15/10);
- o tooltip mostra "Entradas efetivadas R$ X · das quais antecipação R$ Y (Z%)", com a nota "segundo o
  registro de antecipações";
- na legenda entra o item "Antecipação (dentro das entradas efetivadas)".

A fonte é o registro `financeiro.antecipacao` da v6.4.0. A leitura é um **recorte do registro**, não uma
marcação do Monde. Ela se sustenta pela medição da v6.4.0: em 25 de 25 meses, as entradas da própria conta
são maiores ou iguais ao líquido antecipado. Mesmo assim, o âmbar é limitado ao total das entradas do mês
(clamp), e o tooltip avisa quando o registro passa desse total.

Valor de referência para a conferência visual: em **abr/26**, R$ 700,3 mil em âmbar dentro de R$ 7,21 mi.

## 2. Decisões técnicas

- **RPC nova, sem tocar a existente.**
  - O gráfico lê `get_fluxo_caixa_mensal_v3` (gate `financeiro/fluxo-caixa`). As RPCs de antecipação da
    v6.4.0 exigem `financeiro/geral`, então a página não tinha como lê-las.
  - A **0299** cria `get_fluxo_antecipacoes_mensal()`, o recorte de leitura mínimo sob o gate da própria
    página, e `get_fluxo_caixa_mensal_v3` não muda.
- **Só o líquido sai.** A primeira versão devolvia também o valor de face (`antecipado`). O revisor-db
  apontou (MÉDIO) que líquido + face revelaria o **desconto mensal** a quem tem só `fluxo-caixa`. Hoje as
  roles das duas áreas coincidem, mas o acoplamento é estrutural. A face saiu antes da aplicação. Retorno:
  `[{mes, liquido, n}]`.
- **Degradação.** A página busca a RPC numa promise própria. Se ela falhar, o gráfico rende como antes,
  sem o âmbar, com a nota "Antecipações indisponíveis no momento".
- **Gráfico.** A barra de entradas efetivadas virou dois segmentos empilhados (`stackId="entrada"`), na
  mesma coluna de 5 px: âmbar na base, o restante em verde no topo, com o raio. As outras três barras não
  mudam.
- **Cor.** Token semântico `--chart-antecipacao: var(--warning)` e `fluxoColors.antecipacao` (arquivo-ímã,
  escrito pelo orquestrador). A cor também foi registrada na página de design system.
- **Sem ADR.** É um recorte de leitura sobre decisão já registrada (ADR-0183). ADR livre continua **0184**.

## 3. Banco

| Migration | Tipo | Estado |
|---|---|---|
| `0299_fluxo_antecipacoes_mensal.sql` | ADITIVA (CREATE FUNCTION + REVOKE/GRANT + COMMENT + guard) | **APLICADA** em 15/10 via `db:migrate -- --aditiva`, backup-gate verde |

- **Ensaio** em transação revertida contra produção, antes da aplicação:
  - 22 meses, n = 38, Σ líquido = 7.057.349,44 (≡ a carga da 0296);
  - abr/26 = 700.292,47;
  - identidade sem a área (papel só-Geral) negada.
- **REST pós-push:** service_role 200; anon 401/42501.
- `src/types/database.ts` regenerado; baseline `schema-v6.json` com `ultima_migration` = 0299, e o teste de
  drift está verde.
- Allowlist do `verificador` derivada (`scripts/credencial/derivar-allowlist.mjs verificador`): inclui
  `get_fluxo_antecipacoes_mensal()`, e o GRANT já veio na própria 0299 (molde 0292/0297).
- Nenhuma destrutiva pendente em `supabase/migrations/`. Banco na **0299**, livre **0300**.

> **Nota — `COMMENT ON FUNCTION` desatualizado (aplicado).** O comentário da função (`0299:67`) ainda
> descreve o retorno como `[{mes, liquido, antecipado, n}]`, da versão anterior à retirada da face. O corpo
> e o contrato estão certos: o caso de contrato trava a lista fechada `{liquido, mes, n}`. O arquivo de
> migration aplicado não se edita. A correção vai na próxima migration que tocar a função, com um
> `COMMENT ON FUNCTION` novo (aditivo). O mesmo vale para a spec, que cita `antecipado` como histórico do
> plano.

## 4. Arquivos

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/0299_fluxo_antecipacoes_mensal.sql` | novo, RPC de leitura |
| `src/types/database.ts`, `supabase/baseline/schema-v6.json` | regenerados |
| `src/lib/fluxo/antecipacao-mensal.ts` (+ `.test.ts`) | novo módulo puro: schema e `mesclarAntecipacoes` (clamp, flag, %) |
| `src/app/financeiro/fluxo-caixa/page.tsx` | busca a RPC, degradação |
| `src/components/financeiro/fluxo-mensal-chart.tsx` | barras empilhadas, tooltip, legenda, nota de indisponível |
| `src/styles/tokens.css`, `src/components/charts/chart-theme.ts` | `--chart-antecipacao`, `fluxoColors.antecipacao` |
| `src/app/admin/design-system/page.tsx` | registro da cor nova |
| `src/lib/rpc-contrato.test.ts` | 5 casos de contrato |
| `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json`, `package-lock.json` | fechamento, 6.4.1 |
| `docs/briefings/spec-v6-4-1-antecipacoes-fluxo.md`, este out-briefing, `docs/WORKING-CONTEXT.md` | documentação |

## 5. Gates e prova

- `npm run build`, `npx tsc --noEmit` e `npm run lint`: limpos.
- `npm test`: 145 de 146 arquivos e 2.579 testes verdes, com 6 pulados.
  - Único vermelho: `src/lib/ingestao/oraculo-demonstrativo.test.ts`, que acusa `ENOENT` em
    `tests/fixtures/ingestao/demonstrativo-cru.xlsx`.
  - É a fixture perdida da B-38, pré-existente; a branch não toca `src/lib/ingestao`.
- **Contrato contra o banco real.** Os 5 casos rodaram com o `verificador`, sem auto-skip:
  - forma pelo schema;
  - caso positivo (a base tem antecipação);
  - **paridade por ano** com a página Geral: Σ líquido e Σ n por ano ≡ `get_geral_antecipacoes(ano).total`, ao
    centavo;
  - lista fechada de chaves (face fora);
  - anon negado (42501).
- **Módulo puro:** 15 casos (12 da mescla + 3 do schema), entre eles:
  - mês sem registro;
  - parcial;
  - igual;
  - excedente (clamp + flag);
  - só previsto;
  - entrada efetivada negativa;
  - fora da janela;
  - repetidos;
  - líquido negativo;
  - não mutação.

## 6. Não verificado pela sessão

- **Conferência visual.** A sessão roda em background, sem credencial humana, e o MCP Playwright não sobe
  nesse modo. O **Yan confere no preview**:
  - abr/26 com R$ 700,3 mil em âmbar dentro de R$ 7,21 mi;
  - tooltip com "das quais antecipação" e o percentual;
  - a nota "segundo o registro de antecipações";
  - legenda nova;
  - um mês sem antecipação continua todo verde.
- **Ponto específico para o visual (revisor, MÉDIO).** O tooltip lê o ponto inteiro pelo `payload` de cada
  item do Recharts 3.8.1. Se ele não chegar, há fallback (`payload.find(...)`) e, em último caso, a linha
  mostra o valor do segmento verde. Mesmo assim, a frase "das quais antecipação" só aparece se o ponto
  chegar. Conferir que ela aparece.

## 7. Pendências — o que só o Yan tem

1. **Mergear o PR** e, depois do merge, `/pos-merge`: pull na raiz e remoção da worktree. A sessão não
   alcança o checkout compartilhado.
2. **Conferência visual no preview**, item 6.
3. **Cor âmbar × verde (registro do revisor, BAIXO).**
   - `--warning` (#D9A23F) tem cerca de 2,3:1 contra o branco e cerca de 2:1 contra o verde `--positive`,
     abaixo do 3:1 sugerido para objeto gráfico.
   - É mitigado: a legenda tem texto, o tooltip traz o valor, e a diferença de luminância ajuda o daltonismo
     vermelho-verde.
   - A cor foi decisão sua: manter ou escurecer o âmbar é escolha de produto.

## 8. Parecer da revisão

### `revisor-db` (antes de aplicar a 0299): 0 CRÍTICO · 0 ALTO · 1 MÉDIO · 4 BAIXO — APROVADA COM RESSALVAS

| # | Sev. | Achado | Como foi endereçado |
|---|---|---|---|
| 1 | MÉDIO | `antecipado` (face) sai sem consumidor; com o líquido, revela o desconto mensal a quem só tem `fluxo-caixa` | **Corrigido antes da aplicação**: face removida da RPC, do schema e dos testes |
| 2 | BAIXO | Guard sem pré-condição das colunas (plpgsql liga em runtime) | **Corrigido**: pré-condição `data`/`valor_liquido` via `pg_attribute` |
| 3 | BAIXO | `to_char(date)` resolve para `timestamptz` (depende do TimeZone da sessão) | **Corrigido**: `to_char(a.data::timestamp, ...)` |
| 4 | BAIXO | Pendências de fora: `database.ts`, baseline, caso de contrato, allowlist, `.nullable()` no schema | Feitos os quatro primeiros. O `.nullable()` **ficou** por defesa: o custo é nulo e protege um `null` futuro |
| 5 | BAIXO | Mês com `n = 1` expõe o valor de um registro | Informativo: sai sem conta, id nem pessoa |

### `revisor` (código, antes dos gates de fechamento): 0 CRÍTICO · 1 ALTO · 3 MÉDIO · 4 BAIXO

| Sev. | Achado | Como foi endereçado |
|---|---|---|
| ALTO | Texto novo em `text-zinc-400` (~2,6:1) na nota do tooltip e no aviso de indisponível | **Corrigido**: `text-zinc-500` (~4,8:1) |
| MÉDIO | Parágrafo de excedente sem largura máxima; texto impreciso com entradas = 0 | **Corrigido**: `max-w-[240px] whitespace-normal`; com entradas 0, "sem entradas efetivadas no mês, não há parte em âmbar" |
| MÉDIO | `if (!ponto) return null` apagava a linha de entradas | **Corrigido**: busca o ponto em qualquer item do payload; sem ele, mostra a linha com o valor da série |
| MÉDIO | Comentários citando `antecipado` (header do módulo, `COMMENT` da 0299, spec) | Header **corrigido**; `COMMENT` aplicado e spec **registrados** (§3) |
| BAIXO | Contraste âmbar × verde < 3:1 | Registrado para o Yan (§7.3) |
| BAIXO | Página de design system sem `fluxoColors.antecipacao` | **Corrigido** |
| BAIXO | Nome da RPC passa pelo `rpc` local frouxo da página | Aceito: é o padrão pré-existente da página, e o contrato pega o nome real |
| BAIXO | Falta teste de entrada efetivada negativa | **Corrigido**: caso novo |

## 9. Aprendizado (régua de 5 destinos)

- **Retirar campo depois do texto escrito deixa comentário mentindo em três lugares**: o `COMMENT` da
  função, o header do módulo e a spec. O caso de contrato com **lista fechada de chaves** é o que trava o
  comportamento real. Destino: **(2) já coberto**, porque a skill `contrato-rpc-front` já pede caso vivo por
  schema, e a lista fechada é uma aplicação dele. Nada novo no core.
- Sem outro aprendizado transversal.

## Advisor

Piloto desde 24/09, em que só o `implementador` consulta e o orquestrador consulta a pedido do Yan.

| Agente | Consultas | Mudou o rumo? |
|---|---|---|
| `implementador` (migration 0299) | 1 (antes de retornar) | Não; acrescentou o check do `ingestor` no guard |
| `implementador` (front: módulo, página, gráfico) | 1 (antes de retornar) | Não; pediu para destacar o raciocínio da promise fora do `allSettled` |
| `implementador` (casos de contrato) | 1 (antes de retornar) | Não; sugeriu conferir o enum `relacao` de `get_geral_antecipacoes`, e a conferência veio limpa |
| `revisor-db`, `revisor` | 0 | — |
| orquestrador | 0 | — |

O custo por agente fica como pendência do Yan, porque o `/usage` só o humano roda.
