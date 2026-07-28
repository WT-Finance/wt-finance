# WORKING-CONTEXT — Janus

Última atualização: 2026-07-28 (18h30) · v5.3.2 MERGEADA (#197, 16h26) — Reformulação do Harness em produção; worktree e branch limpas

> Verdade atual do projeto em UMA página. Toda sessão nova lê este arquivo antes de
> explorar o repositório (o hook `contexto-sessao` o injeta automaticamente; se o hook
> faltar, ler manualmente). Atualizado como parte do out-briefing de TODA versão/patch (DoD).
> Manter curto: o que mudou de verdade, não histórico — histórico é o CHANGELOG.

## Verdade atual

- Versão em produção (main): **`5.3.2`** (#197 mergeado 28/07 às 16h26) — **o HARNESS NOVO REGE
  a partir de agora** (ADR-0157, sem migrations, nada muda nas telas): CLAUDE.md **518 → 162
  linhas** (core) + **9 skills internas** + **3 rituais** (`/nova-versao`, `/fechamento-versao`,
  `/pos-merge`) + agentes com "Skills a ler" + **`verificador-visual`** (MCP Playwright em
  `.mcp.json`) + 2 skills externas vendoradas + permissões da terceira camada APLICADAS pelo Yan
  no settings global. Provas: inventário sem órfãos (`docs/harness/inventario-claude-md.md`),
  sonda de disparo (`docs/harness/sonda-disparo.md`), baseline −45,6% na porção do projeto.
  Out-briefing: `docs/briefings/WT_Finance_Out_Briefing_v5-3-2_Reformulacao_Harness.md` (a seção
  "o que muda para a próxima sessão" é leitura obrigatória da 1ª sessão nativa). Nenhuma branch
  de versão ativa — worktree e branch da v5.3.2 já limpas (`/pos-merge` executado).
- A v5.3.1 fechou a adaptação do modelo da controladoria na DRE: Resumo Executivo (ancorado no
  ANO CORRENTE — não acompanha a pill de ano, é intencional) + Decomposição por BLOCO da
  estrutura viva (pills próprias dentro do card). Migration 0209 aplicada e verificada; 493
  testes verdes.
- Último ADR registrado: **`0157`** (reformulação do harness). Próximo livre: 0158.
- ⚠️ **Aditiva nova ainda precisa de `--aditiva --fora-de-ordem`** + cópias untracked das
  0950–0954 (o `/nova-versao` já as posiciona; removidas antes do merge). **Próxima migration
  livre: `0210`.**
- **Vercel (infra, standing):** deploy de repo privado de org exige plano Pro — pendência de
  billing do Yan, herdada da v5.2.0.

## Bloqueios vigentes

- **Validação do allow em sessão CLI interativa** (residual da v5.3.2): confirmar que `npm run
  lint` e `db:migrate -- --aditiva` passam SEM consulta ao classificador na primeira sessão
  interativa do Yan (validação headless já exercitada no pós-merge; se não valer no interativo,
  suspeito registrado: issue #18846 do Claude Code).
- **[ALTO, achado do verificador-visual na estreia] Fontes Avenir quebradas em telas
  não-autenticadas:** o `proxy.ts` intercepta `/fonts/avenir/*.otf` (307 → HTML do login) e a
  tipografia cai para fonte de sistema no `/login` (e provavelmente `/solicitar-acesso`,
  `/trocar-senha`). Correção provável: isentar `/fonts/*` no matcher. Fora do escopo da v5.3.2
  — candidata a patch próprio.
- **Conceder a área `financeiro/dre` às roles** no editor de acessos (herdado da v5.3.0). Sem
  isso a aba do Demonstrativo existe mas só admin a enxerga.
- **Conferir o Resumo Executivo contra a planilha da controladoria** (do Yan; contra a tabela já
  está provado).
- **Decisões de produto abertas na DRE:** centavos na barra; posição do "Editar estrutura";
  3 blocos do seed em CAIXA ALTA (ajuste é no editor da estrutura, não em código); vencidos em
  aberto no Total do ano; convenção do Δ% do Consolidado (denominador em módulo).
- **Órfão de documentação:** commit `b869bb9` (relatório delta DRE×Monde + errata) vive só em
  `origin/docs/investigacao-dre-competencia-monde` e na worktree `investigacao-dre-monde`.
  Decidir: PR próprio ou descarte. **Não remover essa worktree antes de decidir.**
- **Faturamento roda em MODO TESTE** — flip de produção é decisão do Yan (dupla trava construída).
- **Virada Monde APLICADA (v5.1.4):** 7 funções PURA-mv no espelho; upload ainda é a única fonte
  de `get_mix_produto`/`get_cagr` e das telas de Weddings. **NÃO parar o upload** (Scope B resolve).
- **`SMTP_*` na Vercel** — sem eles, notificações por e-mail degradam em silêncio.
- **% Rec no Cadastro de Metas** — alvos nascem vazios; cards mostram "—" até o Yan digitar.
- Favicon/símbolo Janus adiado (reprovado no gate de legibilidade 16/32px).

## Filas ativas (próximos passos já decididos)

- **Piloto do harness novo (prova 3):** a primeira versão de produto subsequente roda nativa no
  harness da v5.3.2 (abrir com `/nova-versao`); rollback trivial = revert do CLAUDE.md/skills.
- **Ambiente (recomendações da v5.3.2, ação do Yan):** desativar o plugin **superpowers
  duplicado** (projeto v5.1.0; o global 6.2.0 fica) — ele induz disparo-em-bloco das skills;
  limpar allows amplos/efêmeros do `.claude/settings.local.json` (`Bash(npx supabase *)`,
  `Bash(node *)`, PIDs).
- **v5.4.0 (PR #191) DESTRAVADA** — no merge dela: renumerar `0950–0954` → **`0210–0214`** +
  `migration repair`; aí o passo 4 do `/nova-versao` (cópias) morre (bloco já marcado).
- **Fuso das pills de período (candidato REAL):** `resolverPeriodoCompleto` (`src/lib/periodo.ts`)
  não ancora em `hojeSP()` — runtime em UTC vira "Este mês/ano" antes da hora (~21h SP).
  Transversal (Fluxo de Caixa e DRE).
- **Limpeza de RPC órfã:** `get_decomposicao_grupo`/`get_decomposicao_categoria` sem consumidor
  vivo desde a v5.3.1. DROP exige verificação de consumidores reais (app E `supabase/seed/`).
- **v5.3.x refino da DRE:** drag-and-drop no editor; guarda de saída; divisão ver/editar da
  permissão; mover `historico-alteracoes` para `shared/`; Consolidado — conjunto de linhas vem
  do ano da URL (produto).
- **Monde — Scope B (aposentar o upload):** fato/mv item-level + repontar as 6 funções restantes.
- **Saúde da sincronização Monde:** detectar falha SILENCIOSA (200 sem vendas).
- restore-test COMPLETO do backup-gate (follow-up ADR-0116) · `CRON_SECRET` constant-time (BAIXO).
- Casos de contrato pendentes: `solicitar_acesso_admin`, `monde_ingest_status`.
- Tokenização do `zinc` + hex intermediários das paletas da Decomposição (vão em `style={{}}`).
- Consolidação das 3 pills de período (`PeriodoFilterPillsUrl` → `PILL_FILTRO`).
- Metas por Vendedor — próxima capacidade planejada (escopo a confirmar).
- Dependabot: 19 vulnerabilidades no default branch (10 high) — triagem pendente.

## Cuidados desta fase (o que uma sessão nova precisa saber AGORA)

- **O harness novo REGE a partir do merge da v5.3.2:** CLAUDE.md é core (162 linhas); o
  situacional está nas **skills** (`.claude/skills/` — ler a do domínio ANTES de implementar);
  procedimentos são **rituais** (`/nova-versao`, `/fechamento-versao`, `/pos-merge`). Delegação
  a subagente leva o campo **"Skills a ler"**. Gates escalonados: tsc+lint por missão;
  build+test por fase/fechamento. Fronteira de fase = estado em disco + `/clear`.
- **Terceira camada CONFIGURADA:** o settings global do Yan agora tem `allow` estreito (gates,
  git/gh, 2 invocações aditivas do db:migrate, `mcp__playwright`) e `deny` do `db push` cru.
  Bloqueio inesperado → **protocolo D5** (5 passos, no core). A validação a quente está pendente
  da 1ª sessão CLI (ver Bloqueios).
- **Hooks ATIVOS** (protecao-config 6 alvos incl. settings global / gate-stop /
  contexto-sessao) — detalhes no core §Salvaguardas.
- **Versão que toca UI:** despachar `verificador-visual` após gates e revisores (`next dev` é
  do orquestrador; tela autenticada exige credencial de teste na delegação).
- **Protocolo de revisão:** `revisor` (sempre) e `revisor-db` (se migration/RPC) ANTES dos
  gates. Na v5.3.1 cada um pegou um ALTO real; na v5.3.2 o verificador-visual pegou o ALTO das
  fontes Avenir na estreia.
- **RPC que já existe pode ter a SEMÂNTICA errada — MEÇA antes de reusar** (skill banco-e-rpc);
  dois números lado a lado na mesma tela = caso de contrato.
- **A DRE tem DOIS recortes independentes na mesma seção** (o `?ano=` da tabela e as pills da
  Decomposição) — é de propósito. **Estrutura da DRE é DADO** (`dre_bloco`/`dre_categoria_map`;
  Receita Bruta é `RB_H`/`tipo:'blocoH'`, não `'tot'`). **Diário/undo é genérico** (molde
  `dre_estrutura_*`, 0206).
- `monde.*` é a fonte viva das telas executivas/Metas; Weddings/mix/CAGR ainda vêm do upload.

---
Regra de manutenção: item resolvido SAI (não é log). Aprendizado permanente NÃO fica
aqui — vai para o CLAUDE.md/skills pela régua de 5 destinos (core §Manutenção).
