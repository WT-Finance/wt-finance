# WT Finance — Out-Briefing v4.37.2 · Ajustes visuais/de texto

**Data:** 2026-07-06 · **Branch:** `feat/v4-37-2-editor-aviso-largura` (base `main` @ v4.37.1) · **Versão:** 4.37.1 → **4.37.2** (PATCH)
**Tema:** Correção de layout do aviso de data no editor de Solicitações + revisão de dois subtítulos. **Sem migration · sem ADR.** Merge e deploy ficam com o usuário.

## Mudanças
1. **Editor de tipos de Solicitação — largura do aviso de data:** o seletor de direção adicionado na v4.37.1 esticava em **largura cheia** (o `Select`/`Input` do DS herdam `w-full` de `CAMPO`; um `w-32` direto conflita com o `w-full` e perde de forma indeterminada) — o seletor tomava a linha toda e empurrava o campo de dias e o rótulo para fora do modal (rolagem horizontal, texto cortado, como no print do Yan). **Correção:** o `Select` e o `Input` passam a viver em **wrappers de largura fixa** (`w-32` / `w-28`) — o `w-full` interno preenche o wrapper, sem conflito de utilitárias; a linha ganhou `flex-wrap` (rede) e o sufixo virou só **"dias"** (a direção já é dita pelo seletor "a mais de / a menos de"). `src/components/admin/solicitacoes/editor-tipo.tsx`.
2. **Subtítulo do Acervo de Documentos** → "Biblioteca de documentos, modelos, manuais e referências." (`acervo-documentos.tsx`).
3. **Subtítulo do Faturamento Corporativo** → "Emita boletos e notas fiscais, dispare e-mails e gerencie o cadastro dos clientes corporativos." (`faturamento-corp-content.tsx`).

## Notas
- **Só texto/CSS** — nenhuma lógica, RPC, migration ou schema alterados. O comportamento do aviso (v4.37.1) e a idempotência/regra de data seguem intactos.
- A geometria da linha do aviso agora é folgada (seletor 128px + input 112px + "dias" + gaps ≈ 284px, bem abaixo da largura interna do modal `lg`); `flex-wrap` garante que nunca haja rolagem horizontal mesmo em telas estreitas.

## Gate de fechamento
`npx tsc --noEmit` → **0** · `eslint` nos arquivos alterados → **0** · `npm run build` → exit 0 · `npm test` → verde. Sem migration.

## Verificação
Fix determinístico de CSS (o mecanismo de overflow — seletor em `w-full` — foi eliminado). Confirmação visual final no **preview da Vercel** (deploy do PR) / após o merge — o Yan está justamente nessa tela.

## Arquivos
`src/components/admin/solicitacoes/editor-tipo.tsx`, `src/components/financeiro/acervo-documentos.tsx`, `src/components/financeiro/faturamento-corp-content.tsx`, `package.json`/`package-lock.json` (4.37.2), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, este out-briefing.
