# CLAUDE.md — WT Finance

Plataforma financeira interna do Welcome Group. Este arquivo define como se trabalha
neste projeto. Vale para toda sessão. Conteúdo específico de cada versão vem no
briefing (`/docs/briefings/*.pdf`) e no prompt da versão, não aqui.

---

## Manutenção deste arquivo (documento vivo)

Este arquivo evolui com o projeto. Ao gerar o out-briefing de cada versão (passo 6 do
workflow), avaliar: **esta versão revelou algum aprendizado permanente que deveria ser
documentado aqui?**

Critério para entrar (os três precisam ser verdade):
- **Permanente** — vale para sempre, não só para esta versão (config, convenção, padrão arquitetural).
- **Transversal** — afeta features futuras, não um componente isolado.
- **Custou caro** — foi um bug difícil, uma investigação longa, ou um erro que se repetiria.

Teste rápido: *"a próxima versão erraria isso de novo se não estivesse documentado?"*
Se sim, entra (em "Convenções" ou "Banco de dados"). Se não, fica no out-briefing da versão.

Exemplos que entraram: schema `analytics` não exposto (v4.6); upload → API Route (v4.7).

**Manter denso, não só crescer:** adicionar é também podar. Convenção que deixou de
valer deve ser corrigida ou removida, não acumulada. Alterações no arquivo passam pelo
PR — o usuário revisa antes do merge.

---

## Stack

Next.js 16 · React 19 · TypeScript estrito · Tailwind 4 · shadcn/ui · Recharts ·
Supabase (Postgres + PostgREST) · Vercel. Repositório: `WT-Finance/wt-finance`.

---

## Comandos essenciais

```bash
npm run dev               # servidor local (next dev)
npm run build             # build de produção (next build) — gate de fechamento
npm run lint              # eslint — gate de fechamento
npx tsc --noEmit          # typecheck (NÃO existe script dedicado; rodar assim) — gate
npm run seed              # popular banco (tsx supabase/seed/seed.ts)
```

Não existe script de typecheck no `package.json`. Sempre usar `npx tsc --noEmit`
diretamente. Não inventar `npm run typecheck`.

---

## Banco de dados (Supabase)

### Comandos
```bash
npx supabase migration list           # inspecionar local vs remote (READ-ONLY, seguro)
echo "Y" | npx supabase db push --linked   # APLICAR migrations no remote (ESCREVE)
```

O CLI não está instalado globalmente — sempre `npx supabase ...`, nunca `supabase ...`.

### ⚠️ Produção direta, sem staging
`--linked` aplica no banco de PRODUÇÃO (não há ambiente de staging separado; só
existe `.env.local`). Uma migration ruim vai direto para produção, sem rede de proteção.

**Regra:** preparar a migration livremente, mas **PEDIR CONFIRMAÇÃO ao usuário antes
de aplicar (`db push`)**. A confirmação é a única barreira contra estrago irreversível.

Ao testar escrita em produção (ex.: commit de import), usar dados com nomes distintos
e deletar logo em seguida.

### Schema `analytics` NÃO é exposto pela API
O `config.toml` expõe apenas `["public", "graphql_public"]`. Tabelas em `analytics`
**não são acessíveis** via `.schema('analytics').from(...)` (retorna PGRST106).

**Regra:** todo acesso a tabelas de `analytics` é via RPCs `SECURITY DEFINER` no schema
`public`. Mesmo padrão do resto do codebase. (Descoberto na v4.6.)

### `dim_data` tem range fixo — FK em `fato_venda`
`analytics.fato_venda.data_venda` tem FK para `analytics.dim_data(data)`, semeada com
range FIXO (era 2024-2030; estendida para 2022-2030 na migration 0100). Subir Vendas
com datas FORA do range faz `transform_raw_to_analytics` abortar em
`fato_venda_data_venda_fkey`. Pior: o upload roda `truncate_dynamic_tables` (CASCADE)
ANTES do transform — se o transform falha, `fato_venda` fica VAZIA em produção (os
dados crus sobrevivem em `raw.vendas_excel`).

**Regra:** ao surgir esse erro, estender `dim_data` (migration com `generate_series` +
mesma derivação do seed `0002`, `ON CONFLICT (data) DO NOTHING`) e recuperar SEM
re-upload via RPCs `transform_raw_to_analytics` → `regenerar_dim_operacao_weddings` →
`refresh_all_materialized_views`. (Descoberto em mai/2026, migration 0100.)

### RPCs chamadas pela UI correm como `anon` (statement_timeout = 3s)
O front usa a **anon key** (`getServerClient`), e os roles têm timeout DIFERENTE:
`anon`=3s, `authenticated`=8s, `service_role`=sem limite. Uma RPC que passe de 3s
estoura `57014 canceling statement due to statement timeout` → HTTP 500 — mas **só pelo
front**; testar via REST com a service role key NÃO reproduz (não tem timeout).

