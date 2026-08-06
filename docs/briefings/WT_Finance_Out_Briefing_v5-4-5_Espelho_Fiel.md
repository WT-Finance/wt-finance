# Out-Briefing v5.4.5 — O espelho passa a espelhar

**Tipo:** PATCH (correção de defeito + mudança de princípio de desenho) · **Migration:** `0237` aditiva **APLICADA** · **ADR:** `0165` · **Branch:** `fix/v5-4-5-espelho-fiel` · **Base:** `main` @ `20ba80e` (v5.4.4) · **Rota A**

---

## 1. O que era, em uma frase

O espelho **retinha venda que a origem já não reconhecia**, com os valores congelados de antes do cancelamento — porque o filtro de negócio estava na **escrita**, e o schema queria ele na **leitura**.

## 2. O antes e o depois (medido, não estimado)

**Antes** — 12 meses, venda a venda contra a API (05/08):

| | |
|---|---|
| vendas retidas | **24**, em 8 dos 12 meses |
| faturamento inflado | **R$ 896.718,90** |
| receita inflada | **R$ 282.422,05** |
| pior mês | **jul/2026: 25,19% da receita** |
| concentração | a venda `73083` sozinha: R$ 331.980,20 / R$ 293.721,82 |
| crescimento | julho foi de **5 → 6** entre 04 e 05/08 |
| causa | **100% `sem_item_ativo`** — nenhuma Welcome, nenhuma mudança de setor |

**Depois** — aplicado e verificado:

| mês | faturamento | receita |
|---|---|---|
| **jul/2026** | −R$ 450.349,65 | **−R$ 295.801,06** |
| jun/2026 | −R$ 304.883,69 | −R$ 10.939,18 |
| mai/2026 | −R$ 30.497,39 | −R$ 3.158,54 |
| abr/2026 | −R$ 15.198,17 | −R$ 2.495,80 |
| mar/2026 | −R$ 62.971,08 | −R$ 7.646,13 |
| fev/2026 | −R$ 15.875,16 | **+R$ 1.708,32** |
| **dez/2025** | −R$ 40.000,00 | **+R$ 44.877,47** |
| nov/2025 | −R$ 5.678,94 | −R$ 602,33 |
| **TOTAL** | **−R$ 864.917,26** | **−R$ 267.370,33** |

> ⚠️ **NÃO é "tudo cai".** Em **dez/2025** e **fev/2026** a receita **SOBE** — a venda retida lá tinha receita negativa. A mensagem honesta é *"os números ficaram certos"*, não *"os números caíram"*.

> **ago/2026 subiu R$ 60.536,82** e isso **não é** desta versão: é o mês corrente, e a ingestão trouxe vendas novas durante o trabalho.

**Tripwire APAGADO.** `sem_item_ativo` foi a **zero**. As 24 tinham `raw_hash` divergente ⇒ o UPSERT regravou **sozinho**, **sem nenhum DML**.

## 3. A causa-raiz, e por que a correção é estrutural

`monde.venda_item` **tem** coluna `status`/`canceled_at` e a `mv_vendas_diarias` **já filtrava** `WHERE i.status='active'` desde a 0179 — mas a tabela tinha **47.182 itens, todos ativos**. **O filtro era código morto havia 6 versões**, porque o `transformSale` descartava o cancelado antes de gravar.

Consequência: o UPSERT só escreve sobre o universo que pediu, então venda que **saía** desse universo ficava invisível para a escrita — nem atualizável, nem removível.

Agora o espelho grava tudo e a mv filtra. Venda 100%-cancelada contribui zero **sozinha**. **A falha deixa de ser possível**, em vez de detectável e reparável.

## 4. Três decisões que divergiram do briefing (e por quê)

### 4.1 A materialized view NÃO foi tocada — era um risco sério

O briefing pedia alterá-la. Validando contra o repo: **mv não aceita `CREATE OR REPLACE`**; exigiria `DROP`+`CREATE`, que o classificador devolve como **`destrutiva`** (testado) e que eu **não conseguiria aplicar** (ADR-0131). Pior: `pg_depend` confirma que `mv_vendas_diarias_compat` **depende** dela — o `CASCADE` derrubaria **a fonte de Metas e Performance**.

E era desnecessário: o filtro que já existia resolve. A versão ficou **sem nenhuma mudança estrutural de banco**.

### 4.2 Sem a coluna `excluida_motivo`

O briefing previa gravar também `welcome`/`sem_setor` com um motivo. Não foi feito: essas são exclusões de **escopo**, estáveis (venda não deixa de ser Welcome), enquanto `sem_item_ativo` era de **estado** — e estado muda. Gravá-las exigiria filtrar venda na mv, isto é, a mudança destrutiva de §4.1.

