# Out-briefing — v6.5.0 "Financeiro · Geral, segunda versão"

**MINOR · Rota A.** Branch `feat/v6-5-0-financeiro-geral-v2`. Briefing `docs/briefings/briefing-v6-5-0-financeiro-geral-v2.md`;
medição `docs/auditoria/v6-5-0-m0-financeiro-geral-v2.md`. Migration **0301 APLICADA** em 26/10 (aditiva). Destrutiva
`supabase/patches/financeiro-geral-v2-poda-destrutiva.sql` (vira a **0302**) **pendente**: aplicação humana em TTY, só
DEPOIS do merge e do deploy. Sem ADR novo; **Emenda 1 do ADR-0183**. Banco na **0301**, livre **0302** (reservada).

---

## 1. O pedido e as decisões

A página `/financeiro/geral` passa a ter cinco TopSections, nesta ordem: **Vendas** (casca) · **Recebíveis e
inadimplência** · **Perdas e prejuízos** · **Antecipações** · **Cartões de crédito** (casca). Decisões firmes do briefing
§1, mais as tomadas no caminho:

| Quando | Decisão | Quem |
|---|---|---|
| Plan mode | O briefing dizia que Custos financeiros e Prazos médios "já saíram". **Era falso**: seções, RPCs, foto de prazos na ingestão e a série estavam vivas. **Remover tudo, inclusive a série.** | Yan |
| GATE 0 | Prejuízo por pessoa = **uma tabela** somando os anos selecionados. | Yan |
| GATE 0 | Nomes de pessoa **podem** aparecer (top 10 de inadimplentes, prejuízo por pessoa). | Yan |
| GATE 0 | "Maior intervalo do ano" = o maior intervalo que **termina** no ano, inclusive o que atravessa a virada e o **em curso** (última → hoje). Assim ele nunca é menor que os dias sem antecipação. | orquestrador (Yan delegou) |
| GATE 1 | Mockup aprovado sem ajustes (faixa de 3 tiles, textos, padrão de tabela simples). | Yan |
| M1 | **Sem RPC nova.** As 3 RPCs devolvem `json` e o Zod não é estrito: chave nova por `CREATE OR REPLACE` aditivo não quebra o front no ar; poda das chaves antigas na destrutiva, pós-deploy. Ajusta o plano (que previa RPCs novas). | orquestrador |
| M1 | Δ dos cards de recebíveis contra **a última foto ANTES da semana da posição** (pode ser de 2+ semanas atrás; a tela mostra "vs DD/MM"). | orquestrador |
| M1 | Leituras do **ano corrente** sempre carregadas (`DadosGeral.corrente`): faixa do topo e "Dias sem antecipação" não dependem das pills. | orquestrador |
| M1 | Faixa de atraso **"a vencer"** só quando houver inadimplente marcado antes do vencimento (inv. 3); hoje não há. | orquestrador |

## 2. O que foi feito

| Missão | Commit(s) | Conteúdo |
|---|---|---|
| M0 · GATE 0 | `04924745` | Medição Q1–Q7 com evidência, banco só leitura, sem nomes. |
| M1 · GATE 1 | `6f0a9922`, `8e6a8f2b` | Gráfico mensal por ano compartilhado (`shared/grafico-mensal-por-ano.tsx`; Marketing vira adaptador); contrato novo em `schemas.ts`; módulos puros com teste; cinco seções com componentes de produção sobre fixture; Custos/Prazos fora da página; `EmConstrucaoSecao`; `rpc-contrato` no contrato novo. |
| M2 | `6e18e884`, `1a5365f9` | **0301** aditiva (as 3 RPCs: `em_aberto`, `vencido`, `devedores`, `referencia_semana`, `evolucao_semanal`, `por_pessoa`; nova semântica de `maior_intervalo_ano`) + baseline. |
| M3 | `3f4a1739`, `ab889cc5`, `dc6b84ea` | Ingestão do Aberto sem foto de prazos (com caso de regressão); padrão de tabela simples no DS (`/admin/design-system`, skills, B-49); página lê as RPCs. |
| M4 | (no M1 + M2) | `rpc-contrato.test.ts` bloco Geral: shape, paridade com a DRE, completudes, funil, oráculo vivo das antecipações (piso), PII, permissões. 242/242 contra o banco após a 0301. |
| M5 · GATE 2 | (este fechamento) | Destrutiva escrita, ensaiada em transação revertida e revisada; **não aplicada**. |
| Revisão | `3988246d` | Correções do `revisor` (ver §4). |
| M6 | (este fechamento) | CHANGELOGs, bump 6.5.0, Emenda 1 do ADR-0183, errata do contrato de ingestão, skill `banco-e-rpc`, out-briefing, WORKING-CONTEXT. |

