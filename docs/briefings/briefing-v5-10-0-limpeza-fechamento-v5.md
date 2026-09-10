# Briefing v5.10.0 — Limpeza de fechamento da v5

**Tipo:** MINOR · **Migrations:** definidas pela Fase 1 — esperadas **1 aditiva** (comentários, grants, `NOTIFY`) e **1 DESTRUTIVA** (drops de objetos órfãos), esta **por último**, em TTY do Yan, com backup-gate · **ADR:** **1 novo** — "Critérios de limpeza e fechamento da v5" (o que ficou, o que saiu, e por quê; fechar ao FINAL) · **Base:** `main` **após o merge da v5.9.6** · **Branch:** `chore/v5-10-0-limpeza-fechamento-v5` · **Rota A** · **FRENTE ÚNICA** — nenhuma outra versão em voo enquanto esta correr (toca o repositório inteiro)

> ## ⛔ GATE 1 — Triagem (entre as fases)
> A Fase 1 termina com o **Relatório de Auditoria** commitado e **PARA**. O Yan e o Chat triam cada achado em uma de três colunas — **agir agora · backlog v6 · descartar** — e o relatório triado, commitado de volta, **é a spec da Fase 2**. Nada da Fase 2 começa antes disso. Achado que não está em "agir agora" não é tocado.

> ## ⛔ GATE 2 — Destrutiva (fim da Fase 2)
> A única migration destrutiva é escrita **depois** que o código que referenciava cada objeto já saiu e foi **deployado**; fica fora de `supabase/migrations` até a hora; **PARA** para o TTY do Yan.

## Objetivo

Revisão geral e profunda do Janus — código, banco, testes, dependências, documentação, harness — em busca de erros, ineficiências, código morto e resíduo, para fechar a v5 com a base organizada e um **backlog v6 já triado**. A versão não muda o que a plataforma faz; muda o quanto dela é necessário. O que for grande demais para limpeza vira entrada do backlog, não escopo.

## Regras de contorno (inegociáveis)

1. **Limpeza não muda comportamento.** Refatoração só onde **remove** código ou complexidade, nunca onde reestrutura. Ineficiência que exige redesenho → backlog v6. Bug encontrado: corrige se for **local e coberto por teste**; senão → triagem.
2. **Toda exclusão exige prova de orfandade NO ATO** — grep de importadores/referências no momento de apagar (código, config, docs, migrations, skills, CLAUDE.md), registrado na mensagem do commit. Órfão de relatório não é órfão de fato; o relatório aponta, o commit prova.
3. **Migration aplicada é registro** — as 26x migrations não se editam, não se consolidam, não se apagam. Objeto órfão no banco sai por migration **nova**.
4. **ADRs supersedidos ficam** (são histórico); só ganham marcador. Briefings e docs **pré-v5** saem do repositório (o Yan tem cópia) — com grep antes, porque CLAUDE.md ou uma skill pode citá-los.
5. **Formato único de achado** na Fase 1 (abaixo). Explorador que entregar em formato próprio refaz.
6. **Timebox por dimensão.** "Achei, mas não vou agir" é saída legítima; investigação sem fim não é.

## Fase 1 — Investigação (exploradores em paralelo, um por dimensão)

**Formato único de achado** (uma tabela por dimensão, em `docs/auditoria-v5/<dimensao>.md`):
`id · dimensão · achado (uma frase) · evidência (caminho:linha, ou query e resultado) · risco (baixo/médio/alto) · esforço (S/M/L) · ação proposta · classe (apagar / corrigir / simplificar / documentar / decidir)`

**Método:** ferramentas mecânicas primeiro, leitura humana depois — grep não pega fragmento gramaticalmente órfão (comentário que descreve o que a função **fazia**). O relatório consolidado `docs/auditoria-v5/relatorio.md` agrega tudo com contagem por classe e as colunas vazias da triagem.

