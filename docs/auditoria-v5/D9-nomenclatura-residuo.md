# D9 — Nomenclatura e resíduo

Explorador D9 (Sonnet, read-only) por grep. Skill lida: `ui-design-system`. Formato: `README.md` desta
pasta. Regra do briefing: `zinc-*` só CONTAR e AGRUPAR (decisão é do backlog v6); renomear o repo é ato
do Yan.

| id | achado | evidência | risco | esforço | ação proposta | classe | triagem | nota |
|---|---|---|---|---|---|---|---|---|
| D9-001 | `zinc-*` em 1.301 linhas / 137 arquivos de `src/` (1.675 ocorrências) — o briefing estimava ~400; por classe: `text-zinc-*` 844, `border-zinc-*` 344, `bg-zinc-*` 307, `ring-/placeholder-/divide-zinc-*` 25, `dark:zinc` 0. Exceção deliberada do lint `wt/no-cor-hardcoded` (skill `ui-design-system` §1.2) — dívida de tokenização, não violação | `grep -rc "zinc-" src --include='*.tsx' --include='*.ts'` | baixo | L | follow-up de tokenização de cinza neutro (paralelo a `--band`/`--band-soft`, iniciado v5.3.0) → backlog v6 | decidir | | `tokens.css:20-25` já chama isso de "primeiro passo… follow-up" |
| D9-002 | Primitivo `src/components/ui/tooltip.tsx:32` usa `bg-zinc-800` cru — 1 ocorrência, 1 tonalidade, já comentado na linha 4; troca mecânica e local; sem token equivalente ainda | `src/components/ui/tooltip.tsx:4,32` | baixo | S | criar token `--tooltip-bg` e trocar a classe | corrigir | | primitivo = maior alavanca |
| D9-003 | Primitivo `src/components/ui/checkbox.tsx:30` usa `border-zinc-300` cru — `--border`/`--border-strong` existem mas são "quentes" (`#E8E0D2`/`#D4C8B4`); zinc-300 (`#d4d4d8`) é frio — troca não é 1:1 | `src/components/ui/checkbox.tsx:30` | baixo | S | avaliar visualmente se `--border-strong` serve; senão token neutro dedicado | corrigir | | troca cega muda a cor visível |
| D9-004 | `src/components/ui/badge.tsx:21` variante `neutro` usa `border-zinc-200 bg-zinc-100 text-zinc-500` — 3 tonalidades num primitivo muito usado | `src/components/ui/badge.tsx:21` | baixo | S | token composto `--badge-neutro-*` com verificação de contraste | corrigir | | |
| D9-005 | `src/components/ui/button.tsx` usa 8+ tonalidades de zinc (50…700) nas variantes contorno/ghost/ícone — exige redesenho da paleta neutra do botão | `src/components/ui/button.tsx:45,50,55-56,64` | médio | L | mapear paleta neutra do botão em tokens novos → backlog v6 | decidir | | maior massa de zinc num primitivo |
| D9-006 | Top arquivos por volume de `zinc-*` (fora do showcase): `faturamento-corp.tsx` 63, `lista-operacoes.tsx` 45, `cadastro-grade.tsx` 41, `documentacao-content.tsx` 29, `drilldown-drawer.tsx`/`revisar-envio-modal.tsx`/`prejuizos-table.tsx` 28, `drawer-solicitacao.tsx` 26; `admin/design-system/page.tsx` 102 é showcase intencional | grep `zinc-` por arquivo | baixo | L | idem D9-001 | decidir | | |
| D9-007 | `kpi-detail-drawer.tsx` fixa cor de eixo/grid do Recharts via prop (`stroke="#f1f5f9"`, `fill: '#a1a1aa'`) em vez de `--chart-grid`/`--chart-axis-tick` (`tokens.css:111-112`) — escape que o lint não vê (só classe) | `src/components/shared/kpi-detail-drawer.tsx:138,141,148` | baixo | S | `var(--chart-grid)`/`var(--chart-axis-tick)` | corrigir | | única cor crua real fora de zinc |
| D9-008 | Fora de `zinc`, zero classe Tailwind crua de outra paleta (`slate-`/`gray-`/`red-`/`emerald-`/`amber-`/`blue-`) em `src/` — o lint segura essa frente | grep `(slate\|gray\|red\|emerald\|amber\|blue)-[0-9]{2,3}` em `src/**/*.{ts,tsx}`: 0 | baixo | S | nenhuma | documentar | | achei, não vou agir |
| D9-009 | Hex fora de paleta: 113 ocorrências em 18 arquivos, quase todas em comentário, na página-showcase (`admin/design-system/page.tsx` 45, `plataforma-showcase.tsx` 5) ou em `src/lib/email/**` (isento pela skill, 25) — única exceção real é D9-007 | grep `#[0-9a-fA-F]{3,6}` em `src/**/*.{ts,tsx}` | baixo | S | nenhuma | documentar | | |
| D9-010 | `src/lib/email/template.ts:21-22,320,344` fixa `APP_NOME='WT Finance'` no e-mail de fatura a CLIENTE — **deliberado e documentado** (`// NUNCA alterar`, ADR-0145/v4.40.0); internos usam `APP_NOME_INTERNO='Janus'`, protegido por teste | `src/lib/email/template.ts:18-22`; `src/lib/email/email.test.ts:68-84` | baixo | S | nenhuma — decisão vigente | documentar | | |
| D9-011 | `package.json:2` `"name": "wt-finance-temp"` — nome interno do pacote, não visível; sufixo `-temp` é resíduo | `package.json:2` | baixo | S | renomear para `janus` (ou manter, ligado à decisão de renomear o repo) | decidir | | junto de D9-012 |
| D9-012 | `supabase/config.toml:5` `project_id = "wt-finance"` — identificador técnico do CLI local; mudar quebra `npx supabase` sem ganho | `supabase/config.toml:5` | alto | S | manter | documentar | | |
| D9-013 | Diretório de backup `~/wt-finance-backups/` citado em `scripts/db-gate/gate.mjs:23`, `scripts/limpeza-anexos-solicitacoes.mjs:20,70` e 5 migrations (`0119`,`0133`,`0137`,`0170`,`0220`) — path real em disco do operador; migrations são imutáveis | `scripts/db-gate/gate.mjs:23`; `supabase/migrations/0133_balde1_autorizacao.sql:7` | alto | S | manter | documentar | | |
| D9-014 | `lista-operacoes.tsx` usa chave de `localStorage` `'wt-finance-lista-operacoes-page-size'` — renomear sem fallback perde a preferência salva de todo usuário | `src/components/weddings/lista-operacoes.tsx:249,370` | baixo | S | renomear com leitura da chave antiga (migração one-shot) ou deixar | decidir | | viola "zero mudança observável" se for troca direta |
| D9-015 | `RAISE EXCEPTION 'USUARIO_INATIVO: sem cadastro ativo no WT Finance'` em duas migrations (0119, 0133) — função viva pode lançar o texto em produção; o código `USUARIO_INATIVO:` é o contrato, o texto é livre | `supabase/migrations/0119_rbac_nucleo.sql:147`; `0133_balde1_autorizacao.sql:62` | baixo | S | `CREATE OR REPLACE` a partir do CATÁLOGO VIVO na migration aditiva da Fase 2, só trocando o texto | corrigir | | nunca editar migration aplicada |
| D9-016 | Comentários de cabeçalho "WT Finance Design System" em 5 arquivos de `src/components/charts/*` e `src/styles/tokens.css:1` — só comentário | `src/components/charts/{chart-primitives.tsx:4,index.ts:2,chart-theme.ts:2,anel-kpi.tsx:4,chart-legend.tsx:4}`; `src/styles/tokens.css:1` | baixo | S | atualizar para "Janus" | corrigir | | mecânico |
| D9-017 | `src/data/changelog-diretoria.ts:1620` "O WT Finance agora pede login" — registro datado já publicado à diretoria | `src/data/changelog-diretoria.ts:1620` | médio | S | manter — histórico não se emenda | documentar | | |
| D9-018 | RPCs `public.*` por família de prefixo (266): `get_*` 97, `admin_*` 19, `solic_*` 19, `metas_*` 6, `{patrimonio_,acervo_,dre_,gerencial_,api_}*` 38, verbo-substantivo ~60, ~27 fora de padrão | `_insumos/mapa-rpc-chamadores.txt` | baixo | S | só contar — mistura histórica; convenção única é backlog v6 | documentar | | |
| D9-019 | `src/components/financeiro/dre/mockup-dados.ts` — "ORÁCULO CONGELADO" auto-declarado, não importado por produção desde M4/M5; a condição de remoção declarada no próprio arquivo é de PRODUTO ("quando a controladoria aposentar o dashboard antigo") — usado como oráculo de paridade em auditorias, não em runtime (**corrige D1-008**) | `src/components/financeiro/dre/mockup-dados.ts:1-9`; grep de import vazio | baixo | S | decidir com Yan se o oráculo ainda serve | decidir | | |
| D9-020 | Zero `console.log`/`TODO`/`FIXME`/`lorem` reais em `src/` — os hits são a palavra "todo" em pt-BR (= D5-005); `gate-stop` eficaz | grep `\bTODO\b\|\bFIXME\b` em `src/` | baixo | S | nenhuma | documentar | | |
| D9-021 | Nomes de arquivo em `src/`: zero PascalCase, snake_case, espaço, sufixo `-v2/-novo/-old/-legado/-antigo/-temp/-copy/-bak`, zero mistura `fetch-*`×`buscar-*` — kebab-case 100% | Globs `src/**/*[A-Z]*.{ts,tsx}`, `*_*`, `*-{v2,…}*` → 0 | baixo | S | nenhuma (D7-010 aponta colisão de NOME entre dois `decomposicao-variacao.ts`) | documentar | | |

