# Out-briefing — v6.4.0 · Financeiro · Geral (visão executiva)

**Rota A** · briefing `docs/briefings/briefing-v6-4-0-financeiro-geral.md` · contrato técnico
`docs/briefings/spec-v6-4-0-contratos.md` · validação e decisões `docs/briefings/plano-v6-4-0-validacao-briefing.md` ·
ADR-0183 · migrations **0295–0297 APLICADAS** em 15/10/2026 (gate VERDE) · **patch destrutivo pendente de TTY** ·
branch `feat/v6-4-0-financeiro-geral`.

## 1. Resumo

A diretoria ganha a página **Financeiro › Geral** (`/financeiro/geral`): uma faixa com 5 indicadores e 5 seções.

| Seção | Natureza | Fonte |
|---|---|---|
| Recebíveis e inadimplência | estoque | base nova de contas a receber |
| Antecipações | fluxo | registro novo no Janus |
| Perdas e prejuízos | fluxo | DRE de caixa |
| Custos financeiros | fluxo | DRE de caixa |
| Prazos médios | janela de 12 meses | Aberto + DRE de caixa |

Cada seção degrada sozinha e mostra a própria data.

Duas fontes novas:

- **Contas a receber**: upload manual do relatório do Monde, em N arquivos por faixa de vencimento. Cada
  arquivo é conferido pela própria linha de total, e cada carga grava uma foto da posição.
- **Registro de antecipações**: substitui a planilha. Fica sob o diário, com desfazer, e já carrega as 38
  linhas históricas (oráculo do inv. 7 ao centavo).

Dentro do que só a sessão podia fazer, a versão está **completa**. Duas coisas dependem do Yan antes de a base
de contas a receber funcionar ponta a ponta:

1. aplicar o patch dos CHECKs (§6);
2. fazer a primeira carga real pelo card.

## 2. Decisões

Antes da M0 rodou uma **M-1** (investigação da API v3, `docs/auditoria/v6-4-0-m-1-api-monde.md`).

- **API v3 para o Contas a receber:** viável, porque o `Conferido` bateu ao centavo com a amostra. O Yan
  decidiu manter o **upload manual** nesta versão.

**GATE 0** (`docs/auditoria/v6-4-0-m0-financeiro-geral.md`):

| Tema | Decisão |
|---|---|
| Custos | custos por grupo + câmbio/receitas fechando no FIN; Taxa do Cartão entra |
| Prejuízos | bruto, com a reversão e o líquido ao lado; série por mês, sem "por natureza" |
| Prazos | PMR = a receber de clientes ÷ entrada de clientes; PMP = repasse ÷ pagamento a fornecedor; saldo do Aberto |
| Acesso | `financeiro/geral` (Diretoria, Financeiro, Administrador) e `financeiro/geral/gestao` (Financeiro, Administrador) |

**GATE 1** (`docs/auditoria/v6-4-0-m1-export-contas-receber.md`):

| Tema | Decisão |
|---|---|
| Recorte | export só a receber, um arquivo por faixa de ano (limite de 30 mil linhas do Monde), 2024 + 2025–26 |
| Inadimplência | **só a marcação** `Conferido = Inadimplente`; faixas sobre os marcados |
| Valor | `Valor Final` |
| Nome | `Pessoa` só no top 10 da seção |
| A receber | todo crédito, inclusive comissão de fornecedor |
| Colunas | `Descrição` e `Operação Própria` **mantidas** na lista fechada (9 colunas) |

**Autonomia:** depois do GATE 1 o Yan pediu "siga de forma autônoma pelas fases, volte apenas ao final".

- O **GATE 2** (mockup) e os pareceres intermediários do `revisor-db` viraram registro (este documento), não parada.
- Ficaram mantidas as fronteiras: destrutiva só em TTY humano; merge e deploy humanos.

**Decisões técnicas e desvios** (todas registradas no código):

