# Out-briefing — v6.0.0 · Fundação da ingestão: contrato, atomicidade, log e credencial de máquina

**Tipo:** MAJOR (Rota A) · **Branch:** `feat/v6-0-0-fundacao-ingestao` ·
**Briefing:** `docs/briefings/briefing-v6-0-0-fundacao-ingestao.md` ·
**Plano de validação briefing×repo:** `/home/yan-wt/.claude/plans/flickering-popping-hammock.md` (11
divergências na abertura, D1–D11; mais D12 achada em voo) ·
**Contrato congelado (GATE 0):** `docs/contratos/ingestao-v1.md`, com as erratas 1–3 ·
**Migrations aplicadas:** `0273`–`0285` (13, todas aditivas, todas sob o backup-gate) ·
**ADRs:** `0175` (existe) · `0176`–`0178` (em elaboração paralela neste mesmo fechamento) ·
**Arquivos tocados nesta versão:** 152 · **+41.552 / −840** linhas (medido contra a base da branch
antes do merge da `main`) · **Suíte na fronteira da M8 (25/09):** 1.657 testes, 99 arquivos, zero
falha, zero skip — a M9 aplicou mais duas migrations de correção (0284/0285) sem o número final
pós-M9 registrado em anexo; o fechamento roda os gates completos e atualiza esta contagem.

---

## 1. Resumo em linguagem clara

**Para quem usa as telas: nada muda por padrão.** Vendas, DRE, Fluxo de Caixa e Weddings mostram os
mesmos números de antes desta versão — foi provado, base por base, em snapshot antes/depois (§9) e
numa carga real completa (M9). As únicas mudanças visíveis são as que a versão declarou de propósito:
a coluna "Intermediário" volta a ser preenchida em Vendas, "Vendas em Aberto" deixa de estar
permanentemente vazia (a `situação` do título passa a ser gravada), o mês em curso da DRE por
competência ganha o sufixo "· parcial" onde a cobertura da última carga o justifica, e as telas que
leem base carregada ganham um carimbo de "Última atualização em DD/MM/AAAA HH:MM".

**Para quem carrega os dados: o caminho muda por completo.** Até aqui, cinco relatórios do Monde
eram baixados manualmente, tratados por scripts R fora do Janus e só então subidos pela tela. Agora
o Janus lê o **export cru** (o arquivo exatamente como o Monde entrega) e faz sozinho o que os
scripts R faziam: descobre colunas, trata datas e valores, calcula os checksums que o próprio
arquivo já traz (linhas de totais, subtotais, outline) e confere-os antes de aceitar qualquer coisa.
A carga é **atômica** — ou entra inteira, ou a base anterior permanece intocada; não existe mais uma
janela em que uma tela lê uma base vazia ou pela metade. Toda carga fica registrada (quem, quando,
quantas linhas, o que mudou) e alarmes por e-mail avisam quando algo foge do esperado (checksum que
não fecha, ano fechado que se altera, carga que não chega). Uma máquina agora pode fazer essa carga
sozinha, com uma credencial própria que **não pode apagar nada** — é a "credencial de aplicação"
(`ingestor`), separada da "credencial de verificação" (`verificador`) que a suíte de testes e os
scripts de medição passam a usar em vez da chave mestra. Nenhuma RPA (robô que baixa o relatório do
Monde sozinho) nasce nesta versão: o que nasce é o contrato (`docs/contratos/ingestao-v1.md`) que
essas RPAs, a partir da v6.1, vão honrar.

**O que fica para depois, por decisão explícita:** os scripts R e os caminhos antigos de carga
(`truncar_*`/`inserir_lote_*`) continuam no banco — eles só saem depois que o código que os chama
tiver deixado a produção de verdade, o que só acontece quando esta própria versão for mergeada e
implantada (§3). A extração automática (as RPAs), a base de Pessoas e a substituição de Vendas por
API seguem fora do escopo.

---

## 2. Missões M0–M9