**Resíduo declarado:** venda que **mude** para Welcome/sem-setor depois de espelhada ficaria retida. **Zero casos medidos.** Coberta pelo tripwire.

### 4.3 A M4 foi refeita para não escrever

O briefing mandava "provar em produção rodando `mode=window`" — mas o dev server aponta para o **mesmo banco**, então isso **escreveria** antes do checkpoint. Trocado por um dry-run que roda o `transformSale` antigo e o novo sobre o mesmo input, sem tocar em nada.

## 5. A prova de não-regressão

Rodando **antigo × novo sobre o mesmo input** de julho: **776 vendas idênticas, 0 mudam**. A versão **não altera cálculo nenhum** — o efeito é permitir que o UPSERT sobrescreva a linha velha. É a prova mais forte possível, e foi feita contra **dado real**, não fixture.

## 6. Parecer da revisão

- **`revisor-db` — APROVADA** (0 CRÍTICO / 0 ALTO). Confirmou por leitura que `vendas_que_contam` casa **exatamente** com o universo da mv, que a `EXISTS` é servida por `idx_monde_item_venda`, e que aplicar a migration antes do deploy é seguro **nas duas ordens** (o fallback da action cobre a ausência do campo). Dois BAIXO informativos, nenhum exigindo correção.
- **`revisor` — CORREÇÕES NECESSÁRIAS, todas feitas.**
  - **CRÍTICO:** o caso de contrato afirmava um invariante **global**, alcançável só via reprocesso do histórico — que o briefing manda **não fazer sem o "sim" do Yan**. O risco: alguém consertaria o gate vermelho rodando backfill e aplicaria a M6 sem autorização, derrubando mês fechado. **Corrigido** — o teste passou a usar o tripwire, por mês verificado.
    - Nota honesta: eu já havia trocado esse teste minutos antes, por **outro** motivo, e o erro era pior — a métrica estava **invertida**: `vendas − vendas_que_contam` dá **zero justamente quando o defeito existe**, porque a venda retida tem itens *ativos* no espelho. O teste passaria com o defeito e reprovaria depois da correção. As duas análises convergiram na mesma saída.
  - **MÉDIO — corrigido:** o docstring de `sobrando` descrevia a causa que esta versão **extinguiu**, o que levaria a diagnóstico errado quando o campo acender.
  - **BAIXO — corrigido:** os números divergiam entre artefatos (10/22/24), fruto de eu ter alargado a janela três vezes. Canônico: **24 vendas / 12 meses / R$ 896.718,90**.
  - **BAIXO — registrado:** a divergência do §4.2 acima; o revisor concordou ser julgamento técnico dentro da autonomia.
- **`verificador-visual` — NÃO EXECUTADO.** Sessão de background (MCP Playwright não sobe; tela autenticada). Pendência do Yan — §8.

## 7. Gates

| gate | resultado |
|---|---|
| `tsc --noEmit` | limpo |
| `lint` | limpo |
| `npm test` | **711 testes, 45 arquivos, ZERO skip** (era 709) |
| `build` | OK |
| classificador do db-gate na `0237` | `aditiva`, zero motivos |
| backup-gate | **VERDE** |
| caso de contrato | **visto REPROVANDO** (`2026-06: 5 · 2026-07: 6`) e **passando** depois |

## 8. PENDÊNCIAS SUAS

1. **Comunicar à diretoria** — e o enquadramento importa: *os números ficaram certos*, não *caíram*. Julho perde ~R$ 296 mil de receita; **dez/2025 e fev/2026 ganham**. A v5.4.4 fez julho subir e esta o faz cair: são duas correções em sentidos opostos no mesmo mês, ambas aproximando da verdade.
2. **Conferência visual** de `/admin/uploads` — o cartão agora mostra **"Vendas que contam"** e a linha **"+193 canceladas no espelho"**. O tripwire deve estar **verde** (Conferido).
3. **Mergear o PR.**
4. **Enviar a pauta ao provedor do Monde** (§8 do briefing de entrada) — segue pendente, e o item 8.1 (filtro por data de alteração) é o que dispensaria a varredura diária.

## 9. Fronteira mantida

O resto do Scope B segue em espera do pedido de **receita por produto**. `get_prejuizos` fica como está. Pessoas segue no upload manual. **Alargar a janela de reconciliação além de 3 meses** não foi feito: mês fora dela exige `mode=window` manual (foi como os 6 meses antigos foram corrigidos aqui).