- **D3 — CHECKs de base.** Ampliá-los é destrutivo pelo classificador (`ALTER TABLE … DROP CONSTRAINT`).
  - O patch fica em `supabase/patches/contas_receber_checks_ingestao.sql`.
  - Os outros dois CHECKs (escopo de chave de API e expectativa do vigia) ficam em 5 bases, com exceção
    declarada no teste de paridade.
- **Foto de prazos:** gancho fail-soft no servidor depois de aplicar o Aberto. É a única mudança no caminho de
  outra base, uma exceção declarada ao inv. 9.
  - A série começa em 15/10 (dia da aplicação), não em 25/09.
  - Reconstruir desde 25/09 pelos crus do Storage = backlog.
- **Inv. 9, medido** (`git diff --name-status 4de6b60..HEAD`, arquivos pré-existentes modificados):
  - **Intocados:** `get_dre_mensal`, `dre_categoria_map`, editor da DRE e telas existentes. A 0297 só **lê**
    `fato_fluxo`/mapa.
  - **Fora da página, das bases e do card, e só como consequência da base nova:**
    - `src/lib/ingestao/carga.ts`: multiarquivo generalizado de `vendas-produto` para uma lista, mais o gancho
      da foto;
    - `alarme.ts`: isenção declarada;
    - `src/app/admin/api-externa/actions.ts` + `modal-criar-chave.tsx`: o escopo de chave de API passa a vir
      de `BASES_COM_ESCOPO_DE_CHAVE`, para não oferecer a base nova que o banco recusa;
    - `modal-reprocesso.tsx`: case novo, porque o `switch` sem default quebraria o `tsc`;
    - `supabase/seed/seed.ts`: `ORDEM_CARGA`, porque o grafo lançaria em runtime;
    - `src/app/financeiro/page.tsx`: redirect conhece a área nova;
    - nav e `areas.ts`.
  - Nenhum altera comportamento das 5 bases antigas: os testes de carga, paridade e oráculo delas seguem verdes.
- **Antecipação com `bigserial`, não IDENTITY.** O `reverter_diario` só reinsere colunas não-identity; com
  IDENTITY, desfazer uma exclusão duas vezes duplicaria o registro. O ensaio provou que o 2º desfazer é recusado.
- **Antecipação:** data futura recusada, piso 2000-01-01; mais de 2 casas recusado; lock por registro;
  `alterada=false` quando o salvar não muda nada.
- **Valor Final.** A regra nasceu "> 0" por um **erro meu na M1**: contei só os negativos e escrevi "todos
  positivos". O oráculo com o arquivo real pegou **611 títulos legítimos de valor zero** (216 em 2024, 395 em
  2025–26, faturas zeradas por compensação). A regra virou "negativo reprova" no parser, na 0295, no contrato e
  nos testes.
- **Emissão.** Além das 15 datas zero, a guarda de faixa (errata 1, piso 2015) anula 7 emissões de 2000–2006 e
  1 de 2014. São **23 nulas, com a linha preservada**; a M1 dizia 15.
- **Alarme "ano fechado alterado" isento para `contas-receber`:** a base é de posição e muda legitimamente
  (M3 do `revisor-db`).
- **Grants:**
  - `antecipacao_listar` e `antecipacao_historico` **não** foram concedidas ao `verificador`; os contratos as
    exercitam com identidade real.
  - As allowlists derivadas conferem: `verificador` +5 leituras, `ingestor` +4 de carga.
- **Rótulos das áreas:** "Geral" e "Geral (gestão)". O "Financeiro · Geral (gestão)" da pergunta virou
  "Geral (gestão)" dentro do grupo Financeiro.
- **UI** (escolhas do implementador, GATE 2 dispensado):
  - subaba "Geral" é a 1ª do Financeiro, com ícone Gauge;
  - destaque do tile de Prazos = a folga;
  - pills de 2024 até o ano corrente, com padrão nos últimos 3 anos;
  - série de prazos em tabela enquanto houver poucos pontos.

## 3. Arquivos

**Banco:**

