# WORKING-CONTEXT — Janus

Última atualização: 2026-07-15 · v5.1.4 (A Virada — código mergeado; flip pendente do Yan)

> Verdade atual do projeto em UMA página. Toda sessão nova lê este arquivo antes de
> explorar o repositório (o hook `contexto-sessao` o injeta automaticamente).
> Atualizado como parte do out-briefing de TODA versão/patch (DoD). Manter curto:
> o que mudou de verdade, não histórico — histórico é o CHANGELOG.

## Verdade atual

- Versão em produção (main): `5.1.4` (A Virada — PR #182)
- Versão em execução (worktree/branch ativa): nenhuma
- Última migration **aplicada**: `0180_monde_comparacao_mensal.sql` — as `0181`/`0182` da virada existem no repo mas **NÃO foram aplicadas** (flip = gate do Yan)
- Último ADR registrado: `0151`

## Bloqueios vigentes

- **Faturamento roda em MODO TESTE** — o flip de produção (Asaas produção + `EMAIL_MODO=real`)
  é decisão do Yan, fora do código. A dupla trava do modo real está construída, não acionada.
- **A virada (Monde como fonte das vendas) tem o CÓDIGO MERGEADO (v5.1.4), mas o FLIP NÃO foi aplicado** —
  as migrations `0181` (repoint reversível das 7 funções PURA-mv) + `0182` (agendamento pg_cron+pg_net)
  estão no repo, **não aplicadas**. Aplicá-las é gate do Yan, **após comunicar a diretoria**. Até lá, a
  fonte VIVA das vendas segue o **upload**. Pendente: secrets no Vault (`monde_cron_secret` + URL de
  produção) e `MONDE_API_KEY` na Vercel. `get_mix_produto`/`get_cagr` (leem o fato direto) ficam no upload.
- **`SMTP_*` na Vercel** — sem eles, as notificações por e-mail degradam em silêncio (0 enviados).
- **% Rec no Cadastro de Metas** — alvos de %Rec nascem vazios; enquanto o Yan não os digita,
  os cards de Metas mostram "—" no "% da meta".
- Favicon/símbolo Janus adiado (reprovado no gate de legibilidade 16/32px) — confirmar com o usuário.

## Filas ativas (próximos passos já decididos)

- **Monde — aplicar a virada:** o código está em main (v5.1.4); falta o Yan **aplicar** `0181`/`0182`
  (flip + agendamento Supabase ~15min) após comunicar a diretoria — runbook no out-briefing da v5.1.4.
  O Cron da Vercel fica dormente/redundante depois disso.
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
- Não tratar `monde.*` como fonte de verdade das telas até o **flip (0181) ser aplicado** (hoje ainda é espelho, não fonte viva).

---
Regra de manutenção: item resolvido SAI (não é log). Aprendizado permanente NÃO fica
aqui — vai para o CLAUDE.md pelo critério das três condições (permanente, transversal,
custou caro).
