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

**`revisor-db` — 0304 e patch dos CHECKs (M2):** aprovados. ALTO-1 (ensaio que executasse o SQL) — feito antes do parecer
chegar e repetido depois das correções. BAIXOs corrigidos antes de aplicar: B-1 (aviso quando uma linha com valor fica num
centro de % zero/vazio e é repartida entre os outros) e B-3 (`btrim` em Número/arquivo na chegada). B-4 (comentário) já
estava corrigido; B-5 (lock de `limpar_staging` herdado do molde 0295), B-6 (o "antes" do alarme de ano fechado fora da
RPC, sem risco para esta base por causa do replay) e B-7 (copiar o patch por movimentação de arquivo) registrados.

**`revisor` — app da M2:** aprovado com ressalvas. MÉDIOs corrigidos: outline negativo/com milhar coberto por teste
sintético; **sonda estática da lista fechada** (vista reprovar com mutante). BAIXOs corrigidos: aviso de linhas ignoradas,
mensagem do marcador de outline, teste de replay que afirmava o que o mock não prova, contagem da allowlist (28). Registrados:
grant das 4 RPCs × "só a promover" (§6.3) e skills (atualizadas neste fechamento).

**`revisor-db` — 0306 (M3):** aprovada com ressalvas, sem CRÍTICO/ALTO. Corrigidos antes de aplicar: M2 (só categoria
mapeada entra como candidato — senão uma categoria nova na bandeja quebraria Σ Resultado de caixa ≡ REX), M3 (desempate
total), B2 (caso anon 42501), B3 (NULL em comparação), B4 (Número nulo fora), B5 (ANALYZE das temp tables). M1 (cada ano
isolado) registrado como fronteira (§6.2). B6–B8 conferidos.

**`revisor` — revisão final (M1/M4, módulo `dre-centro`, testes):** dois ALTOs corrigidos antes dos gates finais:
1. **AV* do CSC no Consolidado** dividia o YTD de um ano fechado pela receita da empresa de 12 meses (janela errada no
   denominador; latente até jan/2027). Agora a página passa a receita bruta da empresa MÊS A MÊS e cada coluna soma a
   própria janela; teste novo com dois anos prova o número.
2. **Decisão 5 do GATE 1** (o "?" na coluna Total do Lado a lado) estava só em `title`, que não abre por teclado nem
   toque: agora `GatilhoAjuda` no Total e no AV*; a explicação da memória virou nota visível sob a tabela.

MÉDIOs corrigidos: ano com centro que falha deixa de sumir calado (o card mostra erro); a montagem roda sob `try/catch`
(exceção vira erro do card, não derruba a página); a nota da taxa pendente não mostra mais parênteses vazios e declara a
compensação. MÉDIO de testes: coberto o Consolidado com dois anos. BAIXOs corrigidos: "Realizado" deixou de ser botão
inerte; comentários e tipos sem uso do mockup removidos de `tipos.ts`. BAIXOs registrados (decisão de produto ou
cosmético): no Consolidado por centro as pills de ano parecem seleção mas só trocam o ano das notas; "Quem cobre quem" usa
o sinal "−" (padrão A) enquanto a DRE usa parênteses; "Sem centro" aparece em Usos sem poder tomar antecipação (identidade
preservada); o card marca "Nov · parcial"/"2026*" e a tabela da Empresa não marca mês parcial no caixa. Fora do escopo:
`current_date` do banco (UTC) × `hojeSP()` da página perto da virada do mês (mesmo padrão antigo de `get_dre_mensal`).

### 4.1 Ajustes pedidos pelo Yan no PR #311 (depois da revisão)

Decisões de produto do Yan ao ver o card, aplicadas no mesmo PR antes do merge:

