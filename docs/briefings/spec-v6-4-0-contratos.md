# v6.4.0 — Contrato técnico (fonte única para os implementadores)

Deriva do briefing (`briefing-v6-4-0-financeiro-geral.md`), da validação e das decisões do Yan
(`plano-v6-4-0-validacao-briefing.md`, `docs/auditoria/v6-4-0-m0-*.md`, `v6-4-0-m1-*.md`). Em conflito,
vale a **decisão do Yan** registrada nesses arquivos. Ponto que este contrato não fixa é técnico do
implementador; ponto de produto volta ao orquestrador.

Numeração conferida em 15/10 (sem colisão com outras worktrees):

| Migration | Conteúdo |
|---|---|
| **0295** | base contas a receber |
| **0296** | antecipações |
| **0297** | leitura da página |

ADR **0183**. Patch destrutivo (aplicação humana em TTY) em `supabase/patches/`, **fora** de
`supabase/migrations/`.

## 1. Base de ingestão `contas-receber` (0295 + patch)

**Slug** `contas-receber`; card `contas_receber`; rótulo "Contas a receber".

**Arquivos:** N por carga, um por faixa de vencimento. O Monde limita a pesquisa a 30 mil linhas.
Fixtures reais: `~/projects/arquivo-worktrees-janus/fixtures-ingestao/Contas a receber 24.xlsx` e `… 25-26.xlsx`.

**Formato do arquivo** (conferido na M1):

- 1 aba, cabeçalho na linha 1, 17 colunas.
- Lista fechada **gravada** (inv. 5): `Número`, `Emissão`, `Pessoa`, `Descrição`, `Vencimento`,
  `Liquidação`, `Valor Final`, `Conferido`, `Operação Própria`. As outras 8 colunas são lidas só para
  mapear o cabeçalho e **nunca** gravadas. `Observações`, `Pendente com:`, `Documento` e
  `Conta (Previsão)` nunca entram em tabela.
- Linha de total: a **última**. `Número` vem numérico (= contagem de títulos do arquivo) e `Valor Final`
  = Σ dos títulos. Nas outras colunas, vazio.
- **Checksum por arquivo:** `{escopo:'arquivo', chave:{arquivo_origem}, linhas, centavos}`, tolerância 0.
  Arquivo sem a linha de total ⇒ parse falha.
- Títulos: `Número` texto (pode ter sufixo `-N`), único por carga.
  - **Número repetido entre arquivos ⇒ a carga reprova**, com mensagem que nomeia a quantidade.
- `Emissão` com data zero ou inválida ⇒ `null`, contado em aviso (não rejeita).
- `Conferido` ∈ {vazio→`null`, `Sim`, `Pendente`, `Enviado para o banco`, `Inadimplente`}. Valor fora
  disso ⇒ a carga reprova.
- `Valor Final` ≥ 0 (zero é legítimo: 216 títulos em 2024 e 395 em 2025–26, faturas zeradas por compensação; corrigido em 15/10 depois que o oráculo pegou o erro da M1). Negativo reprova: um arquivo misto pagar + receber traz o total **com sinal** e não fecha.
- **Aviso de lacuna:** com as faixas `[min,max]` de vencimento de cada arquivo ordenadas, buraco de mais
  de 1 dia entre o fim de uma e o início da próxima ⇒ aviso (não bloqueia).
- Datas: valor nativo da célula; meia-noite de Brasília = 03:00 UTC. Coerção só por `@/lib/carga/coercao.ts`.

**Banco (0295, aditiva):**

- `raw.contas_receber`: `arquivo_origem text`, `linha_origem int`, `numero text NOT NULL`,
  `emissao date`, `pessoa text`, `descricao text`, `vencimento date`, `liquidacao date`,
  `valor_final numeric(18,2) NOT NULL`, `conferido text` (CHECK no domínio acima, `NULL` permitido),
  `operacao_propria text`, `carregado_em timestamptz DEFAULT now()`.
  - Mais `raw.contas_receber_staging` (UNLOGGED, `LIKE … INCLUDING DEFAULTS`), molde 0277.
