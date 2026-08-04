# Out-Briefing v5.4.5 — Onda 0: fechar o furo do espelho do Monde

**Tipo:** PATCH (correção de defeito em produção) · **Migration:** `0232` aditiva **APLICADA** + `0233` **pendente de pós-merge** · **ADR:** `0164` · **Branch:** `fix/v5-4-5-reconciliacao-espelho` · **Base:** `main @ ec14750` (v5.4.3) · **Rota A**

---

## 1. O que era, em uma frase

A API do Monde filtra a listagem por **data da venda**, e a janela do incremental (`hoje−2d`) anda para frente sobre um eixo que a origem escreve para trás — então **venda registrada com atraso nunca entrava no espelho, e nunca mais entraria**. Como o espelho é a fonte de Metas e Performance desde a v5.1.4, isso era **faturamento a menos em produção**, crescendo todo dia.

## 2. O antes e o depois (medido, não estimado)

**Antes**, contra a API, venda a venda (04/08):

| | |
|---|---|
| vendas fora do espelho | **42** |
| faturamento ausente | **R$ 392.070,01** |
| receita ausente | R$ 47.806,35 |
| janela | 2025-07-30 → 2026-07-31, **38 em jul/2026** |
| registradas > 2 dias após a data da venda | **37 de 38** |
| atraso de registro | mediana **4 dias**, **máximo 32** (venda 73422: data 03/07, registrada 03/08) |
| excluídas legitimamente | **nenhuma** — todas com setor válido, item ativo, nenhuma Welcome |

**Depois** da reconciliação (run de verificação, 14:27):

| mês | vendas recuperadas | faturamento | receita |
|---|---|---|---|
| **jul/2026** | **38** | **R$ 383.600,25** | R$ 45.126,31 |
| jun/2026 | 1 | R$ 595,04 | R$ 5,17 |

jul/2026 no espelho: **713 → 751**. Auditoria: **62 → 24 ausentes** (os 24 restantes são exclusões por regra — ver §4).

**Idempotência provada:** 2ª passada sobre julho inseriu **0** de 775 lidas (729 ignoradas por `raw_hash`). Junho: 0 inseridas, 0 atualizadas.

> **Comunicação à diretoria:** o faturamento recente **SOBE**. É o número ficando certo, mesma família da virada da v5.1.4. **Julho/2026 é o mês mais afetado (+R$ 383,6 mil)** — se esse número já circulou, vale a nota de uma linha.

## 3. O que foi construído

1. **Incremental `hoje−2d` → `hoje−7d`** (o atraso mediano é 4). Caso comum, barato.
   **Custo do ciclo medido** (auto-auditoria da M2, exigida pelo briefing): janela
   `2026-07-28..2026-08-04`, **185 vendas em 1 página, 35 s** — **12% do `maxDuration` de 300 s** e
   **4% do intervalo de 15 min** do cron. Folga larga; a janela de 2 dias custava ~1/3 disso e as
   duas cabem sem aperto. O run ainda recuperou 2 vendas registradas depois da reconciliação — o
   mecanismo funcionando em condição normal, não de teste.
2. **`mode=reconciliacao`** — um mês por invocação, ciclando os 3 últimos por cursor, 3 disparos/dia. **Auto-curativo:** não depende de acertar o tamanho de janela nenhuma. Resumível (o cursor só avança em caso de sucesso).
3. **`mode=auditoria&from&to`** — só leitura, o detector: lista a API e responde quais vendas faltam. Teste de aceitação da versão. Compara contra a **API**, nunca contra o upload.
4. **Lock de ingestão** (`monde_ingest_claim`/`release`) em todo modo que toca a staging.
5. **Tripwire** exposto em `monde_ingest_status` + **cartão read-only "Sincronização Monde"** em `admin/uploads`.
6. **`ultima_sincronizacao` estreitada** para só o incremental.

Detalhe de cada decisão e do que foi rejeitado: **ADR-0164**.

## 4. Três achados que o briefing não previa

### 4.1 A race da staging compartilhada é PRÉ-EXISTENTE (e o lock não era opcional)