- `supabase/migrations/0295_contas_receber_base.sql`;
- `0296_antecipacoes.sql`;
- `0297_financeiro_geral_leitura.sql`;
- `supabase/patches/contas_receber_checks_ingestao.sql` (**não aplicado**);
- `src/types/database.ts` (regenerado);
- `supabase/baseline/schema-v6.json` (última migration 0297).

**Ingestão:**

- `src/lib/ingestao/{bases,carga,aplicar,alarme,foto-prazos,instrucoes-upload,rpcs-ingestor,grafo}.ts`;
- `parsers/contas-receber.ts`;
- card em `src/app/admin/ingestao/upload/*`;
- `modal-reprocesso`, `modal-criar-chave`, `api-externa/actions`, `supabase/seed/seed.ts`;
- `docs/contratos/ingestao-v1.md` (base nova, mudança aditiva);
- `scripts/ingestao/fixtures-manifest.json` (2 fixtures: `contas-receber-cru-24.xlsx`, `-25-26.xlsx`).

**Página:**

- `src/app/financeiro/geral/{page,loading,actions}.ts(x)`;
- `src/components/financeiro/geral/*`;
- `src/lib/financeiro-geral/*` (módulos puros + schemas Zod);
- `src/lib/auth/areas.ts`, `src/components/layout/nav-model.ts`, `src/app/financeiro/page.tsx`.

**Testes:**

- parser, oráculo e carga do contas a receber;
- foto de prazos, alarme, paridade de bases;
- módulos puros da página;
- areas/nav;
- `src/lib/rpc-contrato.test.ts` (M7).

**Docs:**

- M-1, M0 e M1 em `docs/auditoria/`;
- plano, contrato técnico, ADR-0183, CHANGELOG, CHANGELOG_DIRETORIA;
- skills `ingestao-planilhas` e `banco-e-rpc` + checklist do `revisor-db`.

## 4. Gates e prova

- **Ensaio em transação revertida contra produção** (4 peças, inclusive o patch, num `BEGIN … ROLLBACK`):
  **27/27**.
  - Pipeline e checksum.
  - Validação: repetido, domínio, negativo, zero aceito, lote sem campo sem vazar conteúdo.
  - Replay, fotos e aviso de carga sem título em aberto.
  - 38 antecipações = inv. 7, e diário vazio após a carga.
  - Ciclo criar → editar → excluir → desfazer em cadeia.
  - Permissões: Diretoria lê e não escreve; papel sem a área é negado.
  - Grants de máquina e foto de prazos idempotente.
- **Aplicação** (`npm run db:migrate -- --aditiva`, 15/10 ~14h40): backup-gate VERDE (completude 81/81,
  restore-test 3/3); 0295–0297 aplicadas.
- **REST pós-push com service_role:** as 5 RPCs respondem 200; `anon` recebe 401/42501. O FIN 2025/2026
  confere com o ensaio: −532.869,33 / −174.988,29.
- **Paridade (inv. 1), provada no ensaio e nos contratos M7:** FIN, receita bruta, prejuízo/reversão (por
  `categoria_id`), entrada/pagamento de 12 meses ≡ `get_dre_mensal` mês a mês nos realizados de 2024, 2025 e 2026.
- **Oráculo do contas a receber com os 2 exports reais: 42/42.**
  - 10.354 + 28.603 títulos; totais 23.925.307,37 / 73.062.152,05; 0 números em comum.
  - 21 inadimplentes em aberto = **199.767,74**, idêntico à API.
- **Tempos** (`authenticated`, ensaio): custos ~1,1–1,5 s a frio e < 0,2 s a quente; as demais < 0,25 s.
  REST service_role: custos 2025 em 3,1 s a frio. O teto é 8 s.
- **Gates finais (15/10):** `npm run build` verde (rota `/financeiro/geral`) · `npx tsc --noEmit` 0 · `npm run
  lint` 0/0 · `npm test` **2.551 passaram + 6 pulados**.
  - 1 arquivo vermelho **pré-existente**: `oraculo-demonstrativo.test.ts` (fixture de 21/09 perdida, B-38;
    idêntico às versões anteriores).
  - **Depois das correções do `revisor`**, de novo e em série: build 0 · tsc 0 · lint 0/0 · `npm test`
    **2.559 passaram + 6 pulados**; o mesmo único vermelho pré-existente (B-38).