### A 0301 (aplicada)

- Ensaio em transação revertida contra produção (`ensaio-0301.mjs`): **101 verificações OK**. Toda chave antiga igual antes ×
  depois (exceto `maior_intervalo_ano`, de propósito); completudes e funil ao centavo; números da M0; maior intervalo igual a
  um cálculo SQL independente. Tempo depois da 0301: ≤ 85 ms por chamada com `statement_timeout = 8s`.
- `db:migrate -- --aditiva`: backup-gate **VERDE** (restore-test 3/3), aplicada.
- Pós-aplicação: `rpc-contrato.test.ts` **242/242** contra o banco; baseline regenerado (só os 3 `hash_corpo` e
  `ultima_migration`); `database.ts` regenerado = **idêntico** (assinaturas e retorno iguais).
- Com o dado de hoje o maior intervalo não muda: 2024 = 126 dias, 2025 = 59, 2026 = 117.

### A destrutiva (aplicação humana, em TTY)

`supabase/patches/financeiro-geral-v2-poda-destrutiva.sql` remove `get_geral_custos_financeiros`, `get_geral_prazos`,
`registrar_foto_prazos`, `financeiro.geral_prazo_calcular`, `financeiro.geral_prazo_foto` (a série), `financeiro.geral_fin_grupo`
e poda as chaves antigas de `get_geral_recebiveis` e `get_geral_prejuizos`. Ensaio em transação revertida (`ensaio-0302.mjs`):
**86 verificações OK**; `classificarSql` = **destrutiva**; depois do ROLLBACK os objetos continuam no banco. O roteiro passo a
passo está no header (pré-voo com deploy conferido e md5 dos corpos, export da série, `git mv` para 0302,
`db:migrate -- --destrutiva`, limpeza do teste + baseline + `database.ts` no mesmo commit). Export de 26/10 (3 linhas) em
`~/projects/arquivo-worktrees-janus/v6-5-0-gate2/geral_prazo_foto-2026-10-26.json`.

## 3. Gates

Rodados no fechamento, depois de todas as correções: `npm run build` ✅, `npx tsc --noEmit` ✅, `npm run lint` ✅ (zero
avisos), `npm test`: **2.643 passam**, 6 pulados, 1 arquivo vermelho. Por missão: `tsc` + lint a cada entrega; build + test
depois da M1, da M2/M3 e no fechamento. O único vermelho da suíte é o oráculo do Demonstrativo (fixture
`demonstrativo-cru.xlsx` perdida desde a v6.0.1, B-38, sem relação). As 12 outras fixtures de ingestão foram restauradas do
arquivo de resgate na worktree, com sha256 conferido contra o manifesto. Um timeout isolado de `get_operacoes_weddings`
(57014) apareceu uma vez numa rodada intermediária e não voltou.

## 4. Parecer da revisão

### `revisor-db` — 0301 (antes da aplicação): APROVADA COM RESSALVAS (0 CRÍTICO, 0 ALTO)

- **MÉDIO 1 — série semanal tirava o inadimplente do detalhe por título: detalhe podado viraria ZERO, não lacuna (inv. 4).**
  **Corrigido antes de aplicar:** o inadimplente de cada semana vem de `contas_receber_foto_carga` (imune a poda), e a semana
  cujo detalhe não tem mais todos os títulos em aberto que a foto contou SAI da série. Virou nota na skill `banco-e-rpc`.
- **MÉDIO 2 — sem medição de tempo.** Medido no ensaio sob `statement_timeout = 8s`: ≤ 85 ms.
- BAIXOs: ensaio revertido obrigatório (feito); diff semântico antes × depois (feito, é o ensaio); motivo do baseline (são os
  `hash_corpo` — conferido); duas regras de "mais recente" na mesma função (a poda da 0302 elimina); texto "semana anterior"
  corrigido para "última foto antes da semana"; base vazia devolve `evolucao_semanal: []` (igual à mensal, não regressão);
  exposição de `por_pessoa` (decidida pelo Yan no GATE 0).

### `revisor` — front, lib, testes, ingestão: CORREÇÕES NECESSÁRIAS → corrigidas (`3988246d`)

- **ALTO — `loading.tsx` desenhava a página antiga** (5 tiles, Custos, Prazos). Reescrito na silhueta nova.
- **MÉDIO — duas cores no mesmo `<td>`** ("(sem nome)", "demais N devedores"). A cor foi para um `<span>` interno, como nas outras tabelas.
- **MÉDIO — `*` no eixo da semana corrente ainda sem carga**, sem a nota. Agora só com semana parcial carregada.
- **MÉDIO — o tile truncava o valor** ("R$ 12.146.8…"). Agora quebra linha; tamanho e peso iguais. **Conferir no preview.**
- BAIXOs corrigidos: título do teste da ingestão ("será removida pela 0302"); numeração de invariantes em comentários (8→11,
  9→12); `escalaEixo`/`valoresDaSerie` mortos removidos.
