# WORKING-CONTEXT — Janus

Última atualização: 2026-07-28 (15h) · v5.3.1 MERGEADA (#195) — DRE: Resumo Executivo + Decomposição por bloco; migration 0209 aplicada e verificada

> Verdade atual do projeto em UMA página. Toda sessão nova lê este arquivo antes de
> explorar o repositório (o hook `contexto-sessao` o injeta automaticamente).
> Atualizado como parte do out-briefing de TODA versão/patch (DoD). Manter curto:
> o que mudou de verdade, não histórico — histórico é o CHANGELOG.

## Verdade atual

- Versão em produção (main): **`5.3.1`** (#195 mergeado 28/07 às 14h33; merge `a3b524a`).
  Nenhuma branch de versão ativa — worktree e branch da v5.3.1 já limpas.
- A v5.3.1 **fecha a adaptação do modelo da controladoria**. Duas peças em `/financeiro/dre`:
  (1) **Resumo Executivo** — 6 linhas-chave × 6 colunas (2 anos cheios + Δ, 2 YTDs + Δ, **Δ em
  REAIS**) dentro do MESMO card, abaixo da tabela, **ancorado no ANO CORRENTE**: não acompanha a
  pill de ano (com `?ano=2025` segue em 2024|2025|YTD 25|YTD 26). É intencional — se parecer bug,
  não é. Custo de rede ZERO (reusa o MESMO `consolidadoAnos` do Consolidado).
  (2) **Decomposição dos Lançamentos** — barras horizontais agrupadas por **BLOCO da estrutura
  viva** (não pelo grupo nativo do Monde), pills de período dentro do card, dentro da TopSection
  "Regime de Caixa" (a TopSection própria foi **aposentada**).
- **Migration 0209 (`get_decomposicao_bloco`) APLICADA e verificada** via REST/service_role: totais
  batendo ao centavo com agregação SQL independente, `anon` → 401, período invertido → erro
  amigável. Gates no merge: **tsc 0 / lint / build / 493 testes verdes**.
- Último ADR registrado: `0156` — **emendado** na v5.3.1 (por que a Decomposição trocou de fonte:
  grupo nativo do Monde × bloco curado). **Nenhum ADR novo** desde então.
- **Reconciliação PROVADA, não afirmada:** `tipo='realizado'` + `dre_categoria_map` fecha com as
  colunas da tabela em **delta 0,00 nos 18 blocos analíticos**. Virou **caso vivo em
  `rpc-contrato.test.ts`** (contra o mês fechado anterior, derivado de `hojeSP()` — não apodrece).
- ⚠️ **Aditiva nova ainda precisa de `--aditiva --fora-de-ordem`** + cópias untracked das 0950–0954
  (v5.4.0/PR #191 ocupam o topo do remoto), **removidas antes do merge**. **Próximo número livre é
  `0210`.** E ver "classificador de permissões" em Cuidados: o comando é barrado para o agente.
- **Vercel (infra, standing):** deploy de repo privado de org exige plano Pro — pendência de billing
  do Yan, herdada da v5.2.0.

## Bloqueios vigentes

- **Conceder a área `financeiro/dre` às roles** no editor de acessos (herdado da v5.3.0). Sem isso a
  aba do Demonstrativo existe mas **só admin a enxerga** — é o que falta para a entrega chegar ao
  usuário final.
- **Conferir o Resumo Executivo contra a planilha da controladoria.** Contra a tabela já está
  provado (a coluna do ano bate com "TOTAL DO ANO", linha a linha); contra a planilha é do Yan.
- **Decisões de produto abertas na DRE:** (a) centavos na barra da Decomposição — hoje mostra reais
  com o valor exato no `title`; (b) posição do "Editar estrutura", que passou a ficar abaixo do
  Resumo; (c) **3 dos 18 blocos vêm do seed em CAIXA ALTA** e são exibidos fiéis ao dado
  (title-case automático mangularia siglas/preposições) — se incomodar, o ajuste é **no editor da
  estrutura**, não em código; (d) **vencidos em aberto no Total do ano** (o dado já viaja por linha);
  (e) **convenção do Δ% do Consolidado** — denominador em MÓDULO, então prejuízo→lucro lê como
  +118,2% (melhora) e não −118,2%; trocar = uma linha.
- **Órfão de documentação:** o commit `b869bb9` (176 linhas do relatório de delta DRE×Monde + a
  errata da DEFASAGEM) **nunca chegou ao main** — foi criado DEPOIS do merge do #194 (que fechou em
  `94d3e0e`) e vive só em `origin/docs/investigacao-dre-competencia-monde` e na worktree
  `.claude/worktrees/investigacao-dre-monde`. No checkout raiz aparecem como untracked/modified.
  Decidir: PR próprio ou descarte deliberado. **Não remover essa worktree antes de decidir.**
- **Faturamento roda em MODO TESTE** — o flip de produção (Asaas produção + `EMAIL_MODO=real`)
  é decisão do Yan, fora do código. A dupla trava do modo real está construída, não acionada.
- **Virada Monde APLICADA (v5.1.4):** as 7 funções PURA-mv leem o espelho Monde; cron `*/15` ATIVO.
  O upload de Excel é fallback dormente MAS ainda é a única fonte de: `get_mix_produto`/`get_cagr`
  (Performance) e as telas de Weddings (subsetor/pipeline/prejuízos). **NÃO parar o upload**
  (Scope B resolve — ver filas).
- **`SMTP_*` na Vercel** — sem eles, as notificações por e-mail degradam em silêncio.
- **% Rec no Cadastro de Metas** — alvos de %Rec nascem vazios; cards mostram "—" até o Yan digitar.
- Favicon/símbolo Janus adiado (reprovado no gate de legibilidade 16/32px).

## Filas ativas (próximos passos já decididos)

- **Revisão do workflow e do CLAUDE.md EM CURSO** (Yan, com apoio de outro chat). Insumo já
  levantado: as três camadas que barram uma migration, o escopo real do `protecao-config` e as
  lacunas de doc — ver "Cuidados" abaixo. Enquanto a revisão correr, **evitar reescrever a estrutura
  deste arquivo e do CLAUDE.md** para não conflitar.
- **v5.4.0 (PR #191) DESTRAVADA** — aguardava a v5.3.0. No merge dela: renumerar as provisórias
  `0950–0954` para **`0210–0214`** (o `0209` foi ocupado pela v5.3.1) + `migration repair`.
- **Fuso das pills de período (candidato REAL, achado na v5.3.1):** `resolverPeriodoCompleto`
  (`src/lib/periodo.ts`) **não ancora em `hojeSP()`** — recebe `new Date()` cru e resolve os presets
  com `date-fns` no fuso do processo. Se o runtime rodar em UTC, entre ~21h e a meia-noite de SP as
  pills "Este mês"/"Este ano" viram o mês/ano **antes da hora**. Mesma classe do fix sistêmico
  0152/ADR-0125, que cobriu só o lado do Postgres. Transversal (Fluxo de Caixa **e** DRE).
- **Limpeza de RPC órfã:** `get_decomposicao_grupo`/`get_decomposicao_categoria` ficaram sem
  consumidor vivo com a v5.3.1 (o card desta página era o único). DROP exige a verificação de
  consumidores reais de sempre — app **e** `supabase/seed/` (é onde a v4.17.1 se enganou).
- **v5.3.x refino da DRE:** drag-and-drop no editor; guarda de saída para navegação por link;
  divisão ver/editar da permissão; mover `historico-alteracoes` para `shared/`. Achado registrado,
  não implementado (é produto): na visão Consolidado o CONJUNTO DE LINHAS vem do ano da URL — os
  valores é que vêm por ano marcado.
- **Monde — Scope B (APOSENTAR o upload manual de Vendas):** viável (item-level já no espelho);
  construir fato/mv item-level e repontar as 6 funções que leem `analytics.fato_venda` direto.
- **Saúde da sincronização Monde:** alerta ATIVO por e-mail; detectar falha SILENCIOSA (200 sem
  vendas).
- restore-test COMPLETO do backup-gate (follow-up ADR-0116).
- `CRON_SECRET` em comparação constant-time (BAIXO, v5.1.7).
- Casos de contrato pendentes de outras áreas: `solicitar_acesso_admin`, `monde_ingest_status`.
- Tokenização do `zinc` (follow-up v4.26) — e junto dela os **hex intermediários das paletas** da
  Decomposição (`#7E9658` etc.), que o lint não pega porque vão em `style={{}}`, não em classe.
  Nota visual: a paleta faz a 4ª barra ser a mais escura (foi desenhada para donut, não para lista).
- Consolidação das 3 pills de período (dívida opcional) — `PeriodoFilterPillsUrl` ainda hand-rola as
  classes em vez de usar `PILL_FILTRO` de `@/components/shared/botoes`.
- Metas por Vendedor — próxima capacidade planejada (escopo a confirmar).

## Cuidados desta fase (o que uma sessão nova precisa saber AGORA)

- ⚠️ **CLASSIFICADOR DE PERMISSÕES DO HARNESS: `npm run db:migrate` é BARRADO para o agente.**
  Descoberto na v5.3.1. É uma **terceira camada**, que não é do projeto: com
  `permissions.defaultMode: "auto"` e sem lista `allow`, um classificador do Claude Code nega
  comandos que escreve em produção — e no modo auto a negação é **seca**, não vira prompt. Logo a
  autonomia aditiva descrita em "Banco de dados" do CLAUDE.md **só se materializa se houver regra de
  `allow`**; hoje não há. **Protocolo:** (1) NÃO contornar (`db push` cru pula o backup-gate;
  `db query` cria drift no histórico); (2) fazer todo o resto até o fim; (3) deixar o ambiente pronto
  (cópias 0950–0954 posicionadas); (4) sinalizar no PR/out-briefing/aqui com o comando exato;
  (5) declarar o que ficou **não-verificado** por causa do bloqueio. Liberar é de baixo risco por
  construção: o wrapper força `destrutiva=true` e **aborta sem TTY**, então regra de `allow` para
  aditiva não vaza para destrutiva.
- **Hooks do harness ATIVOS** (protecao-config / gate-stop / contexto-sessao). O `protecao-config`
  protege 6 alvos — `eslint.config.*`, `tsconfig*.json`, `.prettierrc*`, `eslint-rules/`,
  **`.claude/hooks/`** (os próprios hooks não se desarmam) e **`.claude/settings.json`** (a regex
  casa qualquer caminho terminado assim, **inclusive o settings GLOBAL do usuário**). O escape
  `WT_PERMITIR_CONFIG=1` é variável de ambiente da SESSÃO e **o agente não consegue setá-la** — ele
  propõe o diff, o humano aplica. Escape geral: `WT_DESLIGAR_HOOKS=1`.
- **`.claude/settings.json` versionado tem só `hooks`** — o `model` do orquestrador não é fixado.
- **Protocolo de revisão:** `revisor` (sempre) e `revisor-db` (se migration/RPC) ANTES dos gates.
  Na v5.3.1 cada um pegou **um ALTO real**: o Resumo sumia no fail-safe da tabela apesar de ter
  fonte própria; e faltava o caso de contrato da RPC nova. O revisor também pegou uma **afirmação
  falsa** que o orquestrador havia escrito no header da migration.
- **RPC que já existe e aceita o parâmetro certo pode ter a SEMÂNTICA errada — MEÇA antes de reusar**
  (regra no CLAUDE.md, nascida da v5.3.1). Quando dois números ficam lado a lado na mesma tela, a
  igualdade entre eles vira caso de contrato, não nota de rodapé.
- **A DRE tem DOIS recortes independentes na mesma seção:** o `?ano=` da tabela e o
  `?preset=&from=&to=` das pills da Decomposição. É de propósito (o card é autocontido).
- **Diário/undo é GENÉRICO** (`reverter_diario` lê `tabela_alvo`; allowlist = trigger anexado).
  Tabela editável nova: PK `id` + `CREATE TRIGGER ... fn_diario_alteracoes()` + wrappers de área
  própria (molde: `dre_estrutura_*`, 0206).
- **Estrutura da DRE é DADO** (`financeiro.dre_bloco`/`dre_categoria_map`): fórmulas por CHAVE,
  bandeja = dim sem map, excluída = estado explícito. **Atenção:** a Receita Bruta é `RB_H` com
  `tipo:'blocoH'`, NÃO `'tot'` — filtrar totalizadores por `t==='tot'` a deixa de fora; e `formula`
  (que distinguiria agregador de folha) **não viaja** no payload de `get_dre_mensal`.
- `monde.*` é a fonte viva das telas executivas/Metas; Weddings/mix/CAGR ainda vêm do upload.

---
Regra de manutenção: item resolvido SAI (não é log). Aprendizado permanente NÃO fica
aqui — vai para o CLAUDE.md pelo critério das três condições (permanente, transversal,
custou caro).
