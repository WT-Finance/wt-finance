# WORKING-CONTEXT — Janus

Última atualização: 2026-07-14 · v5.1.3 (upgrade do harness)

> Verdade atual do projeto em UMA página. Toda sessão nova lê este arquivo antes de
> explorar o repositório (o hook `contexto-sessao` o injeta automaticamente).
> Atualizado como parte do out-briefing de TODA versão/patch (DoD). Manter curto:
> o que mudou de verdade, não histórico — histórico é o CHANGELOG.

## Verdade atual

- Versão em produção (main): `5.1.3` (a partir do merge do PR do harness)
- Versão em execução (worktree/branch ativa): nenhuma
- Última migration aplicada: `0180_monde_comparacao_mensal.sql`
- Último ADR registrado: `0150`

## Bloqueios vigentes

- **Faturamento roda em MODO TESTE** — o flip de produção (Asaas produção + `EMAIL_MODO=real`)
  é decisão do Yan, fora do código. A dupla trava do modo real está construída, não acionada.
- **Ingestão Monde é ESPELHO PARALELO, ainda NÃO é fonte das Metas** — a "virada" (passo 2)
  depende do Yan. Pendente na Vercel: `MONDE_API_KEY` + `CRON_SECRET` (sem o secret o Cron
  retorna 401, benigno); backfill 2023→hoje ainda não rodado (demo populou só jun/2025+jun/2026).
- **`SMTP_*` na Vercel** — sem eles, as notificações por e-mail degradam em silêncio (0 enviados).
- **% Rec no Cadastro de Metas** — alvos de %Rec nascem vazios; enquanto o Yan não os digita,
  os cards de Metas mostram "—" no "% da meta".
- Favicon/símbolo Janus adiado (reprovado no gate de legibilidade 16/32px) — confirmar com o usuário.

## Filas ativas (próximos passos já decididos)

- **Monde — passo 2 (a virada):** após o backfill validado, promover o espelho a fonte das
  Metas e subir o Cron de diário (`0 9 * * *`) para `*/15` (sub-diário é Pro-only) — runbook à parte.
- restore-test COMPLETO do backup-gate (follow-up ADR-0116; hoje só o spot-check roda).
- Caso de contrato para `solicitar_acesso_admin` em `rpc-contrato.test.ts` (0177 já em produção).
- Tokenização do `zinc` (follow-up do lint de cor, v4.26).
- Consolidação das 3 pills de período (dívida opcional, patch dedicado).
- Metas por Vendedor — próxima capacidade planejada (escopo a confirmar com o usuário).

## Cuidados desta fase (o que uma sessão nova precisa saber AGORA)

- **Hooks do harness ATIVOS (instalados na v5.1.3).** Editar config de gate (`eslint.config.*`,
  `tsconfig*.json`, `.prettierrc*`, `eslint-rules/`, `.claude/`) é bloqueado — exige checkpoint com o
  usuário + reexecução com `WT_PERMITIR_CONFIG=1`. O `gate-stop` bloqueia a resposta se sobrar
  `console.log` ou shorthand `-[--token]` em `.ts/.tsx` de `src/`. Escape geral: `WT_DESLIGAR_HOOKS=1`.
- **`.claude/settings.json` versionado tem só a chave `hooks`** — NÃO fixa o `model` do orquestrador
  (o CLAUDE.md menciona Opus fixado ali; fixar de fato é decisão pendente do usuário — v5.1.3).
- **Protocolo de revisão de contexto separado:** despachar `revisor` (sempre) e `revisor-db`
  (se houver migration/RPC) ANTES dos gates e da auto-auditoria — read-only, não conflitam.
- Não tratar `monde.*` como fonte de verdade das telas até o passo 2 (é espelho, não fonte viva).

---
Regra de manutenção: item resolvido SAI (não é log). Aprendizado permanente NÃO fica
aqui — vai para o CLAUDE.md pelo critério das três condições (permanente, transversal,
custou caro).