| Missão | Conteúdo | Commit(s) principal(is) | Resultado |
|---|---|---|---|
| **M0** | GATE 0: contrato congelado; anexos crus/tratados localizados e trazidos; scripts R para `docs/legado/scripts-r/`; ímãs declarados | `2796295`, `889db93` | Contrato commitado antes de qualquer código. Fixtures reais gitignoradas com sha256 em `scripts/ingestao/fixtures-manifest.json` (decisão do Yan: crus de Vendas trazem CPF/CNPJ/e-mail — nunca versionados). |
| **M1** | Role `verificador` (briefing v5.11.0 inteiro, herdado) — allowlist derivada por assinatura, usuário de máquina, GATE 2 parte 1 | `82de428` (0273 aplicada) | 54 EXECUTE só leitura. `revisor-db`: **ALTO** acatado — a allowlist trazia RPCs de escrita (`dre_estrutura_salvar` etc.) em modo no-op; migradas para `reverter-diario.test.ts` em transação revertida. |
| **M2** | Role `ingestor` + `app.api_chave.escopo_bases` + runbook das duas alavancas | `c98ad14` (0274 aplicada) | 4 EXECUTE (pipeline de Vendas, único vivo então). `revisor-db`: MÉDIOs registrados (RBAC de área não é o gate; `maxDuration` × `statement_timeout=0` — endereçado na M4). |
| **(fronteira Fase 1)** | Credenciais de máquina por login + `custom_access_token_hook` (0275) — substitui o JWT HS256 fixo do briefing original, inviável no regime novo de chaves do Supabase (ADR-0175 §5) | `3fb9443` (0275 aplicada) | GATE 2 fica pronto para transcrição (§7). |
| **M3** | Parsers de servidor + oráculo cru↔tratado nas 5 bases (GATE 1) | `49c8c83`, `3cec38d`, `7968a9e`, `5b003f9`, `246dcbf` | GATE 1 verde nas cinco bases (§7). `revisor`: 1 ALTO e 6 MÉDIOS/BAIXOS corrigidos antes do fechamento da missão (detalhe de severidade não transcrito em anexo permanente — só no histórico do commit `5b003f9`). Auto-auditoria pegou 3 achados adicionais (`7968a9e`), incluindo o checksum do Demonstrativo somando valor já arredondado. Suíte: 1.348 testes, 83 arquivos, zero falha. |
| **M4** | Rota de ingestão + Storage (`ingestao-cru`) + card de `/admin/uploads` passa a subir o cru; `parseArquivoEmWorker` cai de 5 parsers para 1 (Pessoas); rota morta `upload-lancamentos` sai | `8d83fa7`, `029b0a5`, `b506e25`, `a05ea8f`, `8dc5285`, `8e25c26` | Migration **0276** aplicada. Dois revisores: **4 ALTO e 4 MÉDIO** corrigidos em `b506e25` (detalhe de severidade também só no histórico do commit). Card ao vivo com sessão real pegou dois números mentirosos no card (`8e25c26`) e um diff comparando grandezas diferentes (`8dc5285`). Suíte: 1.455 testes, 88 arquivos, zero falha. |
| **M5** | Carga atômica nas cinco bases: staging + `promover_carga_*` com checksum conferido **dentro** do banco; filtro Welcome antecipado da M7 (achado que mudou a ordem do briefing); `situação` de Vendas passa a ser gravada; credencial `ingestor` passa a aplicar de fato | `f35341b`, `7fb7097`, `132c5e4`, `977366c` | Migrations **0277/0278/0279** aplicadas. Três achados de auto-auditoria corrigidos antes de aplicar: `p_checksums=[]` promovia a base inteira sem checagem (porta dos fundos do invariante 5); `EXCEPTION WHEN OTHERS` amplo demais virou `WHEN insufficient_privilege`; staging exigia coluna que o caminho antigo de Operação não populava. Ensaio em transação revertida contra produção: checksum errado ⇒ `RAISE`; certo ⇒ aplica, base intacta. Suíte: 1.472 testes, 88 arquivos, zero falha. |
| **M6** | Log de execução, alarmes por incidente (não por disparo), cron `ingestao-vigia` (nasce inativo), tela `/admin/ingestao` | `6bc6e45`, `9715b7a` | Migrations **0280/0281** aplicadas. Revisão e provas pegaram, antes do commit: rótulos de alarme com hífen (código grava com sublinhado — nenhum alarme teria rótulo), incidente que nunca resolvia ao desligar expectativa, e-mail sempre dizia "checksum não fechou" mesmo para arquivo mal formado, texto de tolerância confundindo piso com fato, `concluirCarga` podendo lançar depois da promoção e regravar carga aplicada como erro, tela afirmando "(modo teste)" fixo. Provado ao vivo: vigia liga/desliga o `pg_cron` de verdade; carga com checksum falso gera linha + alarme + e-mail; expectativa sem execução abre incidente uma vez, não repete. Suíte: 1.560 testes, 93 arquivos, zero falha. |
| **M6b** | Retenção do cru: 3 meses para todo arquivo, 7 dias para o que nunca virou carga; rota + cron próprios (nasce inativo) | `a69365e`, `e4c8c40` | Migration **0282** aplicada. `revisor`: **ALTO** — GET com sessão apagava de verdade (CSRF por navegação de topo/robô de pré-visualização de link); corrigido: GET sempre simula, apagar exige POST. `revisor-db`: BAIXO (tela confundia rodada simulada com real). Registrado, não corrigido: corte de "3 meses" no calendário UTC; reprocesso copia dentro de `useEffect` (duplica em dev, não em produção); rota do vigia também aceita GET com sessão (efeito lá é abrir alarme, não apagar). Suíte: 1.595 testes, 94 arquivos, zero falha. |
| **M7** | Grafo de dependência (`409` na Operação sem Aberto do dia); Welcome estendido aos 6 leitores que a M5 não cobriu; mês parcial marcado; carimbo de carga nas telas | `329252d`, `36a0356`, `a67b66b` | Migration **0283** aplicada. Auto-auditoria pegou, antes da revisão, um desvio do próprio contrato (o grafo rodava antes de TODA a idempotência; corrigido para a idempotência valer primeiro, só a abertura fica depois do grafo). `revisor`: APROVADO, zero CRÍTICO/ALTO/MÉDIO, 2 BAIXO de registro. `revisor-db`: um achado de GRANT ausente se revelou falso positivo (conferido no catálogo vivo — a 0279 já concedia). 409 visto ao vivo contra produção. |
| **M8** | Baseline de schema versionado (JSON, não `.sql` — divergência D12) + teste de drift | `438f7d2`, `e1154c6` | Sem migration. `revisor`: APROVADO COM RESSALVAS, zero CRÍTICO/ALTO — 4 MÉDIO + 2 BAIXO, todos corrigidos ou registrados (tabela em §11). Suíte: **1.657 testes, 99 arquivos, 0 skip.** Fronteira da Fase 4. |
| **M9** | Deploy intermediário (preview da branch) + cinco cargas reais pelo card, conferidas contra a produção anterior | `e59b694`, `8530420`, `8ef2abe`, `4b2af21` | Migrations **0284/0285** aplicadas (as duas com `revisor-db` aprovando). Três defeitos achados pela carga real, todos com a base anterior intacta no momento da rejeição (§10). Resultado por base em §9. |

---

## 3. M10 (destrutiva / GATE 3) — ADIADA para a v6.0.1

O briefing planejava a M10 (DROP de `truncar_*`/`inserir_lote_*` migradas e da rota morta, TTY do
Yan) como parte deste fechamento. **Decisão do Yan em 25/09: adiar para a v6.0.1.**

O motivo é a própria condição que o briefing GATE 3 impõe: *"escrita depois que o código que
referenciava cada objeto saiu e foi **deployado**"*. Nesta worktree o código já trocou de caminho —
desde a M5, a aplicação de todas as cinco bases passa por `promover_carga_*` atômica com a credencial
`ingestor`, e nenhum caminho vivo no repositório chama mais `truncar_*`/`inserir_lote_*` das quatro
bases migradas. Mas **produção ainda roda a v5.12.0**, com o card antigo (`admin/uploads/actions.ts`
como estava antes desta versão), que **ainda chama** essas funções a cada upload manual. Rodar a
migration destrutiva agora apagaria funções que a produção viva ainda usa — exatamente o tipo de
acidente que o GATE 3 existe para impedir, e da mesma família do incidente de 10/09 que originou a
credencial `verificador`.

**O que a M10 vai conter, quando puder rodar (depois que esta v6.0.0 estiver mergeada e implantada):**
- `DROP FUNCTION` de `truncar_lancamentos`, `truncar_lancamentos_movimentacao`,
  `truncar_titulos_em_aberto`, `truncar_demonstrativo_competencia` e os `inserir_lote_*`
  correspondentes — cada um citando o commit que removeu a última referência viva e a prova (grep
  vazio + REST 404/negado), como manda o invariante 8. `audit.ingestao_log`, **se** se confirmar
  órfã na hora (o briefing já a lista como candidata — 10 linhas de seed, zero consumidor medido em
  setembro).
- A versão **antiga** de `promover_carga_vendas` (a de antes da assinatura `(jsonb, uuid)` — ver
  ADR-0126/D-9 da M5, "`CREATE OR REPLACE` não adiciona parâmetro"), que ficou órfã desde a M5.
- A rota morta e qualquer resíduo de `truncar_*`/`inserir_lote_*` que o grep confirmar sem consumidor.
  **`truncate_dynamic_tables` e `src/lib/carga/lancamentos.ts` NÃO entram sem antes migrar o
  `seed`** — a skill `ingestao-planilhas` §5 já registra que `npm run seed` chama as duas de verdade
  (precedente da v4.17.1: "órfão" pelo briefing com uso vivo no seed). Migrar o seed antes de poder
  remover é decisão do Yan.
