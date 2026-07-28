# Inventário sem órfãos — migração do CLAUDE.md (v5.3.2 / M5)

> **Método.** Tabela por faixas de linhas do `CLAUDE.md` da v5.3.1 (518 linhas, commit `3e1af12`),
> cobrindo **100% das linhas** (faixas inclusivas; linhas em branco e separadores `---` pertencem
> à faixa do bloco que encerram). Cada faixa recebe um destino da régua de 5:
> **core** (CLAUDE.md novo) · **skill:<nome>** (`.claude/skills/`) · **ritual:<nome>**
> (`/nova-versao`, `/fechamento-versao`, `/pos-merge`) · **hook-permissão** (enforcement mecânico
> já existente ou criado nesta versão) · **deletar** (só com o enforcement que cobre apontado).
> Conteúdo pode ser **comprimido** no destino, nunca omitido — precedentes "custou caro" viajam junto.
> Um bloco pode ter destino secundário (cross-link); o primário é onde o texto integral vive.

## Tabela de destinos

| Linhas | Bloco | Destino primário | Secundário / observação |
|---|---|---|---|
| 1–8 | Cabeçalho e identidade (Janus, escopo do arquivo) | core §1 | Reescrito; briefing agora é `.md` (D-01) |
| 9–24 | Manutenção do documento vivo (critério das 3 condições, teste rápido) | core §8 | Critérios preservados; régua de destino vira **régua de 5** (D-03) |
| 25–30 | "Manter denso, não só crescer" (podar; PR revisa) | core §8 | — |
| 31–37 | Stack | core §1 | — |
| 38–53 | Comandos essenciais (+ "não inventar `npm run typecheck`") | core §2 | — |
| 54–65 | Banco/Comandos: `db:migrate --aditiva/--destrutiva`, `migration list`, `npx supabase` | core §5 | Detalhe operacional completo → skill:banco-e-rpc |
| 66–67 | ⚠️ `db push` empurra TODO o pending (custou caro v5.2.0) | core §5 | Regra "não escrever destrutiva antes da hora" fica no core (barreira); narrativa completa → skill:banco-e-rpc |
| 68–84 | Produção direta sem staging + backup-gate (ADR-0116, decisão de branching) | skill:banco-e-rpc | core §5 resume em 2 linhas (produção direta; gate é REDE, não autorização) |
| 85–89 | Migration ADITIVA — regime autônomo + declaração prévia | core §5 | Condicionada ao `allow` do settings (M3/terceira camada); detalhe → skill:banco-e-rpc |
| 90–97 | Migration DESTRUTIVA — confirmação humana; consumidores reais antes de DROP | core §7 (barreira dura) | Procedimento e precedente v4.17.1 → skill:banco-e-rpc |
| 98–110 | Confirmação no WRAPPER, EOF aborta (ADR-0131) + tokenizer `classificar.mjs` | skill:banco-e-rpc | core §7 mantém 1 linha ("agente não aplica destrutiva por construção") |
| 111–117 | Schema `analytics` não exposto (PGRST106 → RPC SECURITY DEFINER) | skill:banco-e-rpc | — |
| 118–134 | Fonte das vendas: espelho Monde × upload fallback (v5.1.4/ADR-0151, repoint 0181, pg_cron) | skill:banco-e-rpc | Seção "mapa de fontes de dados"; `get_mix_produto`/`get_cagr`/Weddings ainda upload |
| 135–147 | `dim_data` range fixo — FK + recovery trio | skill:banco-e-rpc | Cross-link em skill:ingestao-planilhas (sintoma aparece no upload) |
| 148–169 | `statement_timeout` por role — rolconfig via PostgREST; timer no statement externo | skill:banco-e-rpc | Orçamento de 8s também no checklist do revisor-db (inline, D-12) |
| 170–173 | Fuso: app roles SP; `postgres` (migrations/seed) UTC | skill:banco-e-rpc | Exibição `fmtDataSP` → skill:ui-design-system (cross-link mútuo) |
| 174–176 | Auth/RBAC — enforcement em 4 camadas (visão geral) | skill:banco-e-rpc | Abertura da seção RBAC da skill |
| 177–178 | Senha provisória / troca no 1º acesso / solicitar-acesso | skill:contrato-rpc-front | Fluxo de superfície do app (requireArea/portão) com o lado RPC em banco-e-rpc |
| 179–180 | Sessão→banco (`getServerClient` assíncrono, timeout 8s, `proxy.ts`) e guards em toda superfície (`requireArea*`) | skill:contrato-rpc-front | "Rota nova nasce protegida" também na descrição de gatilho |
| 181–183 | RPC exposta: `exigir_acesso` INLINE (não wrapper `__nucleo`), REVOKE/GRANT explícitos, default privileges (0122), RLS deny-by-default | skill:banco-e-rpc | Checklist espelhado inline no revisor-db (exceção D-12) |
| 184 | `coalesce(..., false)` em predicado anulável (vazamento v4.16.0) | skill:banco-e-rpc | Também inline no revisor-db |
| 185–186 | Janela anon ENCERRADA (ADR-0114) + kill switch de emergência | skill:banco-e-rpc | — |
| 187–188 | Magic link em 2 passos (nunca consumir token em GET); SMTP próprio | skill:contrato-rpc-front | Precedente v4.13.1 preservado; e-mail de convite → skill:email cross-link |
| 189–195 | Convenções de migration (numeração, SECURITY DEFINER, max_rows 1000, subagente NÃO aplica) | skill:banco-e-rpc | "Subagente recebe número e não aplica" também na skill:orquestracao |
| 196–202 | Verificação pós-push via REST (curl service_role) | skill:banco-e-rpc | — |
| 203–217 | RPC com semântica errada — MEÇA antes de reusar (v5.3.1, R$ 4,3 Mi) | skill:banco-e-rpc | Corolário "igualdade vira caso de contrato" → skill:contrato-rpc-front |
| 218–221 | REST service_role EXECUTA o corpo; `db query` não substitui (max(uuid) v5.2.1) | skill:banco-e-rpc | — |
| 222–243 | Regime de trabalho (autonomia default + 3 invariantes + checkpoints) | core §3 | Integral, condensado |
| 244–252 | Workflow §1 Recebimento (WORKING-CONTEXT, briefing, confirmar escopo) | core §4 + ritual:nova-versao | Rotas A/B/C novas (D-02) entram aqui |
| 253–258 | Workflow §2: pesquisar antes de codar; paralelização proativa | core §4 | Doutrina curta no core; mecânica → skill:orquestracao |
| 259–261 | Compactação estratégica `/compact` | **deletar (substituído)** | D-05: `/clear` + re-ancoragem em disco na fronteira de fase — texto novo no core §4 |
| 262–266 | Commits um-por-missão, gates por missão, progresso pelo chat | core §4 | Gates viram ESCALONADOS (D-04): tsc+lint por missão; build+test por fase/fechamento |
| 267–274 | Workflow §3 Revisão (revisor/revisor-db antes dos gates) | skill:orquestracao | core §4 menciona em 1 linha; detalhe do protocolo na Carta |
| 275–281 | Workflow §4–5 Confirmação e correções | core §3 | Já coberto pelo regime (checkpoints exceção) |
| 282–290 | Workflow §6 Out-briefing (DoD, WORKING-CONTEXT, CHANGELOG_DIRETORIA com data real, worktrees) | ritual:fechamento-versao | Regra da data real do CHANGELOG_DIRETORIA preservada integral no ritual |
| 291–296 | Workflow §7 PR; NUNCA merge/deploy | core §7 (barreira) + ritual:fechamento-versao | — |
| 297–307 | Subagentes: modelos por camada (orquestrador não fixado; Sonnet nos agentes) | skill:orquestracao | core §6 resume (Fable recomendado, D-13) |
| 308–329 | Agentes nomeados (explorador/implementador/revisor/revisor-db) | skill:orquestracao | Os próprios agentes ganham "Skills a ler" (M10); verificador-visual novo (M11) |
| 330–341 | Protocolo de delegação (4 partes, autocontida, produto sobe) | skill:orquestracao | — |
| 342–351 | Protocolo de revisão (paralelo, CRÍTICO/ALTO antes dos gates) | skill:orquestracao | — |
| 352–367 | Regras de paralelização (editores puros; orquestrador serializa git/build/banco) | skill:orquestracao | Regra dura repetida no core §7 (barreira: subagentes não rodam git/build/banco/servidor) |
| 368–382 | Worktrees: criar + symlinks + .temp | ritual:nova-versao | Inclui cópias 0950–0954 (bloco marcado p/ remoção na renumeração) e commit do briefing |
| 383–392 | Worktrees: consolidar (gates + commits + push) | ritual:fechamento-versao | — |
| 393–403 | Worktrees: limpar após merge | ritual:pos-merge | + `git pull --ff-only` na raiz (feedback registrado) |
| 404–412 | Hook `protecao-config` | core §7 (M3) | Escopo REAL corrigido: 6 alvos incl. `.claude/hooks/` e `settings.json` (global inclusive); escape inalcançável pelo agente |
| 413–417 | Hook `gate-stop` | core §7 (M3) | — |
| 418–426 | Hook `contexto-sessao` + escape geral | core §7 (M3) | Nova subseção "terceira camada" (classificador + allow) e protocolo D5 entram junto |
| 427–439 | ADRs (numeração real, não confiar no briefing) | ritual:fechamento-versao | core §7 mantém a linha "não confiar na numeração do briefing" |
| 440–444 | DS: tokens, cores semânticas fixas, Card shadow-sm | skill:ui-design-system | — |
| 445 | `[var(--token)]` nunca `[--token]` (81 ocorrências, v4.16.1) | skill:ui-design-system | Custou-caro preservado; sem enforcement de lint (é o gate-stop que varre `-[--token]`) → hook-permissão cobre o sintoma, skill explica a causa |
| 446 | Cor é SEMPRE token (lint `wt/no-cor-hardcoded`) | skill:ui-design-system | Enforcement JÁ mecânico (lint); a skill guarda o mapa de tokens/utilitárias e as exceções (zinc, email) |
| 447 | Primitivos de `ui/` (Button/Input/Badge/Tabs/Tooltip; pills) | skill:ui-design-system | — |
| 448–449 | Respiro do `<main>` (fonte única) + único scroll container (`scrollbar-gutter`) | skill:ui-design-system | — |
| 450 | `<ScrollAutoHide>` em todo rolável interno | skill:ui-design-system | — |
| 451 | `loading.tsx`/skeleton + `startTransition` + promise/Suspense (ADR-0144) | skill:react-padroes | Receita visual do skeleton → skill:ui-design-system (cross-link) |
| 452 | Versionamento X.Y.Z (ADR-0084) | ritual:fechamento-versao | — |
| 453 | Upload/parse → API Route, não Server Action | skill:ingestao-planilhas | — |
| 454 | E-mail: camada única fallback-safe, CID, tabelas, marca interna/externa (ADR-0127/0145) | skill:email | — |
| 455 | Ação externa IRREVERSÍVEL → modo teste fail-closed (ADR-0140) | skill:email | core §7 ganha 1 linha (padrão vale para qualquer integração irreversível) |
| 456 | Parse grande no cliente → Web Worker (v4.20.2) | skill:ingestao-planilhas | — |
| 457 | Excel: `Date` nativo da célula (`cellDates`/`raw: true`) (ADR-0099) | skill:ingestao-planilhas | — |
| 458 | Coerção canônica `coercao.ts` (lint `wt/no-coercao-reimpl`) | skill:ingestao-planilhas | Enforcement JÁ mecânico (lint); skill guarda o "como estender" (oráculo congelado) |
| 459 | Parser único de Vendas + pipeline atômico (ADR-0111) | skill:ingestao-planilhas | RPCs do pipeline → cross-link banco-e-rpc |
| 460 | `database.ts` congelado → helper de tipagem frouxa p/ RPC nova | skill:contrato-rpc-front | — |
| 461 | RPC do Supabase é *thenable*, não Promise (`.catch()` estoura) | skill:contrato-rpc-front | Custou caro v5.3.0 |
| 462 | Schema de `parseRpc` reflete retorno REAL (`.optional()`; caso em rpc-contrato) | skill:contrato-rpc-front | — |
| 463 | Config nova atravessa 5 camadas (ADR-0118) | skill:contrato-rpc-front | — |
| 464 | Casas decimais por contexto (`fmtBRL2` × `fmtMi`/`fmtAxisBRL`) | skill:ui-design-system | Eixos de gráfico → skill:graficos (cross-link) |
| 465 | `<ValorContabil>` em tabela financeira densa (ADR-0124) | skill:tabela-densa | — |
| 466 | Cabeçalho de tabela + receita sticky completa (`border-separate`, rowSpan, min-w) | skill:tabela-densa | Custou-caro ×2 (v4.34.1, v5.3.0) preservados |
| 467 | Timestamptz → SP via `Intl` (`fmtDataSP`), nunca split | skill:ui-design-system | Caso fronteiriço decidido: EXIBIÇÃO na ui-design-system; parse (`toIsoDate`) na ingestao-planilhas; fuso do banco na banco-e-rpc — cross-links mútuos |
| 468 | Gráficos → primitivos `@/components/charts` (ADR-0095) | skill:graficos | — |
| 469 | Paleta canônica por contexto (ADR-0103): séries, cash-flow, subsetor/setor | skill:graficos | Telas de plataforma neutras (`--action-*`, `.foco-neutro`, pill bege) → skill:ui-design-system (split por contexto) |
| 470 | Card KPI clicável (`.card-clicavel`) | skill:ui-design-system | — |
| 471 | `eslint-plugin-react-hooks` v7 — padrões canônicos sem mudar comportamento | skill:react-padroes | — |
| 472–479 | Responsividade (cards h-full, tabelas estreitas, eixo Y, sticky no ListDrawer) | skill:ui-design-system | Tabela estreita → tabela-densa; eixo → graficos (cross-links) |
| 480–501 | Definition of Done (checklist) | ritual:fechamento-versao | core §4 aponta o ritual; itens continuam TODOS vivos no ritual |
| 502–510 | Salvaguardas — barreiras duras | core §7 | Integral (merge/deploy, destrutiva, auto-auditoria, editores puros, produto) |
| 511–518 | Salvaguardas — disciplina | core §7 | Integral (config de gate, escopo, consumidores reais, worktree, add -A, numeração, addendum→patch) |

