# Out-briefing — v6.5.1 "DRE de caixa por centro de custo"

**Branch:** `feat/v6-5-1-dre-caixa-centro-custo` · **Briefing:** `docs/briefings/briefing-v6-5-1-dre-caixa-centro-custo.md` ·
**Medição (GATE 0):** `docs/auditoria/v6-5-1-m0-dre-centro-custo.md` · **Contrato da base:**
`docs/specs/v6-5-1-m2-base-centro-custo.md` · **ADR:** `docs/adr/0184-dre-caixa-por-centro-de-custo.md` ·
**Migrations:** 0304 (aditiva, 06/11), 0305 (destrutiva por classificação, Yan em TTY, 09/11), 0306 (aditiva, 09/11) —
todas APLICADAS. Banco na **0306**, livre **0307**. ADR livre **0185**.

**Classificação:** PATCH por decisão do Yan (D7). Pelo critério das v6.3.0 e v6.4.0 (base nova no contrato de ingestão +
migration destrutiva) seria MINOR — divergência registrada.

## 1. O pedido e as decisões

A DRE de caixa passa a poder ser lida por centro de custo (Trips, Weddings, Corp, CSC, Sem centro), com as antecipações
de recebíveis atribuídas a quem precisou do caixa. Decisões do Yan:

- **GATE 0 (06/11, D1–D7):** a árvore por centro vai até o REX, rotulado "(=) Resultado operacional de caixa"; patch
  destrutivo dos CHECKs aceito; de-para fixo de contas (Asaas → ASAAS, Blimboo → Blimboo); fixture negativa sintética;
  oráculo ajustado pela Movimentação de Caixa excluída da árvore; lista fechada de colunas; PATCH mantido.
- **GATE 1 (06/11):** DRE por centro num **card separado** abaixo da tabela da Empresa (que fica intocada), com o
  seletor só no card; AV do CSC sobre a receita bruta da empresa (`AV*`); "Quem cobre quem" no Lado a lado; centro abre
  na visão Mensal; coluna "Total" com "?"; carimbo "Caixa" mantido (+ "Centro de custo" e "Antecipações"); memória em
  faixa própria; Exportar já nesta versão. Escolha do agente: o card abre em Lado a lado.

## 2. O que foi feito, por missão

- **M0** — medição (Q1–Q7) e decisões. `cc0c8d35`, `c2131689`.
- **M1 (GATE 1)** — mockup na rota real com componentes de produção e fixture fictícia derivada da carga da Empresa
  (snapshot da `TabelaDre` gravado ANTES de qualquer mudança: `ef10d0da`); conferência da fixture contra o payload vivo
  achou e corrigiu `PAG_H` fora do perfil de operação. `95251f46`, `ed5fd3c3`, `a66c3a83`.
- **M2** — base `lancamentos-centro-custo` (sétima do contrato v1): parser com checksum pelo outline por centro, "+"
  rejeita, lista fechada (sonda estática), dimensão fechada de centros, rateio regenerado na promoção (Σ = 1 exato);
  card de upload; contrato; grants do `ingestor` (28 assinaturas). Migration 0304. `93ad3cdb`, `da9a7d8f`.
- **0305** — destrutiva dos CHECKs de base: pré-voo do agente (patch movido para `migrations/`, teste de paridade
  reapontado, classificação, única pendente, ensaio revertido); Yan aplicou em TTY em 09/11. `abfcceef`, `010609da`.
- **M3** — `get_dre_caixa_centro(p_ano, p_ajuste)` (0306): árvores por centro com a mesma fonte e mapa de
  `get_dre_mensal`; identificação dos recebíveis antecipados (regra pinada por engenharia reversa do protótipo); de-para
  `financeiro.antecipacao_conta_monde`; schema Zod; casos de contrato. `15eae216`.
- **M4** — o card lê a RPC real (fim da fixture na página); estados vazio/erro reais; carimbos da RPC. `08302b14`.
- **M5** — contratos: shape, paridade linha a linha, Resultado de caixa ≡ REX, anon e usuário sem área negados.
  `f2b48c2b`.