- Backup-gate + restore-test, em TTY do Yan, como toda destrutiva.

**Pré-condição registrada para quando a M10 for retomada:** o backup-gate já cobre as 79 tabelas do
projeto (corrigido em 25/09, `e59b694`) — a lacuna que a M8 tinha achado (61/79) está fechada, então
essa pré-condição do GATE 3 já está satisfeita.

## 4. M11 — este fechamento

Esta missão: revisão de fechamento, gates completos, ADRs 0176–0178, este out-briefing,
`CHANGELOG.md` + `CHANGELOG_DIRETORIA`, version bump, `WORKING-CONTEXT.md`, PR. Não inclui a
destrutiva (§3).

---

## 5. Migrations aplicadas (0273–0285) — todas aditivas, todas sob o backup-gate

| Migration | O que faz (uma linha) |
|---|---|
| **0273** | Cria a role NOLOGIN `verificador` (concedida a `authenticator`), sem EXECUTE em nada por padrão, com allowlist por assinatura derivada da suíte; usuário de máquina `verificador@janus.interno`. |
| **0274** | Cria a role NOLOGIN `ingestor` (espelho da 0273) para a escrita da ingestão, allowlist = só o pipeline staging→validação→promoção; `app.api_chave` ganha `escopo_bases`. |
| **0275** | `public.custom_access_token_hook` — troca o claim `role` pelo papel do Postgres (`verificador`/`ingestor`) para usuário ativo com role RBAC de máquina; substitui o JWT HS256 fixo do briefing original (inviável no regime novo de chaves do Supabase). |
| **0276** | Schema `ingestao` com a tabela `ingestao.carga` (uma linha por execução da rota); bucket privado `ingestao-cru`; quatro RPCs `SECURITY DEFINER` service_role-only para abrir/concluir/obter a carga. |
| **0277** | `raw.vendas_excel.intermediario`; `raw.lancamentos_operacao` (a raw que faltava); view `analytics.vendas_excel_para_fato` (filtro Welcome) lida por `transform_raw_to_analytics`; `ingestao.promocao` (idempotência da promoção). |
| **0278** | Dezesseis RPCs novas: `limpar_staging_*` / `inserir_lote_staging_*` / `validar_carga_*` / `promover_carga_*` para `demonstrativo`, `movimentacao`, `aberto` e `operacao`, no molde de `promover_carga_vendas`. |
| **0279** | Separa `provisionar_dre_comp_par()` em núcleo (service_role-only) + wrapper (mantém o guard `financeiro/dre`); concede as 21 assinaturas que o derivador oficial produziu (as quatro bases novas × 4 RPCs + o pipeline de Vendas + o núcleo) — a credencial `ingestor` passa a de fato aplicar, em vez do `service_role`. |
| **0280** | `ingestao.execucao` (log de cron/processo), `ingestao.alarme` (incidente, não disparo), `ingestao.expectativa` (cadência configurável, nasce toda inativa); cron `ingestao-vigia` (nasce inativo); 10 RPCs. |
| **0281** | O painel de ingestão passa a mostrar QUEM fez cada carga (chave ou usuário). |
| **0282** | `ingestao.retencao` (log de limpeza do cru); cron `ingestao-retencao` diário (nasce inativo), 3 meses de retenção geral / 7 dias para arquivo que nunca virou carga. |
| **0283** | `CREATE OR REPLACE` (corpo idêntico ao vivo + a troca) nos 6 leitores de `raw.vendas_excel` que a M5 não tinha coberto, para todos passarem a ler `analytics.vendas_excel_para_fato` (Welcome fora). |
| **0284** | `validar_carga_staging()`: a guarda de setor passa a olhar só o que o transform lê (`IS DISTINCT FROM 'Welcome'`) — achado da 1ª carga real de Vendas, que a guarda antiga recusava por contar as 210 linhas Welcome contra `dim_setor`. |
| **0285** | `promover_carga_operacao(jsonb, uuid)`: `lancamento_numero`/`venda_numero` só viram `lancamento_n`/`venda_n` quando casam `^[0-9]+$` (antes: `NULLIF(x,'')::bigint`, que quebrava) — achado da 1ª carga real de Operação, cujo CSV traz o literal `"NA"` do R (não numérico) e parcelas tipo `"197848-2"`. |

## 6. ADRs

- **0175 — Separação entre credencial de verificação e de aplicação** (existe, aceito em
  21/09/2026). Registra o incidente de 10/09 que motivou as duas credenciais, a allowlist derivada
  por assinatura (não por volatilidade), e a mudança de emissão de token (login + Custom Access Token
  Hook, em vez do JWT HS256 fixo que o briefing original propunha e que o regime novo de chaves do
  Supabase recusa).
- **0176 — Contrato de ingestão servidor a servidor** (em elaboração paralela a este fechamento):
  documenta o fluxo em 3 passos (`upload-url` → `PUT` no Storage → carga), a autenticação por
  `x-api-key` com escopo por base, a idempotência, o `carga_id` viajando dentro do caminho do objeto
  em vez de nascer numa linha de banco, e a decisão de entregar o arquivo por URL assinada em vez de
  multipart (a Vercel recusa corpo acima de 4,5 MB; Movimentação cru tem 6 MB).
- **0177 — Checksum do arquivo como gate de carga + carga atômica**: documenta por que o checksum é
  conferido **duas vezes** (no servidor, contra o declarado; e dentro do banco, contra o que ficou
  gravado — cobre serialização/cast/arredondamento), a arquitetura staging→raw→fato dentro de uma
  única transação por base, e o filtro Welcome antecipado da M7 para a M5.
- **0178 — Baseline de schema versionado + fonte única de schemas do backup-gate**: documenta a
  divergência D12 (JSON de queries de catálogo em vez de `supabase db dump --schema-only`, que não
  roda nesta máquina — socket do Docker negado) e a correção do backup-gate para usar a mesma lista
  de schemas do baseline (61/79 → 79/79 tabelas cobertas).

Estes três últimos ADRs estavam sendo escritos por outra sessão no momento deste out-briefing; a
numeração (0176–0178) é a que o plano e os anexos das missões já reservaram — conferir contra
`docs/adr/` real no fechamento, como manda a skill `banco-e-rpc`.

---

## 7. Os GATEs 0–3, transcritos

### GATE 0 — contrato antes do código
Cumprido no commit `889db93` (M0), antes de qualquer parser ou rota. `docs/contratos/ingestao-v1.md`
recebeu três erratas ao longo da construção (todas decisões do Yan, todas registradas no próprio
documento): errata 1 (faixa de data ancorada no fim do ano, não no mesmo dia daqui a 5 anos — GATE
1/M3); errata 2 (campo `confirmar` para repor o gate humano de "antes→depois"; validade real da URL
assinada — M4/M5); errata 3 (reprocesso é carga nova, não replay do mesmo `path`; retenção do cru em
3 meses/7 dias; alarmes sem limiar de baseline — M6).

