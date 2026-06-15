# ADR-0118 — Regra de data por campo (Solicitações) + multi-seleção de operações (Weddings)

**Status:** Aceito (v4.19.0)
**Data:** 2026-06-14
**Relacionado:** ADR-0112/0113 (módulo de Solicitações), ADR-0109 (wrapper `__nucleo` + `exigir_acesso`), ADR-0114 (janela anon encerrada), ADR-0116 (backup-gate / migration destrutiva), ADR-0103 (paleta/tokens)

## Contexto

Quatro ajustes pós-produção da v4.18: dois de capacidade nova (regra de data configurável por campo; multi-seleção de operações em Weddings) e dois de refino visual (drawer de detalhe; tabela de tipos). Os dois de capacidade têm decisões arquiteturais que valem registro.

## Decisão

### 1. Regra de data configurável por campo (Solicitações)

Um campo do tipo `data` num tipo de solicitação ganha duas regras opcionais:
- **`data_permite_passado` (boolean, default `true`)** — quando `false`, o servidor **rejeita** valor `< HOJE`.
- **`data_aviso_dias_futuro` (int, nullable)** — limiar de **aviso** (só UI): se a data está a mais de N dias no futuro, o preenchimento mostra um alerta inline **não-bloqueante**.

Decisões:
- **Colunas dedicadas tipadas** em `app.solicitacao_campo`, **não** reuso de `opcoes` (cujo CHECK a tranca em `tipo_campo='selecao'`). Migration **0140 aditiva** (`DEFAULT true` ⇒ toda linha existente nasce sem restrição = comportamento idêntico ao atual).
- **Bloqueio é server-side e autoritativo** (`criar_solicitacao`, ramo `data`); o atributo `min` do `<input type="date">` no preenchimento é **espelho cosmético** do cliente. HOJE = `(now() AT TIME ZONE 'America/Sao_Paulo')::date` — **nunca** `current_date` (TZ do servidor erraria o dia perto da meia-noite). O aviso é puramente client-side.
- **A regra NÃO entra no snapshot imutável** da solicitação — é portão de **open-time** (vale no momento da abertura; não há trilha de auditoria da regra). Snapshot intocado.
- **Fontanaria de 5 camadas:** a config atravessa `campoDefSchema` (Zod, `.optional()` para não ser estripada pelo `parseRpc`), o map do construtor, o map da action, o INSERT e os SELECTs das RPCs. Esquecer **uma** camada faz a regra sumir **sem erro de build** — por isso é a parte que custou atenção e tem teste de contrato guardando a sobrevivência das chaves.

### 2. Multi-seleção de operações (Weddings)

O filtro "Filtrar gráficos por operação" passa de seleção única para **multi-seleção** (soma agregada do subconjunto). Decisões:
- **Fronteira (opção 1):** a multi-seleção alimenta **só os 2 gráficos** da seção "Visão Analítica por Operação" (Fluxo de Caixa Mensal e Acumulado de Recebimentos e Pagamentos). KPIs/Mix/Carteira/Próximos **não** reagem (seguem por período/setor). Reescopar a página inteira foi **descartado** — exporia métricas derivadas (margem %, ratios) que **não somam trivialmente**.
- **Agregação = soma natural:** o filtro é um `WHERE operacao = ANY(p_operacoes)` sobre `analytics.fato_lancamento_operacao` (tudo `SUM(valor)`); somar N operações apenas alarga o WHERE — exato, sem fan-out.
- **"Todas as operações" é mutuamente exclusiva** e o **conjunto vazio === Todas** (sem filtro). Estado na URL (`operacao` como lista, `getAll`/`append`); rótulo do gatilho vira **contador** (não chips, que estourariam a largura).
- **Migration 0141 levemente destrutiva (DROP+CREATE):** o 3º parâmetro muda de tipo (`text → text[]`), o que o Postgres não faz com `CREATE OR REPLACE` — exige DROP+CREATE do **núcleo** e do **wrapper** (ADR-0109). Por ser DROP de objeto, **exigiu confirmação humana** antes do `db push` (ADR-0116), com o backup-gate como rede. Reversível (assinatura antiga reproduzível de 0106+0121); consumidor único (`weddings-content.tsx`). GRANTs realinhados à política viva: `authenticated`/`service_role`, **nunca `anon`** (0133/M1 fechou a janela anon — não reabrir). Retorno JSON inalterado ⇒ sem mudança de Zod/`parseRpc`.

## Alternativas consideradas
- **Reusar `opcoes` para a regra de data:** descartado (CHECK a tranca ao `selecao`).
- **Congelar a regra no snapshot:** descartado — a regra só importa na abertura; congelá-la seria trilha de auditoria fora de escopo.
- **Multi-seleção reescopando a página inteira de Weddings:** descartado (métricas derivadas não-somáveis; fronteira de produto).
- **`CREATE OR REPLACE` para o `text[]`:** impossível (Postgres não troca tipo de argumento) — daí o DROP+CREATE.

## Consequências
- Migrations 0140 (aditiva) e 0141 (destrutiva, confirmada). Colunas novas em `app.solicitacao_campo`. `get_acumulado_weddings` agora é `(integer, integer, text[])` (a sobrecarga 2-arg permanece intocada). Nenhuma mudança no Fluxo de Caixa (dormente).
- Convenção reforçada: **regra/config nova que atravessa várias camadas de mapeamento deve ser verificada ponta-a-ponta** — camadas que descartam chaves desconhecidas fazem a config sumir sem erro de build (já no CLAUDE.md como aprendizado v4.19).