- BAIXOs **registrados, não corrigidos** (não mudam comportamento): `CLASSE_ROTULO`/`PALAVRA` duplicados em
  `antecipacoes-card-custo.tsx`; container do tile repetido em 3 lugares; `apoioInad` montado em dois módulos; `fmtPontos` com
  `Intl.NumberFormat` local (não há helper central de p.p.); `carimboGeral` ignora `corrente.*` (impacto marginal); nomes
  fictícios 'Zeca/Ana/Bia' num teste de prejuízos; exports usados só por teste (`contasDosAnos`, `semBase`, `resumosDosAnos`).
- Confirmado pelo revisor: **Marketing pixel-idêntica** (JSX, classes, props, aria-labels, tooltips e mensagens iguais);
  invariantes 2, 3, 4 e 11; custo % só por `custoDoRecorte`; `page.tsx` com falha isolada; ingestão limpa; PII limpa.

### `revisor-db` — destrutiva 0302 (antes da aplicação): APROVADA COM RESSALVAS (0 CRÍTICO, 0 ALTO)

- **MÉDIO 1 — a poda parte de um retrato do corpo vivo.** Corrigido: o guard de pré-condição exige `md5(prosrc)` das duas
  funções igual ao retrato pós-0301 (falha fechada antes de qualquer DROP); os md5 também estão no pré-voo.
- **MÉDIO 2 — export da série.** Corrigido: nome com data e hora, arquivo temporário + `mv`, contagem conferida, backup-gate
  citado como segunda rede.
- **MÉDIO 3 — roteiro (e) dependia de texto fora do repo.** Corrigido: lista de lugares do teste (com nomes) no header.
- **MÉDIO 4 — "deploy feito" sem passo verificável.** Corrigido: pré-voo confere o deployment de produção e a página nova.
- BAIXOs corrigidos: consequência real de aplicar cedo (quebra a PÁGINA anterior; rollback do app exige voltar o banco antes);
  checagem de `cron.job`; DOWN completo (RLS/GRANT/COMMENT, lista do teste, 0301 como fonte segura); texto do local do arquivo.
  Aceitos: guard da sequence e chaves genéricas na checagem de presença.

### `verificador-visual`

**Não rodou**: o MCP do Playwright não conecta nesta sessão de background. O Yan conferiu o **mockup** no preview (GATE 1);
a página com **dado real** (M3 em diante) não foi vista por ninguém. Ver §6.

## 5. Advisor

| Agente | Consultas | Mudou o rumo |
|---|---|---|
| implementador A (gráfico compartilhado) | 1 (momento 1) | parcial: decomposição, reponteamento do teste estático |
| implementador B (módulos puros + fixture) | 2 (momentos 1 e 3) | sim, nas duas (Δ em p.p., `leituraDoAnoCorrente`, chave da semana normalizada) |
| implementador C1 (Recebíveis) | 1 (momento 3) | não (só declarar decisões) |
| implementador C2 (Prejuízos + Antecipações) | 2 (momentos 1 e 3) | sim no 1 (tile "Dias" sobrevive à falha das pills; cabeçalho padrão A) |
| implementador rpc-contrato | 2 (momentos 1 e 3) | sim, nas duas (loaders por RPC; casos separados) |
| implementador 0301 | 2 (momentos 1 e 3) | parcial no 1 (divergiu na ordem da série, com motivo) |
| implementador destrutiva | 1 (momento 3) | sim (retirou lógica nova da poda) |
| implementadores M3a, M3b, correções | 0 | — |
| revisor, revisor-db (×2), Explore | 0 | — |

**Total: 11 consultas, 8 mudaram o rumo (total ou parcial).** Nenhuma fora do protocolo. Orquestrador: 0 (regra da Carta).
🔴 **Custo:** pendência do Yan (`/usage`).

## 6. 🔴 Pendências do Yan

1. **Conferir no preview com dado real** (ninguém viu ainda): as cinco seções; Recebíveis na carga de 15/10 (4.830 em aberto /
   R$ 12,15 mi; 182 vencidos / R$ 1,03 mi; 21 inadimplentes / R$ 199.767,74; evolução com **um ponto**; sem Δ — não há foto
   anterior); o tile "Recebíveis em aberto" com o valor inteiro (quebra de linha, sem corte); **Marketing `/marketing/despesas`
   sem mudança visual**; `/admin/design-system` §7 (tabela simples).
2. **Roteiro do checkpoint final do briefing:** o prejuízo bruto de um mês contra a DRE; os inadimplentes contra o filtro
   `Conferido = Inadimplente` no Monde; o custo % de um ano contra a conta à mão no registro (2026: 41.968,28 ÷ 1.797.940,19 =
   2,33%); **mostrar à diretoria e anotar o que ela pede**.