- **Fotos** (inv. 4):
  - `financeiro.contas_receber_foto_carga`: `carga_id uuid PK`, `data_posicao date NOT NULL` (hoje SP
    no momento da promoção), `gravado_em timestamptz DEFAULT now()`, `titulos int`, `em_aberto int`,
    `a_vencer_n int`, `a_vencer_valor numeric(18,2)`, `inadimplente_n int`, `inadimplente_valor numeric(18,2)`.
  - `financeiro.contas_receber_foto`: `carga_id uuid` → foto_carga, `numero text`, `vencimento date`,
    `liquidacao date`, `valor_final numeric(18,2)`, `conferido text`, PK `(carga_id, numero)`. Grava
    **só** os títulos em aberto (`liquidacao IS NULL`) e os marcados `Inadimplente` (inclusive liquidados).
- **RPCs de carga** (molde 0278 Aberto; GRANT a `service_role` e `ingestor`; sem `exigir_acesso` por desenho):
  - `limpar_staging_contas_receber()`;
  - `inserir_lote_staging_contas_receber(p_linhas jsonb)`;
  - `validar_carga_contas_receber()`, que devolve `{ok,total,erros}`. Reprova: staging vazia, número
    repetido, `conferido` fora do domínio, `valor_final` < 0;
  - `promover_carga_contas_receber(p_checksums jsonb, p_carga_id uuid)`:
    - advisory lock **4017060**;
    - replay por `ingestao.promocao`;
    - array vazio ⇒ `CHECKSUM_AUSENTE`;
    - TRUNCATE + INSERT em `raw.contas_receber`;
    - confere cada checksum `arquivo` contra o GRAVADO (`count`, `round(sum*100)`) ⇒ `CHECKSUM_FALHOU`;
    - **grava a foto na mesma transação**;
    - devolve `{linhas, checksums_conferidos, checksums_nao_conferiveis:0, foto:{data_posicao, em_aberto, inadimplente_n, inadimplente_valor}, avisos}`.
- `CREATE OR REPLACE` **a partir do catálogo vivo** (dumps em `$CLAUDE_JOB_DIR/tmp/vivo/`) de
  `ingestao_carga_abrir`, `ingestao_carga_ultima` e `ingestao_soma_por_ano`, aceitando `contas-receber`.
  - No `soma_por_ano`, ano = ano do vencimento e `centavos` = Σ `valor_final`.
  - O `ELSE` implícito de Operação vira `ELSIF` explícito, mais `ELSE RAISE`.
- **Não muda:** `api_chave_escopo_bases_validas` (sem RPA para esta base, briefing §11) e
  `ingestao_expectativa_alvo_valido` (sem expectativa de vigia por ora).
- **Patch destrutivo** `supabase/patches/contas_receber_checks_ingestao.sql`: `ALTER TABLE … DROP
  CONSTRAINT` + `ADD CONSTRAINT` de `ingestao_carga_base_valida` e `ingestao_promocao_base_valida` com as
  6 bases. Header com o comando do Yan e o DOWN.
  - Até ele ser aplicado, abrir carga da base nova falha no CHECK. É fail-closed e a base fica intacta.

## 2. Antecipações (0296, aditiva)

- `financeiro.antecipacao_conta`: `id smallint PK`, `nome text UNIQUE NOT NULL`, `ativo bool DEFAULT true`.
  Seed (1,'Asaas'), (2,'Blimboo').
- `financeiro.antecipacao`:
  - `id bigint GENERATED ALWAYS AS IDENTITY PK`;
  - `conta_id smallint NOT NULL` FK;
  - `data date NOT NULL`;
  - `valor_antecipado numeric(14,2) NOT NULL CHECK (>0)`;
  - `valor_liquido numeric(14,2) NOT NULL CHECK (>0)`, mais `CHECK (valor_liquido <= valor_antecipado)`;
  - `desconto numeric(14,2) GENERATED ALWAYS AS (valor_antecipado - valor_liquido) STORED`;
  - `criado_por uuid`, `criado_em timestamptz DEFAULT now()`, `atualizado_por uuid`, `atualizado_em timestamptz DEFAULT now()`.