## Síntese

`zinc-*` é a dívida real e concentrada: **1.675 ocorrências (não ~400)**, maior parte em telas, mas o núcleo de alavancagem são 4 primitivos de `src/components/ui/` (tooltip, checkbox, badge, button — este com 8 tonalidades). "WT Finance" residual tem só **2 correções de fato** (comentários em 6 arquivos; texto de erro em função viva via aditiva) — o resto é intencional (e-mail de fatura, `config.toml`, backups, changelog histórico) ou decisão de produto/infra (nome do pacote/repo). Arquivos e resíduo de mockup/console.log estão limpos; o único mockup (`mockup-dados.ts`) é oráculo auto-documentado com condição de produto. RPCs misturam convenções históricas sem custo até agora.

## Contagem por classe

corrigir 6 · decidir 6 · documentar 9 · apagar 0 · simplificar 0 — **total 21**.

## Achei, não vou agir

- Mapeamento tonalidade-por-tonalidade das 1.675 ocorrências de `zinc-*`.
- As 6 migrations que citam `wt-finance-backups`/"WT Finance" além de confirmar a natureza.
- As ~27 RPCs fora das famílias contadas em D9-018.

## Riscos fora do escopo

- D9-007 é exemplo vivo de cor hardcoded escapando o lint via prop do Recharts — vale generalizar a checagem (`stroke=`/`fill=` com hex) para outros gráficos.
- D9-014 é o único achado com efeito colateral observável ao usuário (perda de preferência) — se entrar na Fase 2, precisa de migração de chave.