- Fixtures conferidas por hash: `node scripts/ingestao/fixtures.mjs --verificar` → 14 ok · 2 faltando (B-38) ·
  0 divergentes.

## 5. Não verificado pela sessão

- **Carga real da base de contas a receber ponta a ponta** (card → servidor → banco). Bloqueada pelo patch
  dos CHECKs: até ele ser aplicado, abrir carga falha fechado (CHECK 23514), com a base intacta.
  - Os casos de contrato de Recebíveis passam vazios (`carga: null`). Faixas, concentração, evolução e
    comparativo **não foram exercitados contra dado real**, só com dados sintéticos no ensaio.
- **Conferência visual.** Não houve credencial de teste humana, e o MCP do navegador não sobe em sessão de
  background. Fallback do briefing §9: **o Yan confere no preview** (roteiro em §6).
  - Pontos que o `revisor` pediu para olhar:
    - tiles com valores de 8 dígitos a ~1280 px;
    - balão do "?" nos estados de erro/vazio;
    - tabelas com 3 anos em tela estreita.
- **Escrita de antecipação por REST:** não foi feita de propósito, porque poluiria o diário, que é append-only.
  Provada só em transação revertida.
- **Comportamento do alarme de ano fechado com cargas reais consecutivas:** a base nova está isenta por desenho.

## 6. Pendências — o que só o Yan tem

> 🔴 **1. Aplicar o patch destrutivo dos CHECKs de base** — sem ele a carga de Contas a receber não abre.
>
> Copiar `supabase/patches/contas_receber_checks_ingestao.sql` para
> `supabase/migrations/0298_contas_receber_checks_ingestao.sql` (conferir antes que 0298 está livre).
> Repontar `SQL_PATCH` em `src/lib/ingestao/bases-paridade.test.ts` para o arquivo novo, no mesmo commit.
> Aplicar **fora do horário das RPAs** (`lock_timeout` 5 s):
>
> ```bash
> npm run db:migrate -- --destrutiva     # TTY: confirmar
> npm run db:baseline                      # e commitar o JSON
> ```
>
> Ordem segura: patch → merge. Se o merge vier antes, o card aparece e falha fechado (sem tocar a base).

**Demais pendências:**

2. **Primeira carga real** pelo card `/admin/ingestao/upload` → "Contas a receber": os 2 arquivos
   (`Contas a receber 24.xlsx` e `25-26.xlsx`) na mesma carga. Conferir:
   - 21 inadimplentes / R$ 199.767,74 na seção;
   - aviso de 23 emissões anuladas;
   - nenhum aviso de lacuna.
3. **Conferência no preview** (GATE 2 dispensado):
   - página com usuário Diretoria;
   - painel de antecipações com usuário Financeiro (registrar uma antecipação real e desfazê-la);
   - usuário só-Geral entra direto na página;
   - largura estreita;
   - Custos e Prejuízos contra a DRE de um mês;
   - inadimplentes contra o filtro `Conferido = Inadimplente` no Monde.
4. **Decisões de produto registradas, sem bloqueio:**
   - **(a) Retenção das fotos por título** (`financeiro.contas_receber_foto`): ~4,85 mil linhas por carga ⇒
     ~1,8 mi/ano com carga diária. Não tem leitor nesta versão; qualquer limpeza futura é DELETE destrutivo.
   - **(b) Desfazer ação de terceiro:** hoje basta a área de gestão (os moldes antigos exigiam
     `admin/acessos`).
   - **(c) Edição concorrente:** a gravação é last-write-wins, e o diário permite desfazer.
   - **(d) Gestão sem leitura:** quem tiver só `financeiro/geral/gestao` não vê a página.
   - **(e) Posição da subaba e destaque do tile de Prazos.**
   - **(f) "Geral" × TopSection "Visão Geral" da DRE.**
   - **(g) `Liquidação` ilegível:** é lida como em aberto, com aviso (risco do `revisor`, B).