`monde_ingest_limpar_staging` dá `TRUNCATE` em `monde.venda_staging`/`venda_item_staging` — **compartilhadas** — no início de **toda** janela. Duas ingestões sobrepostas apagam as linhas uma da outra em pleno vôo: **perda silenciosa**. Já era possível hoje (ciclo > 15 min se sobrepõe ao tick seguinte); a reconciliação diária tornaria rotina. O briefing oferecia "lock **ou** horário fora do slot" — **horário não basta**, a reconciliação de um mês dura minutos.

### 4.2 A especificação do tripwire não fechava

Comparar contagem do espelho × `total` da API **acende todo mês, para sempre**: a API conta vendas que a transformação exclui por regra — em jul/2026, **8 Welcome + 12 sem setor + 9 sem item ativo, de 775**. Rodei a versão especificada uma vez e ela acendeu nos 12 meses. Alarme sempre aceso não é alarme.

Refeito como **subproduto da reconciliação** (que já baixa o detalhe de cada venda ⇒ sabe a contagem exata de espelháveis): **zero chamada extra**. Estado hoje:

| mês | api | lidas | espelháveis | espelho | sobrando | conta fecha | alarme |
|---|---|---|---|---|---|---|---|
| ago/2026 | 44 | 44 | 41 | 41 | 0 | ✓ | **apagado** |
| jul/2026 | 775 | 775 | 746 | 751 | **5** | ✓ | **ACESO** |
| jun/2026 | 670 | 670 | 632 | 637 | **5** | ✓ | **ACESO** |

Ago apagado com 3 exclusões por regra é a prova de que o alarme agora distingue exclusão de defeito.

### 4.3 Vendas que sobraram no espelho — REGISTRADO, NÃO CORRIGIDO

**5 em jul/2026 e 5 em jun/2026** continuam no espelho tendo **deixado de ser espelháveis** (perderam o último item ativo depois de ingeridas). O UPSERT nunca remove. É o que mantém o tripwire aceso hoje.

**Não corrigido de propósito:** remover linha é escrita destrutiva em dado e faria **faturamento de mês fechado cair**. Decisão sua, com o tamanho na mão. Se quiser corrigir, é uma versão pequena própria.

## 5. Divergências do briefing (registradas na abertura)

| # | Briefing | Realidade | O que foi feito |
|---|---|---|---|
| 1 | v5.4.3, base v5.4.2, branch `fix/v5-4-3-…` | v5.4.3 já em produção; v5.4.4 em paralelo | **v5.4.5** sobre `main @ ec14750`. Briefing preservado íntegro no commit `54c0baa` |
| 2 | ADR e migration "numerados na hora" | v5.4.4 já reivindicou **0230/0231** e **ADR-0163** | **0232 · ADR-0164**; quem aplicar em segundo usa `--fora-de-ordem` |
| 3 | "lock **ou** horário fora do slot" | horário não basta (§4.1) | lock obrigatório |
| 4 | tripwire "discreto" em `admin/uploads` | não havia cartão do Monde lá | superfície nova, read-only |
| 5 | — | `ultima_sincronizacao` mascararia incremental morto | estreitada |
| 6 | 12 chamadas `page_size=1` | funciona, mas a comparação não (§4.2) | tripwire virou subproduto |
| 7 | secrets no Vault | confirmado na 0182 | reusados |

## 6. Parecer da revisão

- **`revisor-db` — CORREÇÕES NECESSÁRIAS, corrigidas antes de aplicar.**
  - **CRÍTICO:** a 0232 agendava 3 crons para `mode=reconciliacao` que a rota ainda não implementava. Aplicada assim, os jobs rodariam, cairiam no ramo `incremental` default, responderiam **200** e apareceriam **verdes** em `cron.job_run_details` — justo o que o checkpoint manda conferir — sem reconciliar nada. Era **erro de ordem no plano**, não da migration. O agendamento saiu para a `0233`, pós-merge.
  - **ALTO:** `monde_ingest_release()` deletava o lock incondicionalmente; um `finally` que não checasse o retorno do `claim()` liberaria o lock de um processo vivo. Virou `release(p_dono)` com compare-and-delete.
  - **MÉDIO** endereçados: invariante do TTL documentado no corpo (`TTL > 2× maxDuration`); `timeout_milliseconds` da 0233 com folga (320s, não 300s exatos).
  - **BAIXO** registrado: depois desta versão, `backfill`/`window` manual não reseta mais o relógio do alarme de 45 min de `/metas` — leitura correta, mas confunde durante incidente.