### GATE 1 — oráculo cru↔tratado por base

| Base | Linhas | Células comparadas | Checksums | Divergências |
|---|---|---|---|---|
| Demonstrativo | 3.334 | 26.672 | 557 (556 subtotais + Total Geral) | **zero** |
| Movimentação | 94.667 | 1.230.671 | 149 (15 grupos + 133 categorias + total) | 56 células de data (30 no ano 1900) |
| Aberto | 36.176 | — | 96 (15 + 80 + total) | 7 células de data |
| Vendas | 48.862 (tratado cobre 48.652) | 1.021.692 | 5 por arquivo × 3 | `Intermediário` (por construção) + 10 de data |
| Operação | 41.750 | — | cruzamento: 4.005 de 4.006 | 1 (lançamento 203048) |

Fechado em 22/09 (M3). Os cinco parsers vivem em `src/lib/ingestao/parsers/`, os oráculos em
`src/lib/ingestao/oraculo-*.test.ts`. Os scripts R que eles substituem seguem em
`docs/legado/scripts-r/` como referência histórica (invariante 10).

### GATE 2 — prova adversarial das duas credenciais

Transcrição completa em `docs/briefings/anexo-v6-0-0-gate2-transcricao.md`, medida em 22/09 com
`SUPABASE_VERIFICADOR_SENHA`/`SUPABASE_INGESTOR_SENHA` reais (1.275 casos, 79 arquivos, 0 pulados):

```
[verificador] truncar_lancamentos / truncar_lancamentos_movimentacao / truncar_titulos_em_aberto /
              truncar_demonstrativo_competencia / truncate_dynamic_tables / promover_carga_vendas /
              promover_carga_pessoas / limpar_staging_vendas / limpar_staging_pessoas:
              sem EXECUTE no catálogo E negada via REST (42501 → 403)
[verificador] admin_listar_areas / admin_acesso_solicitacoes_pendentes: área administrativa → 42501
[verificador] get_minhas_permissoes: usuário ativo com as 19 áreas de leitura, nenhuma administrativa
[ingestor]    truncar_* / truncate_dynamic_tables / promover_carga_pessoas: sem EXECUTE E negada
[ingestor]    o que ela PODE: o pipeline de Vendas tem EXECUTE (4 assinaturas, à época)
[ingestor]    validar_carga_staging (só lê a staging): executa via REST → 200
```

A camada que negou (medida): `42501 permission denied for function` — o GRANT, antes de
`app.exigir_acesso` rodar. A terceira alavanca do `ingestor` (chave `x-api-key` revogada ⇒ 401) foi
provada na rota, na M4. Sondas C1/C2 (`sonda-credencial`, `sonda-teste-escreve-banco`) vistas
reprovando por mutante em 21/09.

### GATE 3 — destrutiva
**Adiada para a v6.0.1** (§3). Não executada nesta versão; nenhuma migration destrutiva ficou
pendente em `supabase/migrations/`.

---

## 8. Invariantes do §6 do briefing, um a um

| # | Invariante | Status |
|---|---|---|
| 1 | Zero mudança de número em qualquer tela | **Cumprido, com exceções visíveis declaradas**: `Intermediário` passa a ser preenchido (decisão 7); `situação` de Vendas passa a ser gravada, e "Vendas em Aberto" deixa de estar vazia (decisão do Yan, 22/09); sufixo "· parcial" no mês corrente da DRE por competência (decisão 14 — o Yan decidiu, em 25/09, que o **caixa** fica só com `·REAL`/`·PREV`, sem o sufixo); carimbo de carga nas telas novas. Provado por snapshot antes/depois (M5, M7) e pela carga real da M9 (§9): tudo o que as telas leem bateu linha a linha, exceto essas exceções. |
| 2 | `app.exigir_acesso` não muda | **Cumprido.** ADR-0175 confirma; nenhuma migration desta versão toca a função. |
| 3 | Um parser por base, no servidor; grep de `parseArquivoEmWorker` vazio | **NÃO cumprido, por decisão registrada.** O grep não está vazio: `parse.worker.ts`/`parse-em-worker.ts` sobrevivem porque **Pessoas** (decisão 11 do briefing: "fica fora — parada, viva") continua parseando no cliente. O worker caiu de 5 parsers para 1. Fechar de verdade exige aposentar ou portar o card de Pessoas — decisão do Yan, registrada desde a M4. |
| 4 | Carga é atômica ou não é | **Cumprido** desde a M5 — staging→raw→fato dentro de uma transação por base, `pg_advisory_xact_lock`, ensaio em transação revertida provando `RAISE` + base intacta com checksum falso. |
| 5 | Checksum falho nunca aplica | **Cumprido.** Provado em ensaio (M5) e ao vivo pela rota real com sessão, duas vezes (M6: checksum adulterado ⇒ 422 `CHECKSUM_FALHOU`, zero linha em `ingestao.promocao`; arquivo não-planilha ⇒ 422 `FORMATO_INVALIDO`). A porta dos fundos achada em auto-auditoria (`p_checksums=[]` promovia a base inteira) foi fechada antes de aplicar. |
| 6 | Nenhum dado pessoal de Vendas em tabela; sonda estática reprova `cpf|cnpj|email` em `raw.vendas_excel` e no parser | **Cumprido, sonda localizada e lida.** `src/lib/ingestao/parsers/vendas-produto.ts` declara explicitamente (comentário + implementação) que `E-mail`/`CPF`/`CNPJ`/`Tipo Pessoa` do cru não entram nas colunas emitidas; `oraculo-vendas.test.ts:171` itera `['cpf','cnpj','email','e_mail','tipo_pessoa']` e reprova se qualquer um aparecer como chave emitida, mais uma checagem de que nenhuma célula do cru (CPF/CNPJ) sobrevive no valor. CPF/CNPJ/e-mail só existem no cru do bucket (retenção de 3 meses, M6b). |
| 7 | Segredos fora do versionado | **Cumprido.** `.env.example` só recebeu nomes novos (`SUPABASE_VERIFICADOR_SENHA`, `SUPABASE_INGESTOR_SENHA`, `EMAIL_TESTE_DESTINO`, `INGESTAO_ALARME_DESTINOS` etc.), sem valor. |
| 8 | Todo `DROP` na destrutiva cita o commit que removeu a última referência | **Pendente — fica para a M10/v6.0.1** (§3), por não poder ainda ser executada. |
| 9 | Suíte inteira roda com `SUPABASE_VERIFICADOR_KEY` (briefing), contagem igual ou maior, 0 skip | **Cumprido**, com o nome trocado por decisão do Yan em 21/09: o JWT fixo do briefing (`_KEY`) foi substituído por login + hook (0275, ADR-0175 §5) — a variável real é `SUPABASE_VERIFICADOR_SENHA`. Baseline da v5.11.0: 1.247. Progressão desta versão: 1.275 (GATE 2) → 1.348 (M3) → 1.455 (M4) → 1.472 (M5) → 1.560 (M6) → 1.595 (M6b) → 1.657 (M8), sempre 0 skip. |
| 10 | Scripts R permanecem até o oráculo TS da sua base ficar verde, out-briefing nomeia o teste | **Cumprido.** Scripts em `docs/legado/scripts-r/`; os testes que os substituem são `src/lib/ingestao/oraculo-demonstrativo.test.ts`, `oraculo-vendas.test.ts`, `oraculo-lancamentos.test.ts` (Movimentação e Aberto, parser único) e `oraculo-operacao.test.ts` — todos verdes desde a M3 (GATE 1, §7). |