5. **Avisar quem mantém a planilha "Histórico de Antecipações"** que ela se aposenta, e **mostrar à
   diretoria** e anotar o que ela pede.
6. **Custo do advisor:** `/usage` (só o Yan roda).

## 7. Parecer da revisão

### `revisor-db` (antes de aplicar): 0 CRÍTICO · 0 ALTO · 5 MÉDIO · 11 BAIXO

| Achado | Tratamento |
|---|---|
| M1 `verificador` com EXECUTE em `get_geral_recebiveis` (devolve nomes do top 10) | **Mantido.** Os casos M7 não ecoam nomes (só booleanos/contagens); registrado |
| M2 foto por título sem leitor e sem retenção | header corrigido (afirmava falsamente que a página a lia); volume medido; retenção → Yan (§6.4a) |
| M3 alarme de ano fechado com ruído | **corrigido** (isenção declarada + teste) |
| M4 desfazer de terceiro | produto → Yan (§6.4b) |
| M5 contratos/tipos pendentes | **feito** (M7, `database.ts`, baseline) |
| B1 comentário de fuso falso | **corrigido** (verificador/ingestor/authenticated têm `TimeZone=America/Sao_Paulo`, medido) |
| B2 NOT NULL vazaria a linha no DETAIL | **corrigido** (`LOTE_LINHA_INVALIDA` cita só posição e campo; provado em ensaio) |
| B3 guard da 0297 sem as tabelas | **corrigido** |
| B4 guard fraco do patch | **corrigido** (as 6 literais exatas) |
| B5 carga sem título em aberto | **corrigido** (aviso; provado) |
| B6 DOWNs sem aviso de perda | **corrigido** |
| B7 locks | registrado (patch fora do horário das RPAs) |
| B8 sequência patch/merge | §6.1 |
| B9 sem trava otimista | §6.4c |
| B10 grants à mão | derivador confere 25/25 |
| B11 custo do NOT EXISTS por linha | **corrigido** (DISTINCT por arquivo) |

### `revisor` (código, antes dos gates de fechamento): 0 CRÍTICO · 1 ALTO · 4 MÉDIO · 8 BAIXO

Verificados sem achado:

- guards de página e action;
- PII (top 10 só na página guardada; mensagens e testes sem nome);
- números: `deltaYtd`, polaridade, `*` vindo da RPC, inadimplência = só marcação, desconto nunca somado a custo;
- degradação por seção;
- coerção;
- React 19/Next 16, DS e gráficos;
- multiarquivo sem regressão nas 5 bases;
- gancho da foto e inv. 9 com a exceção declarada;
- schemas × retorno real e casos M7.

| Achado | Tratamento |
|---|---|
| **ALTO** — "Desfazer" com pill montada à mão (~20 px) e expandir grupo de Custos com ~16 px | **corrigido**: `PILL`+`PILL_NEUTRO` (~26 px); área de clique ≥ 24 px sem mudar a linha |
| MÉDIO — UI trava se a action lançar (sessão expirada/rede) | **corrigido**: try/catch/finally nos 3 pontos + helper `mensagemDeFalhaDaAcao` com teste; painel mostra erro em vez de "Carregando…" eterno |
| MÉDIO — balão do "?" cortado nos estados de erro/vazio | **corrigido**: `CascaEstado` com `min-h-[260px]` (conferir no preview) |
| MÉDIO — valor do tile estoura a ~1280 px | **corrigido**: `xl:grid-cols-3 2xl:grid-cols-5` + `truncate` com `title` (conferir no preview) |
| MÉDIO — padrão de formulário (Enter, foco no erro, spinner) | **registrado**: é o padrão de todo `ModalCentral` da casa; backlog |
| BAIXO — comentário falso em `recebiveis.ts` | corrigido |
| BAIXO — ajuda falava "v6.4" à diretoria | corrigido ("a partir da primeira carga desta base") |
| BAIXO — `Liquidação` ilegível vira "em aberto" | **registrado** como risco conhecido; há aviso na conferência e em `alarmes[]` (§6.4g) |
| BAIXO — casos de Recebíveis passam vazios sem carga | **declarado** em §5 |
| BAIXO — comentário contraditório do "antes" no card | corrigido (comportamento igual às outras bases) |
| BAIXO — `toNum` aceita "1e5"/"0x10" | corrigido (filtro de caracteres antes do `toNum` + testes) |
| BAIXO — `<th>` do painel sem `CARD_TABELA_TH` | registrado (aceitável no drawer) |
| BAIXO — gestão sem leitura = permissão morta | comentário no código + §6.4d |