- **`revisor` — APROVADO COM RESSALVAS** (0 CRÍTICO · 1 ALTO · 1 MÉDIO · 2 BAIXO).
  - **ALTO — CORRIGIDO.** `catch` silencioso ao reidratar o tripwire anterior (`route.ts`): se o
    JSON guardado estivesse corrompido, `anterior` virava `null` **sem log**, e
    `mesclarTripwire(null, …)` jogava fora a apuração dos outros 11 meses do painel — todos de
    volta a `nao_verificado`, sem rastro. O revisor chamou de irônico e tem razão: **um silêncio
    dentro do mecanismo que esta versão existe para acabar com silêncios**. Agora loga.
  - **MÉDIO — CORRIGIDO (e fecha pendência antiga).** Faltava caso de contrato para o schema
    novo. Adicionados dois em `rpc-contrato.test.ts`: `monde_ingest_status` (as 11 chaves +
    o invariante **acende ⟺ há motivo**, que é o que separa alarme de ruído) e
    `monde_vendas_ausentes` (detecta o que falta, não acusa o que existe, e o array vazio como
    contador puro). Isso **fecha a pendência de contrato de `monde_ingest_status`**, aberta no
    WORKING-CONTEXT desde a v5.1.8. **85 casos de contrato** passando contra o banco real.
  - **BAIXO — CORRIGIDO.** `itens_ativos` era buscado e nunca renderizado. Saiu do payload
    (dado morto é smell); comentário registra onde reentra se o cartão crescer.
  - **BAIXO — registrado, mantido.** Duplicação da paginação entre `auditoria.ts` e
    `ingest.ts`: deliberada e documentada no cabeçalho do módulo (auditar e ingerir querem
    coisas diferentes — a auditoria quer os `sale_number` **sem** `sale_id`, que a ingestão pula).
    Aceitável num hotfix; **candidato a unificar numa versão não urgente.**
  - **Fora do escopo, registrado para quem tocar a tela:** `formatarData()` em
    `admin/uploads/page.tsx:117` — usada pelos **5 cards de upload pré-existentes** — chama
    `toLocaleString('pt-BR')` **sem** `timeZone: 'America/Sao_Paulo'`, o bug que o DS §5.2
    documenta (hora errada perto da meia-noite em runtime não-SP). Não foi introduzido nem
    tocado por esta versão; o cartão novo usa `fmtDataHoraSP` corretamente. Mesmo caso dos
    ícones decorativos sem `aria-hidden` nos cards antigos.
  - Verificado **sem achado**: correção do lock (o "pulado" retorna antes do `try`; o `finally`
    nunca mascara o erro do corpo; `crypto.randomUUID()` já em uso noutra rota), resumibilidade
    do cursor, assinaturas RPC↔TS nos 4 call-sites, o cartão contra o DS e acessibilidade (selo
    por **cor + ícone + texto**, não color-only), guards de área em **todos** os modos, e
    nenhuma contradição entre os comentários longos e o comportamento real.
- **`verificador-visual`** — **NÃO EXECUTADO.** Sessão de background: o MCP Playwright não sobe
  (limitação registrada desde a v5.3.3) e a tela exige sessão. Fica como pendência sua — §8.2.

## 7. Gates

| gate | resultado |
|---|---|
| `npx tsc --noEmit` | limpo |
| `npm run lint` | limpo |
| `npm test` | **709 testes, 45 arquivos, ZERO skip** (era 682; +25 do módulo puro e +2 casos de contrato) |
| `npm run build` | OK |
| classificador do db-gate na 0232 | `aditiva`, zero motivos |
| backup-gate | **VERDE** — restore-test em 3 tabelas, count+checksum idênticos |
| verificação REST/service_role | **21 checagens**, executando o corpo das RPCs |

⚠️ A suíte injetou **14 vars do `.env.local`**. Contagem menor que 707 significa env ausente e **verde falso** (lição da v5.4.3, onde 112 casos de contrato se auto-skiparam em silêncio).

## 8. PENDÊNCIAS SUAS