1. **"Lado a lado" virou "Todos"**, com as duas visões (o id interno segue `lado`):
   - **Consolidado** (abre nele): um bloco por ano com os 5 centros e a AV de cada um — ano inteiro dos fechados, YTD de
     todos, Δ% por centro entre YTDs — e o "Total YTD" do ano de referência + AV presos à direita. Hoje (só 2026 coberto)
     é um bloco "YTD 26*"; o Δ% aparece sozinho em 2027.
   - **Mensal**: os meses empilhados — um bloco por mês (jan até o mês corrente, este "· parcial") com os 5 centros, só
     valor — e o Total + AV presos à direita. O bloco "Acumulado" saiu (o Consolidado cumpre o papel). Memória: no bloco
     do mês, a de soma é a do mês e a de saldo é a do fim do mês.
   - Testes provam Σ centros do mês ≡ REX do mês, Total ≡ REX do ano, Total do Consolidado ≡ Σ centros, Δ% e a ordem dos
     blocos com dois anos. No Exportar, a coluna leva o bloco ("Jan · Trips", "YTD 26* · AV CSC").
   - A frase "Sem Δ% contra 2025" do Consolidado passa a aparecer na abertura do card (ela já existia no Consolidado por
     centro).
   - Os centros seguem abrindo em Mensal (decisão 4 do GATE 1): a visão do Todos e a dos centros são estados separados.
1b. **Pill "Sem centro" retirada** do seletor; "Sem centro" segue como coluna do Todos (é onde fecha a soma com a
   Empresa) e o texto do "?" do seletor diz isso.
1c. **Seleção cumulativa** de Trips/Weddings/Corp/CSC. Cada clique marca ou desmarca uma; a última marcada não sai. Com
   as quatro marcadas, ou com um clique em "Todos", acende "Todos" e as quatro ficam em `color-mix(--brand 30%,
   --brand-soft)`. É um cinza um degrau mais escuro que o da seleção normal (`--brand-soft`), com a mesma borda e tinta
   (≈ 4,9:1 no tema neutro).
   - Um centro só: a visão dele (abre em Mensal).
   - Dois ou três: as visões do Todos, só com as colunas deles. O Total é a soma deles, e o "?" avisa que não fecha
     com a Empresa.
   - Todos: os cinco, com "Sem centro" e o "Quem cobre quem". O Quem cobre quem fica só no Todos, porque usos e
     fontes são da empresa inteira.
   - Decidido pelo Yan: com o Todos aceso, clicar num centro marca SÓ ele e desmarca os outros. Fora do Todos, o
     clique segue cumulativo, e marcar o quarto acende o Todos de novo.
2. **Notas sob a tabela retiradas** (cobertura, antecipações identificadas/não identificadas, taxa pendente, tomado e não
   devolvido, explicação da memória e a nota "* ano em curso"). O cálculo (`montar.ts → notas`) ficou, coberto por teste,
   mas **nada mais o mostra na tela**. Ficou só a frase "Sem Δ% contra «ano−1»" do Consolidado, que não estava no print.
   Efeitos: a explicação da memória segue só no `title` das linhas (não abre por teclado/toque); o "*" de "Total 2026*"
   fica explicado só no `title` da coluna; no Consolidado as pills de ano já não mudam nada visível (antes trocavam o ano
   das notas).
3. **Linhas de antecipação (C, D, taxa) no âmbar do previsto** da DRE de caixa — a MESMA régua (`fundoPrevisto`, exportado
   de `tabela-dre.tsx`; a tabela da Empresa não mudou, snapshot verde), a linha inteira, Conta inclusive. O Resultado de
   caixa fica na banda escura.
4. **Pills "Realizado" e "Realizado + Previsto" retiradas** (por centro é sempre realizado), com o "?" delas.
5. **"(=) RESULTADO OPERACIONAL DE CAIXA" e "(=) RESULTADO DE CAIXA" em caixa alta**, como os demais totalizadores (o
   texto das linhas de resultado da árvore já vem em maiúsculas do mapa vivo).

Gate desta rodada: dois testes que vão ao banco de produção falharam UMA vez e passaram na repetição. Foram a deriva
sintética do `schema-baseline` e o contrato de `get_marketing_gastos_resumo`, este com `57014 statement timeout`
(RPC de Marketing, não tocada nesta versão). É instabilidade do banco ao vivo, não regressão; fica registrada.

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
5. Pedir ao Financeiro o lançamento das taxas de antecipação pendentes no Monde. Com as notas fora da tela, o valor não
   aparece mais no card. No print do Yan de 09/11 eram R$ 23.098, nas antecipações de 09/04, 24/09, 09/10, 13/10 e 30/10.
   No mesmo print, a de 30/10 (Asaas, R$ 519,6 k) estava sem recebíveis identificados. Se isso continuar depois da carga
   do mesmo dia, essa antecipação fica fora do bloco C/D dos centros.
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