## 8. Backlog gerado

- **Reconstruir a série de prazos desde 25/09** a partir dos crus do Aberto no Storage.
- **Retenção das fotos de contas a receber** (decisão do Yan).
- **Investigar a DRE de caixa × despesa paga com cartão.** A M-1 achou que o relatório de Movimentação omite o
  título pago com cartão e a fatura de cartão. Set/26 tem R$ 560 mil de repasse + R$ 61 mil de despesas de
  categoria nessa situação. Não foi medido contra a DRE.
- **Pessoas pela API v3** (versão própria, M-1). A carga atual de Pessoas é de 30/06.
- **Contas a receber pela API v3** (alternativa futura, M-1 §6).
- **Padrão de formulário da casa** (`revisor`, MÉDIO): Enter não envia, erro não foca, sem spinner. Vale para
  todo `ModalCentral`.
- **`promover-carga-checksum.test.ts` sem caso da base nova.**
- **A entrada de `rpc-contrato.test.ts` em `SOMENTE_LEITURA`** (sonda) descreve só catálogo/REST, mas desde a
  v6.3.0 também há identidade por claims.

## 9. Aprendizado (régua de 5 destinos)

- **"Sem negativos" não é "todos positivos".** Ao afirmar domínio de valor, conte `<0`, `=0` e `>0`
  separados. Foi o erro da M1 que o oráculo pegou. → skill `ingestao-planilhas` §8.
- **Tabela sob o diário com desfazer de exclusão usa `bigserial`, não IDENTITY.** → skill `banco-e-rpc` +
  checklist do `revisor-db` (D-12).
- **Ampliar CHECK existente é destrutivo:** desenho aditivo + patch em `supabase/patches/` + falha fechada até
  o TTY. → skill `banco-e-rpc` + `revisor-db`.
- **Erro de NOT NULL em staging vaza a linha no DETAIL:** validar no lote e citar só a posição. → skill
  `banco-e-rpc` + `revisor-db`.
- **A guarda de faixa de datas também anula emissão antiga legítima;** o oráculo conta separado. → skill
  `ingestao-planilhas`.
- **Alarme de "ano fechado" não serve para base de posição.** → skill `ingestao-planilhas`.

## Advisor

O piloto segue com o `implementador` consultando. O orquestrador consultou **1 vez**, a pedido do Yan, no
momento 3 da M-1.

| Agente | Consultas | Mudaram o rumo |
|---|---|---|
| Orquestrador | 1 (M-1, antes de fechar o relatório) | 1 — população × amostra, 3 contagens corrigidas, 6 colunas na matriz |
| implementador 0295 | 2 (m1, m3) | 2 |
| implementador 0296 | 2 (m1; m3 "overloaded") | 1 parcial (o conselho de manter IDENTITY foi **recusado** com evidência: duplicação no desfazer) |
| implementador 0297 | 2 (m1, m3) | 2 |
| implementador ingestão TS | 2 (m1, m3) | 2 |
| implementador front | 2 (m1, m3) | 2 (pegou 2 defeitos no m3) |
| implementador correções do revisor-db | 1 (m3) | 1 (3º comentário falso) |
| implementador M7 | 2 (m1, m3) | 1 + relato |
| revisor-db / revisor | 0 / 0 | — |
| implementador docs de fechamento | 1 (m3) | 0 (só acrescentou notas ao retorno) |
| implementador correções do revisor | 0 | — |

**Custo:** pendência do Yan (`/usage`).