| Dimensão | O que procurar | Como |
|---|---|---|
| **D1 Código morto** | exports sem importador; componentes/hooks/schemas/constantes/utils não usados; wrappers de RPC sem chamador; rotas fora do `nav-model`; arquivos `.test` de módulos que já não existem | `knip` (ou `ts-prune`) + grep humano por candidato |
| **D2 Banco — objetos** | RPCs sem chamador no código (`pg_proc` × grep); tabelas/colunas/views sem consumidor; funções de versões antigas convivendo com as novas; triggers órfãos; constraints redundantes (modelo: `taxa_plausivel` ±100% ao lado da ±5%); grants a `anon`; cobertura RLS; **comentários de função desatualizados** (leitura humana obrigatória) | catálogo (`pg_proc`, `pg_class`, `pg_constraint`, `pg_trigger`, `information_schema.role_table_grants`) × `grep -rn` no código e em `rpc-contrato.test.ts` |
| **D3 Banco — desempenho** | índices nunca lidos; seq scans em tabelas grandes; recomputação por carregamento (`v_estado_atual` do patrimônio, `listar_ativos`); RPCs chamadas repetidas na mesma página (`/metas` carrega ~6 a mais desde a v5.6.1) | `pg_stat_user_indexes` (`idx_scan = 0`), `pg_stat_user_tables`, leitura dos `page.tsx` |
| **D4 Tipagem** | `database.ts` **congelado** — RPCs novas fora dele, origem dos `RpcFrouxa` e dos `as unknown as`; schemas Zod ausentes em chamadas de RPC | `supabase gen types` em arquivo temporário e diff contra o congelado; grep `RpcFrouxa`, `as unknown as`, `db.rpc(` sem `parseRpc` |
| **D5 Erros latentes** | `catch` mudo (classe v5.3.5); `Promise.allSettled` com índice **posicional** (a armadilha da DRE, duas vezes) → candidato a desestruturação nomeada; testes que auto-`skip` em silêncio (contar `skipIf`; a contagem da suíte cai sem ninguém ver); TODO/FIXME; `console.error` sem caminho de recuperação; `any` | grep + leitura |
| **D6 Dependências** | não usadas; desatualizadas (major pendente = candidato v6); vulnerabilidades; peso do bundle | `depcheck`, `npm outdated`, `npm audit`, `next build` com análise |
| **D7 Testes** | duplicados; lentos (tempo por arquivo); os que testam a **matriz** e não o **arquivo** (lição v5.5.2); **inventário dos que escrevem no banco** (convenção v5.9.6 — hoje 1, contar); flaky | `vitest --reporter=verbose` com tempos + leitura |
| **D8 Documentação** | `README.md` (desatualizado — reescrita é entrega da Fase 2); `docs/` pré-v5 (`WT_Finance_*`, guias antigos); `WORKING-CONTEXT.md` (o que nele é histórico e não estado); `design-system.md` × página `/admin/design-system` (divergências); `CLAUDE.md` ≤ 180 linhas; **lições nas 9 skills que já não descrevem a realidade** (precedente v5.9.5: deletar, não emendar); ADRs sem marcador de superseded que deveriam ter | leitura, com grep de citação antes de propor exclusão |
| **D9 Nomenclatura e resíduo** | "WT Finance"/`wt-finance`/`wt_finance` pós-rebranding (o repositório ainda se chama assim — **decidir na triagem**, renomear repo é ato seu); `zinc-*` restantes (~400 — só **contar e agrupar**, decisão é do backlog v6); prefixos/rótulos inconsistentes fora da DRE; nomes de arquivo fora do padrão | grep |
| **D10 Harness e config** | `scripts/` órfãos; `.claude/settings.json` × `~/.claude/settings.json` (regras mortas); `.mcp.json`; regras de lint locais sem uso; `.env.example` completo contra o que o código lê; hooks e sua cobertura real | leitura + grep dos alvos |

**Timebox sugerido:** D1–D7 uma sessão de explorador cada; D8–D10 meia. A sessão principal consolida.

**Entregáveis da Fase 1:** `docs/auditoria-v5/relatorio.md` (consolidado, com as colunas de triagem vazias) + os dez arquivos por dimensão + primeiro rascunho de `docs/backlog-v6.md` (tudo classificado como "grande demais" já vai direto para lá, com risco/esforço).

## Fase 2 — Aplicação (só do que a triagem marcou "agir agora")

Ordem **por risco**, cada bloco com gates:

1. **Código e arquivos** (git é a rede) — missões por dimensão, arquivos disjuntos, prova de orfandade em cada commit. Inclui a exclusão dos docs pré-v5 e a desestruturação nomeada dos `Promise.allSettled` posicionais **se** triada.
2. **Banco — aditiva** — uma migration: comentários de função corrigidos (do catálogo vivo), grants, `NOTIFY`. `revisor-db` antes.
3. **Deploy intermediário** — o código sem as referências aos objetos órfãos sobe para produção **antes** da destrutiva.
4. **Banco — destrutiva (GATE 2)** — uma única migration com todos os `DROP`; backup-gate; restore-test; TTY do Yan; verificação REST de que nada ficou 500.
5. **Documentação, por último, a partir do estado limpo:**
   - **`README.md`** reescrito: o que é o Janus; arquitetura em uma tela; stack; como rodar; estrutura de pastas; rituais (link para `CLAUDE.md`); estado (versão, migration, ADR); onde está cada coisa em `docs/`.
   - **`docs/estado-do-projeto.md`** — o documento que põe em dia um leitor (ou um Claude) novo **só pelo repositório**: arquitetura, módulos e suas fontes de verdade, decisões vigentes com link para o ADR, convenções da casa, mapa dos regimes (caixa × competência), integrações (Monde, BACEN, API externa), o que é canon e o que é método. Existe porque Project e memória do Chat **não são transferíveis entre contas**; o repositório é o único artefato portável.
   - **`docs/backlog-v6.md`** — versão final, triado.
   - **ADR novo** — critérios de limpeza aplicados, o que saiu (com contagens), o que ficou de propósito.
   - `WORKING-CONTEXT.md` enxuto ao **estado**, sem histórico.

## Invariantes (inegociáveis)