---

## 9. Números antes/depois da M9 (as cinco cargas reais)

Executada em 25/09/2026 pela preview da branch, pelo Yan, com a sessão conferindo cada carga contra
produção. Todas as bases de produção tinham sido carregadas em 21/09 (14:13–14:16 UTC) pelo caminho
antigo, com os arquivos **tratados** pelo R; o Yan subiu os **crus** de 21/09 (o Demonstrativo é um
export mais novo — ver a ressalva na linha dele).

| Base | Carga | Checksums | Resultado contra a produção anterior |
|---|---|---|---|
| Vendas | aplicada 18:16 UTC (2ª tentativa válida) | 12/12 no servidor · 6 reconferidos no banco | `fato_venda` (29.458), `fato_venda_item` (48.652), dimensões e `dim_operacao_weddings` **iguais linha a linha**. No cru: +210 linhas Welcome (fora das telas), `situação` 411 Aberta/48.451 Fechada, `Intermediário` em 8.511 linhas, 10 `data_inicio_evento` < 2015 vazias pela regra da faixa. "Vendas em Aberto" muda por causa da `situação` (decisão de 22/09). |
| Movimentação | aplicada 18:30 | 149/149 (banco também) | DRE de caixa **idêntica ao centavo**, 2024–2026. 56 datas corrompidas na origem ficaram vazias, sem efeito em tela. |
| Aberto | aplicada 18:33 | 96/96 (banco também) | DRE de caixa idêntica. 5 títulos com vencimento 2049 (cartas de crédito/reembolsos) ficaram sem vencimento e saíram do `fato_fluxo` — lá já eram pós-corte e nenhuma tela os lia. |
| Operação | aplicada 19:04 (2ª tentativa) | cruzamento 1/1 | Fato com 41.745 linhas, 5.371 `lancamento_n` nulos, **mesmas somas** de número e valor. 79 lançamentos mudam de status (futuro→realizado) em 41 operações de Weddings — é o calendário; com "hoje = 21/09" o fato é idêntico exceto o lançamento 203048 (divergência conhecida). `dim_operacao_weddings` com o hash exato do ensaio; faturamento inalterado (R$ 48.411.737,07). |
| Demonstrativo | aplicada 19:07 | 557/557 (banco também) | Export **mais novo** que o de 21/09: soma R$ 516.605,00 contra R$ 508.964,10 (+7.640,90 em 42 células — 2025 +5.382,31, 2026 +2.258,59). **2024 idêntico.** Alarme `ano_fechado_alterado` de 2025 disparou, notificou (MODO TESTE) e resolveu — comportamento esperado. |

---

## 10. Divergências briefing×repo (D1–D12, mais as achadas em voo)

Do plano de abertura (`flickering-popping-hammock.md`):

| # | Divergência | Resolução |
|---|---|---|
| D1 | Anexos §9 deveriam estar em `tests/fixtures/ingestao/` | Localizados no lado Windows do Yan e trazidos na M0; gitignorados, com README + sha256. |
| D2 | Contrato §4 previa `multipart/form-data` direto | Movimentação cru (6,05 MB) e Operação (6,8 MB) excedem o limite de 4,5 MB da Vercel — o Yan decidiu, na abertura, mudar para **signed upload URL** direto no Storage; o contrato nasceu já assim (nunca chegou a valer o texto original). |
| D3 | Fixtures dos oráculos deveriam ir para o git | Vendas cru traz CPF/CNPJ/e-mail — gitignoradas por decisão do Yan, com script de cópia da fonte local. |
| D4 | Evidência do §2 em `docs/investigacao-v6-ingestao.md`/`-parte2.md` só existia numa branch não mergeada | Cherry-pick para esta branch na M0. |
| D5 | Briefing v5.11.0 dizia "próxima migration 0271/ADR 0174" | Stale; conferido no remoto no início: migration 0273, ADR 0175 (regra da skill `banco-e-rpc` — nunca confiar na numeração do briefing). |
| D6 | §2 dizia "ainda pendente: COALESCE da A1 no corpo vivo" | Já estava no corpo vivo (0267 aplicada) — nada a fazer. |
| D7 | A2 previa "chave com escopo por base" já pronta | `app.api_chave` não tinha coluna de escopo, e `robo_user_id` era FK a robô inativo — migration aditiva `escopo_bases text[]` + a RPC de promoção rodando com o JWT do usuário `ingestor` próprio, não com o robô da chave. |
| D8 | Roles novas herdariam a configuração do `authenticator` | `authenticator` tem `statement_timeout=8s` só porque um comando o setou explicitamente; `service_role` tem 0 pelo mesmo motivo. Sem `ALTER ROLE` próprio, `verificador`/`ingestor` herdariam o default do cluster. As duas roles novas ganharam `statement_timeout`/`TimeZone` explícitos (`verificador`=8s, o mesmo da UI; `ingestor`=0, carga pesada; ambas fuso `America/Sao_Paulo`). |
| D9 | Frente D previa "RPC recebe o lote e os checksums" direto | Movimentação tem 94.667 linhas — inviável numa chamada só. Quatro staging `UNLOGGED` novas + `inserir_lote_staging_*` **entram na allowlist do `ingestor`** (o briefing dizia "só promover"). Registrado no ADR. |
| D10 | Invariante 1 com Welcome só no transform | `regenerar_dim_operacao_weddings` e outros 5 leitores liam `raw.vendas_excel` direto — sem cobri-los, a carga de Vendas mudaria número em Weddings. Fechado na 0283 (M7), antecipado o filtro em si para a M5 (achado que mudou a ordem do briefing). |
| D11 | Incidente de 10/09 (306.261 linhas) ainda pendente de repovoamento | Conferido no catálogo em 21/09: as 10 tabelas já estavam repovoadas (só `titulos_em_aberto` −580, base substituída por carga mais nova) — WORKING-CONTEXT atualizado. |
| D12 | Briefing §5.H pedia `supabase db dump --schema-only` → `.sql` | Não roda nesta máquina (socket do Docker negado, sem `pg_dump` local); o baseline nasceu como **JSON** das mesmas queries de catálogo das sondas (M8). Registrado no ADR-0178. |

