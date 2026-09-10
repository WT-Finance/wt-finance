# D8 — Documentação

Explorador D8 (Sonnet, read-only) por inventário de `docs/` + grep de citação em `CLAUDE.md`, `.claude/**`,
`README.md`, `docs/**`. Skills lidas: `orquestracao` + 7 das 9 de domínio (`ingestao-planilhas` e
`react-padroes` parcial — ver D8-021). Formato: `README.md` desta pasta. Regra 4 do briefing: ADRs
supersedidos FICAM (só marcador); docs pré-v5 SAEM com grep antes.

| id | achado | evidência | risco | esforço | ação proposta | classe | triagem | nota |
|---|---|---|---|---|---|---|---|---|
| D8-001 | `docs/briefings/`: 13 PDFs de dashboard v1–v3.8 (pré-produto atual) sem citação em CLAUDE.md/skills/README | `docs/briefings/WT_Finance_Briefing_Dashboard_v1..v3-8.pdf`; grep `Dashboard_v1\|_v2\|_v3\b` em CLAUDE.md/.claude/**/README.md/docs/**: 0 hits | baixo | S | apagar os 13 PDFs (Yan tem cópia) | apagar | | |
| D8-002 | `docs/briefings/`: 76 briefings/out-briefings v4.x (v4-0 a v4-40) — só `WT_Finance_Out_Briefing_v4-17-1.md` tem citação (skill `banco-e-rpc` §1 cita "v4.17.1" como VERSÃO, não o arquivo por caminho) | grep `v4-17-1\|Out_Briefing_v4` em `.claude/skills/**`: 1 hit textual; os outros 75 sem grep de caminho | baixo | S | apagar os 76 (a citação é por número de versão, sobrevive sem o arquivo) | apagar | | |
| D8-003 | `docs/briefings/`: 4 PDFs v3.5–v3.8 (`WT_Finance_Briefing_v3-5..v3-8.pdf`, `Out_Briefing_v3-5-m8.pdf`) e out-briefings `.md` v3-7/v3-8/v3-10 — sem citação | grep `v3-5\|v3-6\|v3-7\|v3-8\|v3-10` em CLAUDE.md/.claude/**/README.md: 0 hits (fora do `docs/adr/v3-6-apendice.md`, que é ADR) | baixo | S | apagar (7 arquivos) | apagar | | |
| D8-004 | `docs/briefings/`: 71 briefings/out-briefings/specs/anexos v5.x — dentro da janela viva; `briefing-v5-10-0-limpeza-fechamento-v5.md` é o briefing ATIVO | grep `v5-` em WORKING-CONTEXT.md: múltiplos hits | baixo | S | manter todos (regra 4: só pré-v5 sai) | documentar | | |
| D8-005 | `docs/audits/` (9), `docs/investigacoes/` (6+1 json), `docs/superpowers/` (3), `docs/harness/` (2) são pré-v5 (2026-05 a 2026-08) e nenhum é citado fora da própria pasta | grep pelos basenames em CLAUDE.md/.claude/skills/**/README.md: 0 hits para os 21 arquivos | médio | M | ler cada um antes de apagar (auditorias podem conter achado ainda não resolvido — cruzar com `backlog-v6` antes de descartar); `docs/investigacoes/2026-08-04-metas-subsetor*` é citado por D2-007 | decidir | | |
| D8-006 | `docs/faturamento-legado/` (6 scripts py/R do processo manual pré-Asaas) — sem citação; suplantado pelas Fases 1–4b de Faturamento (v4.30–4.37) | grep `faturamento-legado` em CLAUDE.md/docs/**: 0 hits fora da pasta | baixo | S | apagar (ou mover para arquivo pessoal do Yan) | apagar | | |
| D8-007 | `docs/runbooks/` (5): `db-backup-gate-runbook.md` (CLAUDE.md, skill `banco-e-rpc`) e `v4-13-auth-runbook.md` (skill, kill switch) citados; `v4-15-upload-vendas`, `v4-24-email`, `v4-16-solicitacoes` sem citação fora da pasta e possivelmente desatualizados (pipeline mudou na v5.1.4) | grep dos 5 basenames em CLAUDE.md/.claude/skills/**: 2/5 citados | baixo | S | manter os 2 citados; avaliar os 3 restantes (atualizar × apagar) | decidir | | |
| D8-008 | `README.md` (269 linhas) descreve versão **5.0.0** ("Estado atual (julho/2026)"); produção real é **v5.9.6** | `README.md:7`; WORKING-CONTEXT.md:3 | baixo | M | reescrever (Fase 2, entrega do briefing) | corrigir | | |
| D8-009 | `README.md` abre como "# WT Finance", contradizendo o próprio corpo ("internamente a plataforma se chama Janus") | `README.md:1-9` | baixo | S | reescrever título/abertura | corrigir | | |
| D8-010 | `README.md` tabela de áreas não lista `/financeiro/dre` (v5.8.0+) nem `/metas/tv` (v5.1.0); "Metas" ainda rotulada "Novo (v5.0.0)" | `README.md:24-30` | baixo | S | reescrever tabela de áreas | corrigir | | |
| D8-011 | `README.md` stack cita versões específicas (Next 16.2.9, React 19.2.4) — conferir contra `package.json`/D6 na reescrita | `README.md:41-46` | baixo | S | conferir na reescrita | corrigir | | |
| D8-012 | `docs/WORKING-CONTEXT.md` (1.240 linhas): histórico narrativo empilhado por versão, nenhuma seção de "estado" separada do "como chegamos aqui" | `docs/WORKING-CONTEXT.md:1-60` | médio | L | dividir: `docs/estado-do-projeto.md` (arquitetura/módulos/decisões vigentes/convenções — documento novo do briefing) + `WORKING-CONTEXT.md` enxuto (em voo, pendências do Yan, próximo passo, migration/ADR livres) | simplificar | | |
| D8-013 | `docs/design-system.md` cabeçalho diz "WT Finance — Design System, Versão 4.26 · Jun 2026", mas o corpo documenta convenções até v5.9.3 — cabeçalho mente sobre a atualidade | `docs/design-system.md:1-3` vs `:22-39` | baixo | S | corrigir cabeçalho (Janus, versão/data reais) | corrigir | | |
| D8-014 | Página viva `/admin/design-system` tem 12 seções (Brand, Dessaturada, Subsetores, Tipografia, Cards, Pills, Tabelas, Gráficos, Drawers, Componentes, Plataforma, Layout de Página); `docs/design-system.md` não tem blocos para Dessaturada, Subsetores, Pills, Drawers, Componentes, Plataforma | `src/app/admin/design-system/page.tsx:22-42` vs headings de `docs/design-system.md` | baixo | M | decidir: espelhar as seções da página ou deletar o `.md` em favor de "a página é a única referência" (ADR de fechamento) | decidir | | |
| D8-015 | Tokens citados em `docs/design-system.md` (`--text-subtle`, `--warning-deep`, `--gestao*`) existem em `src/styles/tokens.css` — nenhuma divergência na amostra | `src/styles/tokens.css:9,39,61-63` | baixo | S | nenhuma | documentar | | |
| D8-016 | ADR máximo real = **0172**; `docs/adr/v3-6-apendice.md` é o único fora do padrão `NNNN-slug.md` | `docs/adr/0172-*.md`; `docs/adr/v3-6-apendice.md` | baixo | S | renomear/numerar o apêndice ou documentar a exceção | decidir | | |
| D8-017 | ADR-0158/0159/0160/0161 já têm o marcador "Supersedido por ADR-0172" — regra 4 cumprida neste grupo | `docs/adr/0158-*.md:7` … `0161-*.md:7` | baixo | S | nenhuma | documentar | | |
| D8-018 | ADR-0031/0036/0037 têm marcador desde a ADR-0055; grep de `supersed\|substitui\|revoga\|Emenda` dá 42 arquivos — amostra de ~8 conferida, nenhum status pendente; os demais ~34 não conferidos linha a linha | `docs/adr/0031-*.md:3`, `0037-*.md:3`; grep completo | baixo | M | varredura completa dos 42 na Fase 2 (marcar os que faltarem) | decidir | | |
| D8-019 | Gaps de numeração ADR (0003–0004, 0013, 0019–0025…) nunca existiram — numeração histórica não-sequencial, não resíduo | globs `docs/adr/000[1-9]*`, `001[0-9]*` | baixo | S | nenhuma | documentar | | |
| D8-020 | Skills amostradas (7 de 9) tiveram claims verificáveis conferidos contra o repo e **nenhuma lição falsa/obsoleta** foi encontrada: `rpc-metas.ts`, `reverter-diario.test.ts`, `sonda-teste-escreve-banco.test.ts`, `ciclo-de-vida.test.ts`, `rpc-contrato.test.ts`, `dre-oracle.mjs`, migration `0268`, `cabecalho-pagina.test.ts`, `gatilho-ajuda.test.ts` existem como descrito | Glob 9/9 | baixo | S | nenhuma nesta amostra | documentar | | |
| D8-021 | Skill `ingestao-planilhas` (e parte de `react-padroes`) não verificada — timebox esgotado no item 6 | — | médio | S | verificar na Fase 2 antes de fechar o invariante 4 | decidir | | |
| D8-022 | `CLAUDE.md` 165/180 linhas; regra "não usar `git add -A`" (§Disciplina) não tem hook — candidata a enforcement (régua item 1) e poda da prosa | `CLAUDE.md:114-123` | baixo | M | avaliar PreToolUse hook para `git add -A`/`-a` | decidir | | |
| D8-023 | `docs/changelog.md` e `docs/bugs-resolvidos.md` já se autodeclaram legado/congelado desde v4.12 e apontam para `CHANGELOG.md`/out-briefings — não há duplicidade real | `docs/changelog.md:1-6`; `docs/bugs-resolvidos.md:1-8` | baixo | S | manter | documentar | | |

## Síntese

`docs/briefings/` concentra o maior resíduo: **96 arquivos pré-v5** (13 PDFs de dashboard, 7 v3.x, 76 v4.x), nenhum citado por caminho fora da própria pasta (a única citação, `v4.17.1`, é por número de versão). `README.md` está desatualizado de forma concreta e localizada (versão 5.0.0, nome, tabela de áreas). `docs/design-system.md` tem cabeçalho que mente sobre a própria atualidade e cobre menos seções que a página viva, mas os tokens batem. `WORKING-CONTEXT.md` é quase todo histórico — confirma o `estado-do-projeto.md` da Fase 2. ADRs supersedidos seguem a convenção da ADR-0055 nas amostras. As 7 skills verificadas não produziram nenhuma lição falsa — ao contrário do precedente v5.9.5.

## Contagem por classe

apagar 4 · corrigir 5 · simplificar 1 · documentar 6 · decidir 7 — **total 23**.

## Achei, não vou agir

- Varredura completa dos 42 hits de "supersed/substitui/revoga/Emenda" em `docs/adr/` (D8-018).
- Skill `ingestao-planilhas` não lida (D8-021).
- Conteúdo integral de `docs/audits/` e `docs/investigacoes/` (15 arquivos) não lido — só existência e ausência de citação (D8-005).
- `README.md` lido só até ~linha 80 — a reescrita deve ler inteiro contra o repo.
- Comparação seção-a-seção completa `docs/design-system.md` × página viva (D8-014).

## Riscos fora do escopo

- ADR-0172 (as-built da API Externa) — conferir na Fase 2 se ainda bate com o código (nenhuma divergência óbvia notada).
- `docs/design-system.md` documenta `--warning` como reprovando AA (2,29:1) e manda usar `--warning-deep` — regra de contraste em prosa em ≥ 2 lugares; se D9 achar `--warning` cru como tinta, é o mesmo achado em três dimensões.