1. **Zero mudança de comportamento observável** — suíte inteira (baseline pós-v5.9.6) verde em cada fronteira; casos de contrato via REST inalterados; `verificador-visual` (ou Claude in Chrome) nas telas cujos arquivos foram tocados.
2. **A destrutiva é uma só, é a última, e nasce fora de `supabase/migrations`.** Cada `DROP` cita no header o commit que removeu a última referência e a prova (grep vazio + REST).
3. **Nada apagado sem prova no ato** (regra 2). Exclusão de arquivo de docs também: grep em `CLAUDE.md`, `.claude/`, `docs/`, `README`.
4. **Skills e CLAUDE.md são canon vivo:** lição que não descreve mais a realidade é **deletada**, não emendada (precedente v5.9.5); `CLAUDE.md` fecha ≤ 180 linhas.
5. **Renomear o repositório não é desta versão** (é ato do Yan no GitHub e quebra remotes/worktrees) — a triagem só decide se entra no backlog v6.
6. **Baseline de schema e checagem de drift ficam FORA** — decisão do Yan: entram na virada efetiva para a v6.
7. **Frente única**: nenhuma outra branch de feature aberta enquanto esta corre.

## Missões

| # | Fase | Conteúdo | Auto-auditoria |
|---|---|---|---|
| **M0** | 1 | Abertura: `/nova-versao`; ler Carta; despachar D1–D10 com "Skills a ler" por dimensão; criar `docs/auditoria-v5/` com o formato. | formato único conferido antes do 1º despacho |
| **M1–M10** | 1 | Um explorador por dimensão (D1–D10), timebox, saída no formato único. **Só leem; não editam nada** fora de `docs/auditoria-v5/`. | cada achado tem evidência reproduzível (caminho:linha ou query) |
| **M11** | 1 | Consolidação: `relatorio.md` + rascunho de `backlog-v6.md`. Commit. **GATE 1.** | contagem por classe e por dimensão bate com os arquivos |
| **M12–Mn** | 2 | Missões por bloco de risco (código/arquivos → aditiva → deploy → destrutiva), derivadas do relatório triado; arquivos-ímã declarados na Carta antes de paralelizar. | grep de prova em cada commit; suíte verde por fronteira |
| **Mfinal** | 2 | Documentação (README, estado-do-projeto, backlog-v6 final, ADR novo, WORKING-CONTEXT enxuto); CHANGELOG; CHANGELOG_DIRETORIA (uma linha: "arrumação interna da plataforma, sem mudança para quem usa"); out-briefing com as contagens do antes/depois (arquivos, linhas, objetos de banco, dependências, testes). | `README` e `estado-do-projeto` conferidos por leitura contra o repositório limpo, não contra a memória |

## Gates

Escalonados: `tsc`+`lint` por missão da Fase 2; `build`+`test` em cada fronteira de bloco e no fechamento. `revisor` em cada bloco da Fase 2 (contexto limpo — é quem pega o que o grep não pega); `revisor-db` na aditiva e na destrutiva. Backup-gate + restore-test na destrutiva. Verificação visual nas telas tocadas.

## Checkpoint do Yan

**(GATE 1)** triar o relatório comigo no Chat — é a decisão da versão. **(durante a Fase 2)** decidir os itens marcados "decidir" que a triagem deixou para o ato. **(GATE 2)** aplicar a destrutiva em TTY depois do deploy intermediário. **(final)** ler `README` e `estado-do-projeto` como se fosse alguém de fora; conferir o backlog v6; navegar pelas telas tocadas. **(pós-versão, fora do repo)** limpar o Project do Chat: manter o guia de formato e os 2–3 briefings mais recentes; e **atualizar o `harness-base`** com os aprendizados — inclusive extraindo os hooks (pendência aberta, gatilho é esta versão).

## Fronteira

**Fora:** qualquer feature ou mudança de comportamento; reestruturação (unificar editores — ADR-0170 mantém separados; tokenizar os ~400 `zinc-*`; regenerar `database.ts` se a triagem julgar grande — vai para o backlog v6); atualização de framework/major de dependência (backlog v6); baseline de schema e drift (virada v6); renomear o repositório (decisão sua, backlog); consolidar migrations (nunca); reverter o lote 132178; `harness-base` (pós-versão, outro repositório).

## Skills a ler

Todas as 9 — cada explorador lê a(s) da sua dimensão; a sessão principal lê `orquestracao` (Carta) antes de despachar:
`banco-e-rpc` · `contrato-rpc-front` · `ui-design-system` · `tabela-densa` · `graficos` · `react-padroes` · `email` · `ingestao-planilhas` · `orquestracao`

## Commits sugeridos

1. `docs(v5-10-0): briefing da versão`
2. `docs(auditoria): relatorio da fase 1 por dimensao + rascunho do backlog v6` — **GATE 1**
3. `docs(auditoria): relatorio triado (spec da fase 2)`
4. `chore: remove codigo morto — <dimensao>` (um por dimensão, grep na mensagem)
5. `chore: remove docs e briefings pre-v5`
6. `fix(db): comentarios, grants e notify — aditiva`
7. `chore(db): drop de objetos orfaos — destrutiva` — **GATE 2**
8. `docs: readme, estado-do-projeto, backlog-v6, adr de fechamento`
9. `chore(release): v5.10.0`