- **Carga inicial:** as 38 linhas de `$CLAUDE_JOB_DIR/tmp/antecipacoes_values.sql` (conta por nome →
  id), por INSERT **antes** do trigger do diário. Fecha com um guard `DO` que reprova se os totais não
  forem os do inv. 7:

  | | Valor |
  |---|---:|
  | Antecipado | 7.245.412,45 |
  | Líquido | 7.057.349,44 |
  | Desconto | 188.063,01 |
  | Asaas 2024 | 1.521.381,14 |
  | Asaas 2025 | 823.881,69 |
  | Asaas 2026 | 1.343.423,51 |
  | Blimboo 2025 | 3.102.209,43 |
  | Blimboo 2026 | 454.516,68 |

  Mais a contagem de 38.
- **Diário:** `CREATE TRIGGER trg_diario_antecipacao AFTER INSERT OR UPDATE OR DELETE … EXECUTE FUNCTION
  financeiro.fn_diario_alteracoes()`, depois da carga. Mais um BEFORE UPDATE que carimba `atualizado_em`,
  se for o padrão das tabelas sob diário.
- **RPCs de escrita** (`exigir_acesso(ARRAY['financeiro/geral/gestao'])` inline; GRANT `authenticated`,
  `service_role`; **nunca** `verificador`/`ingestor`):
  - `antecipacao_salvar(p_id bigint, p_conta_id smallint, p_data date, p_valor_antecipado numeric, p_valor_liquido numeric) RETURNS json`:
    `p_id NULL` cria, senão atualiza. Erros legíveis.
  - `antecipacao_excluir(p_id bigint) RETURNS void`.
  - `antecipacao_desfazer(p_diario_id bigint) RETURNS json`: só aceita entrada do diário de
    `financeiro.antecipacao`; chama `financeiro.reverter_diario(ARRAY[p_diario_id])`.
- **RPCs de leitura da gestão** (`financeiro/geral/gestao`):
  - `antecipacao_listar() RETURNS json` → `{contas:[{id,nome}], registros:[{id,conta_id,conta,data,valor_antecipado,valor_liquido,desconto,atualizado_em}]}`, por data desc;
  - `antecipacao_historico(p_limite int DEFAULT 20) RETURNS json` → entradas do diário da tabela
    `[{diario_id, operacao, registro_id, usuario_nome, quando, antes, depois}]`, só com os campos de negócio.

## 3. Leitura da página (0297, aditiva) — área `financeiro/geral`

**Áreas** (molde 0292):

| Área | Rótulo | Grupo | Concedida a |
|---|---|---|---|
| `financeiro/geral` | "Geral" | Financeiro | Diretoria, Financeiro, Administrador, Máquina · verificação |
| `financeiro/geral/gestao` | "Geral (gestão)" | Financeiro | Financeiro, Administrador, Máquina · verificação (só a área; sem EXECUTE nas RPCs de escrita) |

Guard de contagem exata.

**Tabelas curadas:**

- `financeiro.geral_fin_grupo`: `categoria_id int PK` → `dim_categoria`; `grupo text` CHECK ∈
  {`cartao`, `antecipacao`, `juros_iof`, `tarifas`, `cambio`, `receitas_financeiras`}; `ordem int`.

  | Grupo | Categorias (seed por nome; guard: 11 linhas) |
  |---|---|
  | cartao | Taxa do Cartão de Crédito/Débito |
  | antecipacao | Taxa de Antecipação |
  | juros_iof | Juros e Multa, IOF |
  | tarifas | Taxas e Tarifas Bancárias, Tarifa de Remessa, Anuidade de Cartões |
  | cambio | Diferença Taxa de Cambio Dia D, Diferença Taxa de Câmbio Dia C |
  | receitas_financeiras | Acréscimos Cobrados, Desconto Obtido |

  Categoria do FIN vivo **fora** da tabela ⇒ grupo `nao_classificado` (bandeja visível).
