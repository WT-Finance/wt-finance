# WT Finance — Out-Briefing v4.34.1 · Tabelas com cabeçalho fixo (correção + refino)

**Data:** 2026-07-02 · **Versão:** 4.34.0 → **4.34.1** (PATCH) · **PR #162** (branch `feat/v4-34-1-sticky-header`, merge `8284350`) — **MERGED em produção.**
**Tema:** Correção do vazamento do cabeçalho fixo (sticky) e refino visual das tabelas com scroll interno — **Cadastro de Clientes** (Faturamento) e **Base de Dados** (Fluxo de Caixa Gerencial). **SEM migration.** Só apresentação. **Merge e deploy foram do usuário.**

> **Nota:** este out-briefing foi gerado **após o merge**, a pedido do Yan — a v4.34.1 fechou sem ele (o patch cresceu incrementalmente, ajuste a ajuste, e cada etapa foi fechada direto no PR). Fica o registro; a lacuna do DoD (out-briefing por patch) foi reconhecida.

## Contexto
A v4.33.2 introduziu tabelas longas com **scroll interno + cabeçalho fixo** (Cadastro de Clientes e Base de Dados do Gerencial). Ao rolar, **linhas de dados vazavam através do cabeçalho** fixo, e havia refinos visuais pendentes. Este patch corrigiu a causa-raiz e aplicou os refinos aprovados por mockup.

## Missões (na ordem em que entraram no PR)

### M1 — Correção do vazamento (2 etapas)
- **Etapa 1 (`8f653f9`)** — paliativo: fundo opaco nas células do cabeçalho (`[&_th]:bg-white`) + `z-20`. Também: **eslint passa a ignorar `.worktrees/**`** (o `.next` aninhado de uma worktree poluía o `npm run lint`).
- **Etapa 2 (`b868dc1`)** — **fix definitivo**: a causa-raiz era o `border-collapse` (default), em que fundo/borda **não acompanham o sticky** de forma confiável. Tabela migrou para **`border-separate border-spacing-0`**; **toda borda horizontal foi para as células** (borda de `<tr>` não renderiza em `separate`): cabeçalho via `first/last-child th`, corpo via `[&>td]:border-b`. As duas tabelas passaram a viver dentro de um **`Card`** (fundo branco — antes coladas no fundo cru da página).

### M2 — Refinos aprovados por mockup (`af44e51`)
- **Sombra sob o cabeçalho só ao rolar** — estado `rolado` setado no `onScroll` do container → `[&_tr:last-child_th]:shadow-[…]` condicional.
- **Fim da rolagem horizontal** — sem `min-w`; colunas pequenas em px, colunas de texto **sem width** (em `table-fixed` dividem o restante e truncam; conteúdo completo no `title`/edição inline).
- **Tom no cabeçalho** — `bg-zinc-50` distingue o cabeçalho do corpo.

### M3 — Cantos + largura (`2715e94`)
- **Cantos superiores do cabeçalho arredondados** (`[&_tr:first-child_th:first-child]:rounded-tl-lg` + `…:last-child]:rounded-tr-lg`) — o header cinza deixa de ser pontudo dentro do Card.
- **Cadastro de Clientes mais largo** (7xl) + % Juros/% Multa/Forma pgto relaxadas.

### M4 — Situação + badge de ambiente (`a115d10`)
- **Coluna Situação** `w-[64px]`→`w-[92px]` (o filtro "Ativo" não sobrepõe mais o texto).
- **Badge de ambiente âmbar no sandbox** (tokens `--gestao`, os mesmos dos botões de permissão específica) / **neutra em produção**.

### M5 — Largura única (`ca8d8eb`)
- **As duas abas do Faturamento Corporativo passam a `max-w-7xl`** (largura única) — fim do "salto" de largura ao alternar Emissão↔Cadastro. O container mora no wrapper de abas; o `page.tsx` deixou de impor `max-w`.

## Invariantes — auto-auditoria
1. **Só apresentação** ✅ — nenhuma lógica de emissão, RPC, Server Action ou parser tocada. **SEM migration.**
2. **Trava de produção intacta** ✅ — a mudança da badge é só **cor**; o gate real de "documentos reais" é a confirmação obrigatória (digitar `EMITIR`) no modal de emissão, **inalterada**.
3. **Não-regressão** ✅ — mudanças de classe/layout; `tsc`/`lint`/`build` verdes em cada etapa.

## Gate de fechamento
`npx tsc --noEmit` → **0** · `npm run lint` → **limpo** (com `.worktrees/**` ignorado) · `npm run build` → **exit 0**, em cada etapa. **SEM migration** (backup-gate não se aplica). O suite de testes (`npm test`) estava verde na base do patch (306) e não foi impactado — as mudanças são de apresentação, sem lógica testável nova.

## Aprendizado permanente registrado
- **CLAUDE.md (Convenções de código)** e **Design System §7** — a **receita completa** de tabela longa com cabeçalho fixo: `border-separate border-spacing-0`; fundo/bordas nas **células** (nunca no `<tr>`); `Card` em volta; cabeçalho `bg-zinc-50` com cantos superiores arredondados; sombra-ao-rolar via estado `rolado`; **sem `min-w`** (colunas de texto flexíveis truncam); telas densas a `max-w-7xl`.
- **Lição transversal:** sticky header em tabela exige **`border-separate`** — nunca `collapse` (fundo/borda não grudam no sticky e as linhas vazam).

## Fora de escopo / próximos
- **Fase 4 (envio de e-mails via M365)** — próxima frente do Faturamento antes da virada de produção.
- **Investigação da origem dos erros de dados** (Endereço/E-mail/CEP incompleto) — investigação à parte do Yan.

## Arquivos
- **Apresentação:** `cadastro-clientes.tsx`, `gerencial/base-dados-tab.tsx`, `gerencial/lancamento-row.tsx`, `faturamento-corp.tsx` (AmbienteBadge), `faturamento-corp-content.tsx` (largura), `financeiro/faturamento-corp/page.tsx` (removeu `max-w`), `admin/design-system/page.tsx` (§7).
- **Config:** `eslint.config.mjs` (ignora `.worktrees/**`).
- **Docs/versão:** `CLAUDE.md`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json`/`package-lock.json`, este out-briefing.
- **SEM migration.** Lógica de emissão, camada Asaas e RBAC **intocadas**.