- **M6** — fechamento (este documento, ADR-0184, CHANGELOGs, bump 6.5.1, skills).

### Oráculos e provas (contra o banco, em transação revertida, com as fixtures de 06/11)

| Prova | Resultado |
|---|---|
| Rateio × base por categoria do mesmo dia ≡ "Rateio sem ajuste" do protótipo | **ao centavo** nos 4 centros (Trips 1.542.938,57 · Weddings 667.566,96 · Corp 1.325.290,80 · CSC −4.114.235,80) |
| Checksum falso (1 centavo a menos no CSC) | `CHECKSUM_FALHOU` nomeando o centro; base e rateio intactos (medido fora da transação) |
| Identificação das antecipações | **16/16 eventos e 3.186/3.186 recebíveis** iguais ao protótipo |
| Por centro (jan–nov): operacional, C, D, taxa, Resultado de caixa, cedidos | Weddings, Corp, CSC **ao centavo**; Trips −9.540,17 (ver §6) |
| Pesos mensais (Weddings/CSC) | idênticos (52,06/47,94 · 27,42/72,58 · 8,56/91,44 · 100% CSC nos demais) |
| Sem ajuste: Σ centros ≡ `get_dre_mensal` | linha a linha nas 159 linhas e 11 meses (caso de contrato permanente) |
| Com ajuste: Σ Resultado de caixa ≡ REX | mês a mês (caso de contrato permanente) |
| Remapear categoria no editor | as duas visões mudam juntas (inv. 2) |
| Tempo da leitura | 2,6 s no ensaio; 1,2–2,1 s por REST (teto 8 s) |
| Visão Empresa | intocada: call-site idêntico ao `main`; snapshot verde |

## 3. Gates

`npx tsc --noEmit` e `npm run lint` limpos; `npm run build` OK; `npm test`: **2.711 testes verdes**. Cinco arquivos de
oráculo de ingestão das bases antigas falham no carregamento por `ENOENT` — as fixtures deles não estão nesta worktree
(git-ignoradas; ambiente, anterior à versão).

## 4. Parecer da revisão

_(preenchido no fechamento — ver abaixo)_

## 5. Advisor

- **Orquestrador:** 2 consultas na M1 (escolha de arquitetura e conferência antes de declarar o GATE 1), **contra a Carta**
  (o orquestrador não consulta sem pedido do usuário) — a segunda mudou o rumo: mandou conferir a fixture contra o
  payload vivo, o que achou o `PAG_H` fora do perfil (o CSC nascia com receita bruta de −R$ 24,8 mi). A partir da M2 o
  orquestrador seguiu a Carta.
- **implementador (plumbing, M2):** 1 consulta, momento 3 — mudou o rumo (refez a verificação de switches na worktree e
  tirou nomes de tabela supostos).
- **implementador (parser, M2), explorador, revisores:** nenhuma.
- **Custo:** pendência do Yan (o `/usage` só o humano roda).

## 6. Ressalvas e fronteiras registradas

1. **Trips × oráculo: −9.540,17** = 2 linhas de Trips com movimentação em 23/11 (data futura) que a Empresa trata como
   previsto. A visão por centro usa o MESMO predicado da Empresa (inv. 2) — o protótipo as somou.
2. **Cada ano é identificado isoladamente** (revisor-db M1, fronteira de produto): antecipação de fim de dezembro com
   movimentação em janeiro, e o D de antecipação de 2026 que vence em 2027, não aparecem na visão de 2027. Só tem efeito a
   partir de jan/2027.
3. **Grant do `ingestor`:** as 4 RPCs da base (o briefing inv. 6 dizia "só a promover"); o pipeline precisa das quatro,
   precedente 0295.
4. **Header da 0304** diz "29 assinaturas" do `ingestor`; o medido é **28** (a sobrecarga zero-arg de
   `promover_carga_vendas` saiu na 0286). Corrigido em `rpcs-ingestor.ts`; a migration aplicada fica como registro.