- `financeiro.geral_perda_map`: `categoria_id int PK`, `papel text` CHECK ∈ {`prejuizo`, `reversao`}.
  Seed: Prejuízos → `prejuizo`; Reversão de Perdas Financeiras → `reversao` (guard: 2).
  - Bandeja: categoria com nome `ILIKE '%preju%' OR '%perda%'` fora da tabela.

**Predicado** (inv. 1, idêntico ao Realizado de `get_dre_mensal` 0207):

- `financeiro.fato_fluxo f` ⨝ `dre_categoria_map m` (`NOT m.excluida`), `f.tipo='realizado'`, mês de
  `f.data_competencia` dentro de `p_ano`.
- Bloco FIN = `m.bloco_chave='FIN'`. RB = blocos `ENT_H` + `PAG_H` + `RV` (`RB_H = REPASSE + RV`,
  `REPASSE = ENT_H + PAG_H`).
- Prejuízo e reversão = categorias da `geral_perda_map`, quaisquer que sejam os blocos.

**Convenções do retorno:**

- `meses` = array de 12 números (jan..dez; 0 onde não há realizado).
- `relacao` ∈ {`fechado`, `corrente`, `futuro`}; `mes_corrente` (1..12 ou `null`).
- `ano_anterior_ytd` = mesmo recorte de meses do ano anterior: no corrente, jan..`mes_corrente`; no fechado, o ano todo.
- `atualizado_em` = carimbo da fonte.
- Valores com sinal da DRE (despesa negativa).

**RPCs de leitura** (todas `exigir_acesso(ARRAY['financeiro/geral'])` inline, GRANT `authenticated`,
`service_role`, `verificador`):

1. **`get_geral_custos_financeiros(p_ano int) RETURNS json`** →
   `{ano, relacao, mes_corrente, grupos:[{grupo, tipo:'custo'|'outros', meses, total, categorias:[{categoria_id, rotulo, meses, total}]}], custos:{meses,total}, fin:{meses,total}, receita_bruta:{meses,total}, ano_anterior_ytd:{custos, fin, receita_bruta}, atualizado_em}`.
   - `tipo='custo'` para cartao, antecipacao, juros_iof e tarifas; `outros` para cambio,
     receitas_financeiras e nao_classificado.
   - `fin` ≡ bloco FIN (paridade).
   - `atualizado_em` = `max(fato_fluxo.gerado_em)`.
2. **`get_geral_prejuizos(p_ano int) RETURNS json`** →
   `{ano, relacao, mes_corrente, prejuizo:{meses,total}, reversao:{meses,total}, liquido:{meses,total}, ano_anterior_ytd:{prejuizo, reversao, liquido}, bandeja:[{categoria_id, rotulo, total}], atualizado_em}`.
3. **`get_geral_recebiveis() RETURNS json`**. Posição = a carga vigente de `raw.contas_receber` mais a
   foto mais recente; sem base ⇒ `{carga:null, …}` com zeros e listas vazias:

   ```
   {carga:{carga_id, data_posicao, gravado_em}|null,
    a_vencer:{n, valor},
    inadimplente:{n, valor, faixas:[{faixa:'nao_vencido'|'1-30'|'31-60'|'61-90'|'90+', n, valor}]},
    marcacao_em_aberto:[{conferido:'Inadimplente'|'Pendente'|'Enviado para o banco'|'Sim'|null, n, valor}],
    concentracao:{top:[{pessoa, n, valor}], valor_top, pct_top},
    recuperado_ano:{ano, n, valor},
    comparativo:{data_posicao, inadimplente_n, inadimplente_valor, a_vencer_valor}|null,
    evolucao:[{mes:'AAAA-MM', data_posicao, inadimplente_n, inadimplente_valor, a_vencer_valor}],
    historico_desde}
   ```

   - **Inadimplente** = `liquidacao IS NULL AND conferido='Inadimplente'` (decisão do GATE 1: só a
     marcação). Faixas pelos dias de atraso (`data_posicao − vencimento`) dos **marcados**.
   - **A vencer** = em aberto, com `vencimento > data_posicao`.
   - **Concentração** = top 10 inadimplentes por `pessoa`, com nome (área `financeiro/geral`).
   - **Recuperado** = `conferido='Inadimplente' AND liquidacao` no ano da `data_posicao`.
   - **Comparativo** = última foto do mês anterior ao da `data_posicao`.
   - **Evolução** = última foto de cada mês.