**Regra:** toda RPC consumida pela UI precisa caber em <3s; não validar só com service
role. Atenção a N+1 dentro de RPC de listagem (função escalar por linha) e a casts em
coluna de JOIN que impedem índice — pioram conforme o dado cresce. (Custou caro em
mai/2026: `contar_convidados_operacao` × ~140 ops estourou após o backfill 0100; fix na
migration 0101.)

### Convenções de migration
- Arquivos: `supabase/migrations/NNNN_nome.sql`, numeração sequencial.
- RPCs: sempre `SECURITY DEFINER` + `REVOKE EXECUTE ... FROM PUBLIC` + `GRANT EXECUTE ... TO service_role`.
- `max_rows = 1000` no PostgREST — limite de payload de RPCs/queries. Considerar em listagens grandes.
- Subagentes que criam migration recebem o número exato e NÃO aplicam — o orquestrador aplica todas em lote, sequencialmente, depois.

### Verificação pós-push
Testar as RPCs novas via REST com a service role key antes de considerar pronto:
```bash
curl -s -X POST "https://<project-ref>.supabase.co/rest/v1/rpc/<fn>" \
  -H "apikey: $SVCKEY" -H "Authorization: Bearer $SVCKEY" \
  -H "Content-Type: application/json" -d '{...}'
```

---

## Workflow de versão

### 1. Recebimento
- Ler o briefing em `/docs/briefings/<versão>.pdf` + o prompt `.md` da versão.
- **Confirmar entendimento do escopo antes de implementar.** Se houver ambiguidade real, perguntar; senão, prosseguir.

### 2. Implementação
- Seguir a estrutura de fases do prompt.
- **Identificar oportunidades de paralelização proativamente**, garantindo não-conflito (ver "Paralelização" abaixo).
- Commits Conventional Commits em pt-BR, **um por missão**, com `git add <arquivos específicos>` — nunca `git add -A` cego.
- Rodar `build` + `tsc` + `lint` ao final de cada missão, não só no fim de tudo.
- **Reportar o progresso pelo chat** (sem criar arquivo de relatório).

### 3. Validação (gate)
- `npm run build` limpo, `npx tsc --noEmit` zero erros, `npm run lint` sem warnings novos.
- Smoke tests das áreas afetadas.

### 4. Confirmação
- Por padrão, a confirmação do usuário acontece **ao final de todas as missões** (autonomia total durante a execução).
- Se o prompt pedir **checkpoint** explícito numa missão, parar nela e aguardar confirmação antes de prosseguir.

### 5. Correções
- Aplicar correções apontadas pelo usuário; aguardar nova confirmação pós-correção quando relevante.

### 6. Out-briefing
- Gerar out-briefing `.md` no formato consolidado: missões implementadas, migrations, ADRs, pendências, arquivos modificados.
- **Verificar que todos os arquivos estão corretamente sincronizados.**
- **Avaliar se a versão revelou aprendizado permanente para este CLAUDE.md** (ver "Manutenção deste arquivo" no topo).
- **Limpar as worktrees** (ver abaixo).

### 7. PR
- Abrir PR (`gh pr create`) com sumário apontando para o out-briefing.
- **NUNCA fazer merge. NUNCA fazer deploy.** O merge é do usuário; o deploy do Vercel é automático no merge.

---

## Paralelização (regra de ouro)

A paralelização acontece por **subagentes editando arquivos disjuntos dentro de uma
única worktree da versão**. Não é uma worktree por missão.

**Regra crítica de segurança — subagentes são editores puros:**
> Subagentes SÓ editam arquivos. NUNCA rodam `git commit`, `supabase db push`,
> `next build` nem servidor. Isso causaria race no índice git, no banco e em portas.

Toda operação com estado compartilhado (git, banco, build, servidor) é **serializada
pelo orquestrador**, depois que os subagentes terminam de editar.

- Missões que tocam o **mesmo arquivo** são sequenciadas (ex.: M1→M2 no mesmo componente).
- Missões em **arquivos diferentes** rodam em paralelo.

---

## Worktrees

Uma worktree **por versão**, isolando-a do `main`. Convenção: `.worktrees/<branch-com-hífen>`
(`feat/v4-8` → `.worktrees/feat-v4-8`). `.worktrees/` está no `.gitignore`.