**Achadas durante a execução (não previstas no plano de abertura):**
- **M4** — `src/lib/carga/lancamentos.ts` **não saiu**, contra o previsto: `supabase/seed/seed.ts`
  ainda o chama de verdade (precedente da v4.17.1: "órfão" pelo briefing com uso vivo no seed).
- **M4** — `ingestao.carga` nasceu na M4, não na M6 como o briefing planejava: sem persistência não
  há como honrar `x-ingestao-idempotencia` (mesma chave ⇒ mesma resposta).
- **M5** — o filtro Welcome (planejado para a M7/Frente G) foi **antecipado para a M5**: aplicar uma
  carga de Vendas sem ele somaria 141 vendas e R$ 470.320,84 ao `fato_venda` sem erro nenhum.
- **M6** — os crons (Monde, CDI) **não gravam** em `ingestao.carga` como o briefing previa: o
  `CHECK` da tabela é fechado nas 5 bases de arquivo, as colunas são de arquivo (sha256, checksums),
  e a cadência é outra (96x/dia vs. 1x). Resolvido com uma tabela irmã, `ingestao.execucao`.
  Registrado como divergência técnica no ADR pendente (0176/0177).
  Contrato §7 dizia "reprocesso = repetir o passo 3 com os mesmos `path`s" — não funciona com a
  idempotência por `carga_id` embutido no caminho do objeto; virou **errata 3(a)**: carga nova com
  cópia dos arquivos.
- **M7** — a "lista de operações exposta por RPC de leitura para a RPA" (contrato §5) **não foi
  construída**: a RPA de Operação está fora da v6 ("só depois do id"); candidata a errata 4, v6.1.
- **M7** — o texto do carimbo ficou "Última atualização em DD/MM/AAAA HH:MM" (já existente), não
  "base carregada em DD/MM/AAAA" como o briefing sugeria — decisão do Yan de manter o padrão vigente.

---

## 11. Parecer da revisão

Consolidado por missão, a partir dos anexos (onde a severidade não está transcrita em anexo
permanente — só no histórico do commit — isso é dito explicitamente, em vez de reconstruída de
memória):

| Missão | CRÍTICO/ALTO encontrado | Tratamento |
|---|---|---|
| **M1 (0273)** | ALTO — a allowlist do `verificador` continha RPCs de **escrita** (`dre_estrutura_salvar`, `dre_comp_estrutura_salvar`, `dre_estrutura_desfazer_*`), mesmo em modo no-op: um JWT vazado teria poder de escrita estrutural | Acatado: as RPCs saíram do caminho REST; os casos passaram para `src/lib/dre/reverter-diario.test.ts`, em transação revertida com identidade JWT simulada — a prova ficou, o privilégio não (ADR-0175). |
| **M2 (0274)** | Sem CRÍTICO/ALTO. MÉDIOs: RBAC de área não é o gate real de segurança (é o GRANT); `maxDuration` da rota × `statement_timeout=0` do `ingestor` (dívida potencial) | Endereçado na M4 (a rota já nasce com os limites corretos). |
| **M3** | 1 ALTO e 6 MÉDIOS/BAIXOS (commit `5b003f9`) — detalhe de severidade não transcrito em anexo permanente | Todos corrigidos antes de fechar a missão; auto-auditoria pegou mais 3 achados (`7968a9e`), entre eles o checksum do Demonstrativo somando valor já arredondado (corrigido: soma em inteiros, arredonda uma vez). |
| **M4** | 4 ALTO e 4 MÉDIO (dois revisores, commit `b506e25`) — detalhe de severidade também só no histórico do commit | Todos corrigidos antes de fechar a missão. Cargas ao vivo com sessão real pegaram, à parte da revisão formal, dois números mentirosos no modal e um diff comparando grandezas diferentes — a mesma classe de erro em 3 lugares distintos (§ "Aprendizados"). |
| **M5** | Sem CRÍTICO/ALTO formal registrado em anexo; três achados de **auto-auditoria** corrigidos antes de aplicar (equivalentes em gravidade): `p_checksums=[]` promovia a base inteira sem checagem (furava o invariante 5); `EXCEPTION WHEN OTHERS` amplo demais (podia engolir bug real); staging exigindo coluna que Operação nunca preenchia | Todos corrigidos antes do `revisor-db` avaliar e antes de aplicar. `revisor-db` aprovou a migration como corrigida. |
| **M6** | Sem CRÍTICO/ALTO graduado no anexo; seis achados pré-commit de gravidade prática alta: rótulos de alarme trocados (hífen×sublinhado — nenhum alarme teria rótulo); incidente que nunca resolvia; e-mail com texto errado para toda rejeição; texto de tolerância confundindo piso com fato medido; `concluirCarga` podendo regravar carga aplicada como erro; tela afirmando "(modo teste)" fixo | Todos corrigidos antes do commit `9715b7a`. Prova ao vivo (§7). |
| **M6b** | **ALTO** — GET com sessão apagava de verdade (CSRF por navegação de topo ou robô de pré-visualização de link) | Corrigido: GET sempre simula; apagar exige POST. BAIXO do `revisor-db` (tela confundia simulação com rodada real) também corrigido. Quatro itens registrados, não corrigidos (§ M6b no quadro de missões). |
| **M7** | **Zero CRÍTICO/ALTO/MÉDIO** — 2 BAIXO de registro | `revisor-db` apontou uma suposta lacuna de GRANT que se revelou **falso positivo** (conferido no catálogo vivo — a 0279 já concedia; o revisor tinha lido só 0274/0278). Auto-auditoria, à parte da revisão formal, corrigiu um desvio do próprio contrato: o grafo rodava antes de toda a idempotência (deveria rodar só antes da abertura, que escreve). |
| **M8** | **Zero CRÍTICO/ALTO** — 4 MÉDIO + 2 BAIXO | MÉDIO: chave `migration` vs `ultima_migration` nos docs; `search_path` não fixado no gerador (`SET search_path TO pg_catalog`); ACL sem `ORDER BY` (dois grantors, corrida de escrita); roles de plataforma fora do retrato. Todos corrigidos. BAIXO: ativar o vigia por RPC muda o retrato sem migration (virou regra na skill); faltava caso offline de `null`×chave ausente (acrescentado). |
| **M9** | Sem revisão formal de missão (cargas reais, não código novo) — `revisor-db` aprovou as duas migrations de correção (0284, 0285) no ato | MÉDIO registrado, não corrigido: a guarda de **data** de `validar_carga_staging`/`promover_carga_vendas` ainda olha a staging inteira (não escopada ao predicado Welcome) — não dispara hoje (`fora_do_range: 0`), fica como dívida para migration futura. |