4. **`get_geral_antecipacoes(p_ano int) RETURNS json`** →
   `{ano, relacao, mes_corrente, meses:[{volume, liquido, desconto, n}]×12, total:{volume, liquido, desconto, n, desconto_pct}, ano_anterior_ytd:{volume, desconto, n}, por_conta:[{conta, volume, desconto, n}], ultima_data, dias_desde_ultima, maior_intervalo_ano:{dias, de, ate}|null, atualizado_em}`.
   - `dias_desde_ultima` = hoje SP − última data (todas as contas).
   - `maior_intervalo_ano` = maior intervalo entre datas consecutivas dentro do ano.
   - `atualizado_em` = `max(atualizado_em)` da tabela.
5. **`get_geral_prazos() RETURNS json`** →
   `{atual:{data, saldo_receber, saldo_pagar, entrada_12m, pagamento_12m, janela_de, janela_ate, pmr, pmp, folga}|null, serie:[{data, pmr, pmp, folga}], historico_desde}`.
   - Decisão do GATE 0:
     - `saldo_receber` = Σ `raw.titulos_em_aberto.valor` do grupo 'Receita de Vendas';
     - `saldo_pagar` = |Σ| do grupo 'Repasse';
     - `entrada_12m` = Realizado do bloco `ENT_H`; `pagamento_12m` = |Realizado de `PAG_H`|;
     - janela = os 12 meses fechados anteriores ao mês da data;
     - `pmr = saldo_receber / entrada_12m × 365`, `pmp` análogo, `folga = pmp − pmr` (1 casa).
   - Núcleo único `financeiro.geral_prazo_calcular()` (service-only), usado pela RPC (`atual`) e pela foto.
   - Foto: `financeiro.geral_prazo_foto` (`id identity`, `data date`, `capturado_em`, `carga_id uuid null`,
     os 6 valores, janela) + `public.registrar_foto_prazos(p_carga_id uuid)` (GRANT só `service_role`).
   - A migration grava **uma** foto inicial (INSERT aditivo).
   - `serie` = última foto de cada dia.

**Grants do `verificador`:** as 5 `get_geral_*` e `antecipacao_listar`/`_historico` (leitura), por
assinatura, via `scripts/credencial/derivar-allowlist.mjs` depois dos casos de contrato.

## 4. App

- **Captura da foto de prazos:** depois de **aplicar** com sucesso a base `lancamentos-aberto`, o servidor
  chama `registrar_foto_prazos(carga_id)` com o client de metadado (o mesmo da soma por ano). É
  **fail-soft**: falha vira aviso, nunca desfaz a carga. É a única mudança no caminho de outra base;
  registrada no out-briefing contra o inv. 9.
- **Página `/financeiro/geral`** (área `financeiro/geral`), subaba "Geral" em Financeiro:
  - cabeçalho com pills de ano (multisseleção, `?anos=`, reaproveitando `src/lib/marketing/anos.ts`
    **sem mover**) e "Última atualização";
  - faixa de 5 indicadores;
  - 5 `TopSection`, cada uma com etiqueta estoque/fluxo, carimbo próprio, "?" de definição e
    degradação própria (erro/vazio por seção).
- **Painel de antecipações:** botão só para quem tem `financeiro/geral/gestao`; lista + formulário
  (valor pt-BR normalizado no envio) + histórico com "Desfazer".
- `rotaInicial`: quem só tem `financeiro/geral` (ou só leitura + gestão) cai direto na página.
