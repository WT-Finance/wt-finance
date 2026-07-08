# Out-Briefing — v4.40.1 · Título do modal na fonte da identidade

**Tipo:** PATCH · **Migration:** nenhuma · **ADR:** emenda ao 0145 (§5) · **Base:** main @ v4.40.0 · **Branch:** `feat/v4-40-1-modal-titulo`

Ajuste pós-merge do PR #173 (regra do projeto: addendum em versão mergeada = patch novo). Pedido do Yan com **mockup A/B aprovado (opção B)**.

- **Título "Welcome to Janus"** do modal de boas-vindas: sai a serifa Georgia/preto; entra a **fonte da identidade** — Avenir LT Std **85 Heavy** (a fonte global do app, peso 800; o mesmo estilo do antigo wordmark "WT FINANCE") em **CAIXA ALTA + tracking 2px** (via CSS — o texto VERBATIM permanece "Welcome to Janus" no JSX) e no **cinza da marca** `--text-muted` (#75777B — token de plataforma, não reage a tema).
- ADR-0145 §5 emendado (a nota "Trajan Pro = troca de 1 linha" ficou obsoleta para o título — a decisão final é a tipografia da identidade, não serifa).
- Nada mais muda: texto/fluxo/flag do onboarding intactos (migration 0174 já em produção).

**Gates:** tsc 0 · vitest verde · eslint 0 · build 0.