### Revisão de fechamento

(Parecer dos revisores de contexto limpo despachados no fechamento, 25/09, sobre o que ainda não
tinha passado por revisão — as mudanças da M9, o merge da `main`, a infraestrutura do backup-gate — e
uma varredura de consistência da versão inteira.)

**`revisor` — APROVADO COM RESSALVAS** (zero CRÍTICO/ALTO).
- MÉDIO — `src/lib/ingestao/rpcs-ingestor.ts`: o comentário de topo ainda dizia que o `ingestor` "não
  tem GRANT" e que `aplicar.ts` usava `service_role` — falso desde a 0279, justamente na parte de
  segurança da versão. **Corrigido** no fechamento.
- BAIXO — `src/lib/ingestao/log.ts`: a linha de carga é validada à mão, fora da convenção
  `parseRpc`/Zod (superfície interna service_role-only). **Registrado**, sem ação.
- Conferido sem achado: `vendasDistintasQueEntramNoFato` e `semNaDoR` fiéis ao SQL e com testes de
  borda e de controle; a v6 não contradiz a v5.12.0 (não toca `VERSAO_TRANSFORM` nem `raw_hash`);
  nenhum `console.log`/TODO novo; nenhum `service_role` no caminho de aplicação (só em metadado e
  infraestrutura, de propósito).

**`revisor-db` — APROVADO** (zero CRÍTICO/ALTO) — backup-gate com fonte única, `snapshot.mjs`,
migrations 0273–0285 (todo TRUNCATE/UPDATE/DELETE está dentro de corpo de função; nenhuma destrutiva
top-level; nada da destrutiva adiada estacionado em `supabase/migrations/` ou `supabase/patches/`).
- BAIXO — o runbook do backup-gate ainda citava a duração medida com 38 tabelas. **Corrigido** (nota de
  medição antiga; o gate cobre 79).
- BAIXO — o restore-test SPOT (`KEY_TABLES` de `verificar.mjs`) não inclui tabela dos schemas novos: a
  completude cobre as 79, a fidelidade delas só o `--full`. **Registrado** (acrescentar uma tabela por
  schema novo no próximo ajuste do gate).
- BAIXO — o import `db-gate → schema-baseline` é acoplamento, mas **fail-closed**: erro no módulo derruba
  o gate antes de tocar produção, e `npm test` importa o mesmo módulo. Aceito como preço da fonte única.

**Revisões por migration feitas durante a M9** (antes de cada aplicação): 0284 APROVADA COM RESSALVAS (o
MÉDIO — guarda de data de Vendas ainda cobra Welcome — está no backlog, B-32); 0285 APROVADA (a ressalva
sobre "NA" nas colunas de texto já estava medida: zero).

**Gates do fechamento** (25/09, depois do merge da `main`, `.next` limpo): `npm run build` verde,
`npx tsc --noEmit` limpo, `npm run lint` limpo, `npm test` **1.665 testes, 99 arquivos, zero falha**.
`database.ts` regenerado = diff vazio. Baseline de schema no estado da 0285, teste de drift verde.