3. **Mergear o PR** e, **depois do deploy**, aplicar a destrutiva **0302 em TTY** pelo roteiro do header do patch. Até lá a
   página funciona (as chaves antigas sobram na resposta, sem efeito). Rollback do app para a v6.4.x depois da 0302 exige
   voltar o banco antes.
4. **Retenção das fotos por título** (decisão pendente desde a v6.4.0): antes de ligar qualquer limpeza, persistir o agregado
   semanal de vencido (ADR-0183, Emenda 1).
5. Pendências herdadas que seguem (WORKING-CONTEXT): avisar quem mantém a planilha de antecipações que ela se aposenta;
   desfazer de terceiro/trava otimista na gestão de antecipações.

## 7. Arquivos

- **Banco:** `supabase/migrations/0301_financeiro_geral_v2_leitura.sql`; `supabase/patches/financeiro-geral-v2-poda-destrutiva.sql`;
  `supabase/baseline/schema-v6.json`.
- **Página:** `src/app/financeiro/geral/{page,loading}.tsx`; `src/components/financeiro/geral/` (geral-content, cabecalho-geral,
  comum, faixa-indicadores, filtro-anos, secao-recebiveis, recebiveis-evolucao, secao-prejuizos, prejuizos-tabela-pessoa,
  secao-antecipacoes, antecipacoes-card-custo, antecipacoes-volume-conta, antecipacoes-comparativo-conta; saíram
  grafico-mensal, secao-custos, secao-prazos).
- **Compartilhados:** `src/components/shared/{grafico-mensal-por-ano,cabecalho-card,em-construcao-secao}.tsx`; Marketing:
  `src/components/marketing/gastos/{serie-mensal,cabecalho-card}.tsx`; `src/lib/marketing/escala.ts`.
- **Lib:** `src/lib/financeiro-geral/` (schemas, tipos, recebiveis, prejuizos, antecipacoes, faixa-topo, composicao, carimbos,
  numeros, periodo, fixture + testes; saíram custos, prazos).
- **Ingestão:** `src/lib/ingestao/{carga,grafo}.ts`, `carga-contas-receber.test.ts` (saíram foto-prazos.ts/.test.ts).
- **Contrato:** `src/lib/rpc-contrato.test.ts`.
- **DS:** `src/app/admin/design-system/{page,tabela-simples-showcase}.tsx`.
- **Docs/skills:** `docs/adr/0183-indicadores-gerais-financeiro.md` (Emenda 1), `docs/contratos/ingestao-v1.md` (errata),
  `docs/backlog-v6.md` (B-49), `.claude/skills/{banco-e-rpc,tabela-densa,ui-design-system}/SKILL.md`, `CHANGELOG.md`,
  `src/data/changelog-diretoria.ts`, `package.json`, `docs/WORKING-CONTEXT.md`, este out-briefing.

## 8. Aprendizado (régua de 5 destinos)

1. **"Já removido" no briefing se confere no catálogo vivo** (`pg_proc` + grep de chamadores, inclusive a ingestão). O briefing
   afirmou que as RPCs de Custos/Prazos tinham caído; estavam vivas e uma era chamada a cada carga. → **já coberto** pela regra
   "validar o escopo contra o repo em toda rota" do `/nova-versao`; não pede texto novo, pede o hábito (o plan mode pegou).
2. **RPC `json` + Zod não estrito: chave nova é aditiva; tirar chave é destrutiva pós-deploy.** → **skill `banco-e-rpc`**
   (seção nova).
3. **Série derivada de foto por carga: lacuna quando o detalhe some, nunca zero.** → **skill `banco-e-rpc`** (seção nova);
   achado do `revisor-db` vira regra.
4. **Padrão de tabela simples (A) confirmado; Marketing/DRE como exceção conhecida.** → **skills `tabela-densa` e
   `ui-design-system`** + `/admin/design-system` + B-49.
5. **Stage do índice vaza para o commit seguinte**: o `git rm` de arquivos feito no meio da missão entrou no commit do gráfico
   (refeito antes do push). → já coberto pelo hook `protecao-git-add` para `git add -A`; o caso do `git rm` antecipado é
   situacional (commitar com paths explícitos e conferir `git show --stat` antes do push). Não pede regra nova.
6. **Fixtures de ingestão não vêm para worktree nova** (5 oráculos vermelhos até restaurar do arquivo de resgate). → **já
   coberto** pela memória "worktree nova não herda estado não-versionado"; o `/nova-versao` §3 poderia incluir a cópia das
   fixtures — **proposta para o Yan**, não aplicada (ritual).