5. **Taxa pendente** segue o protótipo: Σ (registro − Monde); as datas nomeadas são as antecipações sem taxa no Monde.
6. **Conferência visual não feita pelo agente** (a página exige login; o card só mostra números depois da 1ª carga).
7. **Fixture negativa** de grupo recolhido é sintética (D4) — a de 20/10 se perdeu.

## 7. 🔴 Pendências do Yan

1. Conferir o **preview do PR**: a tabela da Empresa igual à de produção; o card por centro mostrando "a base de centro de
   custo ainda não foi carregada".
2. **Mergear** o PR.
3. **1ª carga real** (checkpoint da M2): Admin › Ingestão › Upload › "Lançamentos por Centro de Custo", **no mesmo dia** da
   carga de Lançamentos por Categoria (movimentação), relatório com todos os grupos abertos.
4. Conferir um centro contra o protótipo, a soma dos centros contra a visão Empresa em dois meses e as antecipações de
   2026 contra o registro (briefing §10).
5. Pedir ao Financeiro o lançamento das taxas de antecipação pendentes no Monde (aparecem na nota sob a tabela).
6. **Mostrar à diretoria** e anotar o que ela pedir.

## 8. Arquivos

- **Banco:** `supabase/migrations/0304_centro_custo_base.sql`, `0305_centro_custo_checks_ingestao.sql`,
  `0306_dre_caixa_centro.sql`; `supabase/baseline/schema-v6.json`; `src/types/database.ts`.
- **Ingestão:** `src/lib/ingestao/parsers/lancamentos-centro-custo.ts` (+ teste), `oraculo-centro-custo.test.ts`,
  `lista-fechada-centro-custo.test.ts`, `bases.ts`, `rpcs-ingestor.ts`, `carga.ts`, `aplicar.ts`, `instrucoes-upload.ts`,
  `grafo.ts`, testes de carga/aplicar/paridade/alarme, `promover-carga-checksum.test.ts`; `src/app/admin/ingestao/upload/`;
  `src/components/admin/ingestao/modal-reprocesso.tsx`; `supabase/seed/seed.ts`; `scripts/ingestao/fixtures-manifest.json`;
  `docs/contratos/ingestao-v1.md`.
- **DRE por centro:** `src/lib/dre-centro/` (centros, tipos, atribuicao, visoes, montar, exportar, schemas, fixture só de
  teste, empresa-sintetica), `src/components/financeiro/dre/tabela-dre-centro.tsx`, `seletor-centro.tsx`,
  `quem-cobre-quem.tsx`, `tabela-dre.tsx` (só `export` + `tituloExportar`), `src/app/financeiro/dre/page.tsx`,
  `src/lib/dre/schemas.ts` (export do `dreLinhaSchema`), `src/lib/rpc-contrato.test.ts`.
- **Docs:** ADR-0184, este out-briefing, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, skills `ingestao-planilhas` e
  `banco-e-rpc`, `docs/WORKING-CONTEXT.md`.

## 9. Aprendizado (régua de 5 destinos)

- **Afirmação sobre o arquivo se mede antes de virar asserção** (a delegação disse "nenhuma data rejeitada"; eram 31) →
  skill `ingestao-planilhas` (bullet da base).
- **Ensaio de migration com o dado do oráculo carregado pelas próprias RPCs de carga, e regra de protótipo pinada por
  engenharia reversa ANTES do SQL** → skill `banco-e-rpc` §6. Não muda convenção de RBAC/timeout/coalesce: o checklist do
  `revisor-db` fica como está (D-12).
- **Fixture que imita o dado vivo tem de ser conferida CONTRA o payload vivo** (o `PAG_H` não estava no perfil) — já
  coberto pela regra geral de conferir contra produção; nada novo no core.
- **Pré-voo da destrutiva pelo agente, humano só roda o comando** — já é a prática registrada na memória do projeto; o
  bullet da base o cita.