**Conferência visual:** a UI da versão foi conferida ao vivo no Chrome durante a M7 (DRE com "SET ·
parcial" e "YTD 26 · parcial"; Fluxo de Caixa e Weddings sem selo, como esperado antes das cargas) e o
modal do card ao vivo, pelo Yan, nas cinco cargas da M9. Nada de UI mudou depois disso além do texto
do "depois" no modal de Vendas, visto pelo Yan na 2ª carga.

---

## 12. Pendências do Yan

**Antes de considerar a versão "no ar" de verdade:**
1. **Ativar vigia e crons** (`ingestao-vigia`, `ingestao-retencao`) só depois do **merge e deploy**
   — as rotas que eles chamam só existem em produção a partir daí. Antes de ligar a retenção:
   `POST /api/ingestao/retencao?simular=1` e conferir que a lista traz só os 2 objetos órfãos
   conhecidos de 24/09 (anexo M6b). Ordem: `ingestao_vigia_definir(true)` → depois cada expectativa
   de processo, só **depois** da 1ª execução registrada dele.
   **Depois de ativar: `npm run db:baseline` e commitar** (o baseline registra `active` do cron).
2. **`SUPABASE_INGESTOR_SENHA` no ambiente de Production da Vercel** — sem ela a carga real lança
   por desenho (fail-closed); a M9 rodou na **preview**, ainda não em produção.
3. **Recarregar a Operação na preview nova** (mesmo dia do Aberto) — a carga válida da M9 rodou
   antes do parser corrigido (0285) estar deployado; o fato está certo, mas `raw.lancamentos_operacao`
   ainda guarda o texto "NA" em 5.185/124 linhas.
4. **Cartas de crédito com vencimento 2049** (Aberto): parecem convenção de "sem prazo" do
   financeiro, não sujeira — mas a regra da faixa de data as trata como sujeira e as tira do
   `fato_fluxo`. Conversar com a gerente.
5. **Pipeline de Weddings órfão** (`/api/dashboard/weddings/pipeline`, sem tela): com `venda_n`
   agora preenchido, mostraria R$ 49,1 Mi contra R$ 48,4 Mi das outras telas — não reativar sem
   rever a regra antes.
6. **Avisos "1×86" do cruzamento de Operação**: o aviso do banco conta LINHAS (86, inclui as sem
   número) e o do servidor conta NÚMEROS distintos (1) — dois números para a mesma pergunta;
   alinhar.
7. ~~**Ensaio da M5 como teste permanente**~~ — **resolvido em 22/09** (commit `977366c`, "as quatro
   decisões do Yan"): virou `src/lib/ingestao/promover-carga-checksum.test.ts`, na lista fechada
   `ESCREVEM_E_REVERTEM_HOJE`. O WORKING-CONTEXT e dois anexos (M7, M9) ainda o davam como aberto — corrigido no
   fechamento. Segue aberta, à parte, a decisão do **ambiente de teste próprio** (gatilho da skill
   `banco-e-rpc` §6 tocado — agora são cinco arquivos que escrevem em transação revertida).
8. **Ambiente de teste próprio**: o gatilho da skill `banco-e-rpc` §6 foi tocado de novo — são
   4 arquivos que escrevem em produção (3 em transação revertida + a exceção commitada da API
   externa). Decisão aberta desde a v5.11.0, reforçada por esta versão.
9. **`PRIORIDADE_INICIAL`** (`src/lib/auth/areas.ts`): decidir se passa a incluir as áreas da
   Estante — pendência herdada da v5.11.0, ainda aberta.
10. **Pedido 8.2 ao fornecedor do Monde** (receita por produto) — é o gate da futura substituição do
    upload de Vendas por API (Scope B); ainda não enviado.
11. **Comunicações à liderança**: cadência diária de ingestão + reapresentação automática de
    histórico (lançamento retroativo no Monde altera anos "fechados" sozinho agora) — juntar às duas
    comunicações já pendentes de versões anteriores (critério da DRE de 19/08, tripwire da v5.4.5).
12. **`<select id="id">` da página de operações**: olhar e anotar se o valor é estável — checkpoint
    do briefing, ainda não feito.
13. **571 lançamentos em duas operações e os "Reembolsos" com valor divergente**: levar à gerente —
    checkpoint do briefing, ainda não feito.
14. **M10 (destrutiva)**: fica para a v6.0.1, depois que esta v6.0.0 estiver em produção (§3).

---

## 13. Aprendizados (duráveis, por missão/anexo)

- **M3 (parsers/oráculos):** o subtotal que o export declara é o arredondamento da soma dos valores
  **exatos** — somar linha a linha já arredondado erra de 1 a 6 centavos por grupo; some em inteiros,
  arredonde uma vez. Guarda de faixa de data ancorada no **dia** é intermitente — ancorar no fim do
  ano (errata 1). Coluna sem consumidor e coluna com consumidor parecem idênticas no código; grep no
  corpo das funções, não só na aplicação.
- **M4 (rota/storage):** coluna sem leitor e coluna com leitor **parecem iguais no código**
  (`fato_lancamento_operacao.mes_ano` não tem leitor; `status`, ao lado, é somado em `SUM(CASE WHEN
  status = 'Entrada' …)` por quatro RPCs de Weddings) — deixar uma nula não dá erro, dá **zero** em
  colunas que a diretoria lê; antes de decidir que um campo "não precisa ser gravado", grepe o nome
  dele nos corpos de função, não só na aplicação. A mesma confusão de grandeza (venda distinta ×
  linha de item) apareceu em **três** lugares independentes — o diff, o título do modal, o rótulo
  da soma — e cada um só foi pego por um método diferente (smoke de servidor, leitura de código,
  tela ao vivo). Corrigir a primeira ocorrência não acha as outras. `data_final` é dependência em
  cascata (`coalesce(liquidação, vencimento)` → `mes_ano` → `status` → somas de previsto): sem o
  cruzamento de origem, a cascata inteira cai em silêncio. `check-then-insert` não é idempotência
  sob READ COMMITTED — a segunda chamada concorrente vira 500 no caso exato em que a idempotência
  deveria proteger.
- **M5 (atomicidade):** um filtro de negócio que "nunca existiu em código" pode estar vivo há anos —
  morando no script R que tratava o arquivo antes de ele chegar ao sistema; migrar a fonte para o cru
  reintroduz o problema que ninguém lembrava de ter resolvido. `IS DISTINCT FROM`, nunca `<>`, contra
  coluna anulável. "Hoje" dentro de uma função `SECURITY DEFINER` com owner `postgres` roda em **UTC**,
  não no fuso da sessão. Um checksum **ausente** (`[]`) não é a mesma coisa que um checksum que
  falhou — e o efeito de tratá-lo como sucesso é indistinguível de aplicar sem verificação nenhuma.
- **M6 (log/alarmes):** "rastro de execução com TTL" não é log — sobrevive 6 horas, o incidente
  sobrevive até ser resolvido. Um sistema de alarme sem deduplicação por incidente vira spam no
  primeiro dia ruim (o teto do Office 365 é 30 mensagens/minuto). Nome de campo copiado de um
  comentário do código, sem checar contra o que o código realmente grava, é dado não validado.
  **Escrita que acontece depois de um commit de dado (gravar log, disparar alarme) precisa ser à
  prova de exceção** — `concluirCarga` podia lançar depois da promoção e regravar como "erro" uma
  carga que já tinha sido aplicada com sucesso; o `catch` faltava exatamente onde o dado já estava
  seguro e só o registro dele podia mentir.
- **M6b (retenção):** apagar em Storage é só pela API dele — remover a linha por SQL não apaga o
  arquivo físico. Uma rota que **apaga** nunca pode responder a GET com sessão — robôs de
  pré-visualização de link e navegação de topo disparam GET sem intenção do usuário.
- **M7 (grafo/leitura):** um filtro aplicado em UMA função que lê uma tabela não filtra a tabela — é
  preciso enumerar **todos** os leitores (eram 6, não 1) e travar a lista com uma sonda de catálogo,
  não confiar em lembrar deles. Idempotência (que só lê) precisa vir **antes** de qualquer checagem
  que possa recusar (que só escreve depois) — a ordem errada transforma um replay legítimo em erro.
- **M8 (baseline):** um gerador de retrato de schema precisa de `search_path` fixo (senão o
  deparse depende da sessão que gerou) e de `ORDER BY` determinístico em toda query de ACL (dois
  grantors, o último escrito "vence" por acaso). Ligar/desligar um cron É drift de schema, mesmo sem
  migration.
- **M9 (cargas reais):** a prova contra uma base viva exige conferência **primeiro**, aplicação
  depois — nunca o inverso. O texto `"NA"` que o R grava para "ausente" chega ao banco como string,
  não como nulo, e quebra qualquer cast direto para inteiro; nome de coluna/valor copiado de um
  script legado é dado não validado até alguém tentar convertê-lo. Um teste pode **afirmar o
  defeito** em vez de só documentá-lo (a guarda de setor da 0284 só foi tida por corrigida depois
  de um teste provar, com a staging real, que `setor_fora` ia de 210 para 0 — a prova positiva, não
  só a ausência de erro, é o que fecha o caso).

---

## Advisor

O advisor foi consultado pelo orquestrador nas decisões de desenho e antes de declarar cada missão
concluída, e por implementadores e revisores quando o próprio retorno declara (linha "Advisor:").
O que mudou o rumo, registrado aqui porque não aparece em nenhum commit:
- **M7:** o check do grafo tinha de ficar antes da abertura da carga (não gravar linha nem consumir a
  idempotência); "parcial" não podia vir do calendário; e, na auto-auditoria, que a primeira versão punha
  o grafo antes do replay de idempotência — desvio do contrato que o anexo chamava de "o contrato".
- **M8:** o baseline nasceria do catálogo e não do `db dump`; e, antes de declarar, que a varredura de
  segredo tinha de ser refeita porque o JSON mudou depois dela, e que o comando deixado para o Yan tinha
  uma flag inexistente.
- **Implementadores:** o do out-briefing teve bloqueada uma seção "Advisor" preenchida antes de a consulta
  existir e seis erros factuais corrigidos (entre eles `truncate_dynamic_tables` fora da destrutiva, porque o
  seed a usa); o dos ADRs corrigiu a allowlist do `ingestor` (21 assinaturas, não só `promover_*`).