### 8.1 Aplicar a `0233` DEPOIS do merge (obrigatório — sem ela não há varredura diária)

A reconciliação **existe mas não está agendada**. O cron chama a URL de produção (do Vault), então só faz sentido depois que o `route.ts` estiver no ar. Depois do merge, criar `supabase/migrations/0233_monde_reconciliacao_agendamento.sql` com o SQL abaixo e rodar `npm run db:migrate -- --aditiva` (acrescente `--fora-de-ordem` se a v5.4.4 tiver aplicado 0230/0231 antes):

```sql
-- 0233 — feat(v5.4.5): agendamento diário da reconciliação do espelho Monde.
-- ADITIVA. Só pode ser aplicada com o route.ts de `mode=reconciliacao` JÁ EM PRODUÇÃO.
-- Horário em UTC: 06:05/06:20/06:35 = 03:05/03:20/03:35 em São Paulo (fora de pico).
-- Minutos fora dos do incremental (*/15 dispara em :00/:15/:30/:45); o lock cobre o resto.
-- timeout 320s > maxDuration 300s da rota (folga, para não reportar falso timeout).
SELECT cron.unschedule('monde-reconciliacao-1') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='monde-reconciliacao-1');
SELECT cron.unschedule('monde-reconciliacao-2') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='monde-reconciliacao-2');
SELECT cron.unschedule('monde-reconciliacao-3') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='monde-reconciliacao-3');

SELECT cron.schedule('monde-reconciliacao-1', '5 6 * * *', $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='monde_app_url') || '/api/monde/ingest?mode=reconciliacao',
    headers := jsonb_build_object('Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='monde_cron_secret'),'Content-Type','application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 320000);
$cron$);

SELECT cron.schedule('monde-reconciliacao-2', '20 6 * * *', $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='monde_app_url') || '/api/monde/ingest?mode=reconciliacao',
    headers := jsonb_build_object('Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='monde_cron_secret'),'Content-Type','application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 320000);
$cron$);

SELECT cron.schedule('monde-reconciliacao-3', '35 6 * * *', $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='monde_app_url') || '/api/monde/ingest?mode=reconciliacao',
    headers := jsonb_build_object('Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='monde_cron_secret'),'Content-Type','application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 320000);
$cron$);

NOTIFY pgrst, 'reload schema';

/* DOWN: SELECT cron.unschedule('monde-reconciliacao-1'); (idem 2 e 3) */
```

**Conferir depois:** `SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'monde-reconciliacao%';` (3 linhas) e, no dia seguinte, `cron.job_run_details`.

### 8.2 Conferência visual do cartão novo

`/admin/uploads`, ao fim da lista: cartão "Sincronização Monde". Hoje ele deve estar **vermelho** ("Divergência") com `2026-07: 5 sobrando; 2026-06: 5 sobrando` — está **certo**, é o achado §4.3. Não consegui conferir sozinho (tela autenticada, MCP Playwright não sobe em background).

### 8.3 Decidir sobre as vendas "sobrando" (§4.3)

### 8.4 Coordenação com a v5.4.4

`CHANGELOG.md`, `src/data/changelog-diretoria.ts` e `package.json` **vão conflitar** — as duas versões escrevem no topo dos mesmos arquivos. Quem mergear em segundo resolve. Se a v5.4.4 mergear primeiro, o bump dela vai a 5.4.4 e este PR precisa rebasear o `package.json` para 5.4.5.

### 8.5 A hora do CHANGELOG_DIRETORIA

A entrada nasceu com **14:58** (hora de autoria). Reconciliar ao horário real do merge no `/pos-merge`.

## 9. Fronteira mantida

Fora desta versão, por decisão do briefing: gravar `operation_id` em coluna, corrigir `contrato`/`taxa_servico` pela regra do produto e depreciar o boolean homônimo `operacao_propria` (mexem na transformação e exigem backfill). O resto do Scope B segue em espera do pedido ao provedor — **receita por produto**. `get_prejuizos` fica como está; Pessoas segue no upload manual.

A base de evidência (`docs/investigacoes/2026-08-04-scope-b-item-level-e-pessoas.md`, 582 linhas) foi **commitada nesta versão** — vivia em uma única cópia untracked na raiz.