## Prova de cobertura

- Faixas contíguas de 1 a 518, sem lacuna nem sobreposição — **verificado mecanicamente**
  (cada faixa começa onde a anterior termina + 1; as 11 linhas em branco entre blocos foram
  absorvidas pela faixa do bloco que encerram, conforme o método declarado — correção do
  parecer do checkpoint 2).
- **Deleção seca: apenas 1 bloco** (259–261, `/compact` estratégico), substituído por decisão
  explícita do briefing (D-05) com texto novo no core §4 — não é perda, é troca deliberada.
- Blocos com enforcement mecânico já existente (446 lint cor, 458 lint coerção, 413–417 gate-stop)
  **permanecem documentados** no destino (a skill explica a causa e o conserto; o lint/hook segura a
  recorrência) — nenhum foi deletado só por ter lint.
- Nenhuma barreira dura sai do core: todas as linhas de 502–518 têm destino core §7.

## Destinos — resumo quantitativo

**Regra de contagem (correção do parecer do checkpoint 2):** cada bloco conta UMA vez, no seu
**destino primário** (3ª coluna); destinos secundários/cross-links (4ª coluna) não contam.
Blocos com primário composto ("core §X + ritual:Y") contam no primeiro destino declarado.
`hook-permissão` não é categoria de contagem: os blocos cujo enforcement já é mecânico
(445/446 → lint `wt/no-cor-hardcoded`; 458 → lint `wt/no-coercao-reimpl`; 413–417 → hook
`gate-stop`) contam no destino primário onde ficaram documentados (skill/core), com o
enforcement anotado.

| Destino primário | Blocos |
|---|---|
| core (8 seções novas) | 20 |
| skill:banco-e-rpc | 15 |
| skill:contrato-rpc-front | 7 |
| skill:ui-design-system | 10 |
| skill:tabela-densa | 2 |
| skill:graficos | 2 |
| skill:react-padroes | 2 |
| skill:email | 2 |
| skill:ingestao-planilhas | 5 |
| skill:orquestracao | 6 |
| ritual:fechamento-versao | 5 |
| ritual:nova-versao | 1 |
| ritual:pos-merge | 1 |
| deletar (substituído por decisão D-05) | 1 (259–261) |
| **Total** | **79 = nº de linhas da tabela** |