### Criar (início da versão)
```bash
git worktree add .worktrees/feat-vX-Y -b feat/vX-Y
# a worktree nasce "crua" — montar o ambiente com symlinks + cópia do link supabase:
ln -s <raiz>/node_modules .worktrees/feat-vX-Y/node_modules
ln -s <raiz>/.env.local   .worktrees/feat-vX-Y/.env.local
mkdir -p .worktrees/feat-vX-Y/supabase/.temp && cp <raiz>/supabase/.temp/* .worktrees/feat-vX-Y/supabase/.temp/
```
Sem os symlinks e o `.temp/`, faltam `node_modules`, `.env.local` e o link do Supabase — nada funciona.

### Consolidar (fim da implementação)
Tudo numa branch só → não há merge entre worktrees.
```bash
npx tsc --noEmit && npx next build      # valida o conjunto
# aplicar migrations em lote (com confirmação do usuário)
git add <arquivos da missão>            # commits específicos, um por missão
git commit -m "feat(vX-Y-mN): ..."
git push origin feat/vX-Y
```

### Limpar (APÓS o PR mergear no main)
Sempre a partir da raiz do `main`, **nunca de dentro da worktree**:
```bash
cd <raiz do main>
git worktree remove .worktrees/feat-vX-Y --force
git worktree prune
```
Nunca remover worktree com trabalho não-merjado.

---

## ADRs

Decisões arquiteturais geram um ADR em `docs/adr/NNNN-titulo.md`.

**Antes de criar um ADR novo, verificar a numeração real existente:**
```bash
ls docs/adr/        # continuar a partir do MAIOR número real, não do número que o briefing sugere
```
A numeração dos briefings pode divergir da numeração real do projeto. A fonte da
verdade é `docs/adr/`. Evitar colisão de número.

---

## Convenções de código (permanentes)

- **Design System Welcome:** usar tokens CSS, nunca hex hardcoded. Fonte Avenir LT Std.
- **Cores semânticas fixas:** `#1A1814` (preto/H1), `#BD965C` (dourado/H2/destaque), `#4B4F54` (cinza-azulado/H3), `#75777B` (cinza texto). Tokens de subsetor e de gráfico em `src/styles/tokens.css`.
- **Card:** padrão `shadow-sm` (não border destacado).
- **Versionamento X.Y.Z** (ADR-0084): MAJOR quebra premissa de domínio; MINOR capacidade/reformulação; PATCH correção/polimento. Sidebar mostra X.Y.Z. CHANGELOG.md formato Keep-a-Changelog.
- **Upload/parse de arquivo → API Route, não Server Action.** Libs como `@e965/xlsx` falham no SSR/RSC; API Route (`runtime = 'nodejs'`) isola do contexto React Server Components. (Descoberto no PEND-001/v4.7.)
- **Gráficos → primitivos de `@/components/charts`.** Tema central, eixos/grade/linha-do-zero, `ChartLegend`, `CustomTooltip` e formatadores de eixo (`fmtAxisBRL`/`fmtAxisPct`/`fmtAxisMes`) — não reconfigurar Recharts à mão. Convenção: sólido = real/efetivo, tracejado = referência/projeção; eixo temporal sempre contínuo. Migração dos legados é incremental (quando tocados). (ADR-0095, v4.8.)
- **Card KPI clicável → afordância no hover na cor da aba.** Borda + sombra + o CTA "Ver mais" mudam para `var(--brand)` (cor da aba, resolvida por `[data-theme]`). Utilitária `.card-clicavel`/`.card-clicavel-cta` em `globals.css`; abas futuras herdam pela var (sem regra por setor). (v4.8.1.)

---

## Definition of Done

Uma versão está pronta quando:
- [ ] `npm run build` limpo
- [ ] `npx tsc --noEmit` zero erros
- [ ] `npm run lint` sem warnings novos
- [ ] Smoke tests das áreas afetadas passando
- [ ] Migrations aplicadas no remote (com confirmação) e RPCs verificadas via REST
- [ ] ADRs novos registrados (numeração real verificada)
- [ ] `CHANGELOG.md` com entrada da versão
- [ ] `package.json` e `src/lib/version.ts` com a versão nova
- [ ] Out-briefing `.md` gerado
- [ ] CLAUDE.md avaliado (aprendizado permanente adicionado, se houver)
- [ ] Worktree limpa (após merge)
- [ ] PR aberto (merge e deploy ficam com o usuário)

---

## Salvaguardas (o que NÃO fazer)

- **Não aplicar migration** (`db push`) sem confirmação do usuário — é produção direta.
- **Não fazer merge** de PR. **Não fazer deploy** (Vercel é automático no merge).
- **Não expandir escopo** além do briefing da versão.
- **Subagentes não rodam git/build/banco/servidor** — só editam arquivos.
- **Não remover worktree** com trabalho não-merjado.
- **Não usar `git add -A` cego** — adicionar arquivos específicos por missão.
- **Não confiar na numeração de ADR do briefing** — verificar `docs/adr/` real.
