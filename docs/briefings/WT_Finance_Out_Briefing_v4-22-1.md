# WT Finance — Out-Briefing v4.22.1

**Data:** 2026-06-17 · **Branch:** `feat/v4-22-1-gerencial-ajustes` (base `main`) · **Versão:** 4.22.0 → **4.22.1** (PATCH)
**Tema:** Fluxo de Caixa Gerencial — ajustes de UX nos cards de saldo e na projeção diária (pós-revisão da v4.22.0, já mergeada). **Sem migration. Merge e deploy ficam com o usuário.**

> Pedido depois do merge da v4.22.0 (PR #128) → **patch novo** (branch/versão próprios), conforme a regra do CLAUDE.md.

---

## Ajustes (5)

1. **Cabeçalho dentro do box (cards):** "Contas" + botão "Gerenciar contas" (engrenagem) movidos para **dentro** do box branco de `ContasCards` (nova prop `onGerir`). `visualizacao-agregada-tab.tsx` deixou de renderizar o header externo e teve o import de `Settings` removido (sem import morto).

2. **Caption "Saldo" no card:** legenda **"Saldo"** (cinza discreto `--text-subtle`, uppercase pequeno) acima do valor, alinhada à direita (junto do valor).

3. **Projeção — data inicial:** seletor de **data inicial** no topo direito do box, padrão **dinâmico = hoje** (= `projecao[0].data`, a 1ª data vinda do servidor; acompanha a virada do dia, sem hardcode). Limites: `min` = hoje, `max` = última data da janela.

4. **Projeção — horizonte:** dropdown **15 (padrão) / 30 dias**. As páginas (standalone + embutida no Fluxo de Caixa) passam a buscar **60 dias** de uma vez; a UI **fatia** por data inicial + horizonte client-side (sem nova chamada ao servidor).

5. **Cor condicional nos saldos:** os 3 saldos da projeção ganham **texto** por sinal (`corTextoSaldo`: ≥ 0 verde `--positive-deep` / < 0 vermelho `--negative-deep`), **somado** ao fundo de faixa existente. A Receber (verde), A Pagar (vermelho — direção do fluxo) e Resultado (por sinal) seguem inalterados → todo valor monetário fica colorido. (Decisão do Yan: opção "saldos ganham texto por sinal".)

## Correção / modelo
- **Agregada INTOCADA:** o `useMemo` que calcula o acumulado (`isoladaBase`/`consolidadoBase`/`reservaBase` + `acc`) **não mudou**. A projeção é buscada **a partir de hoje**; o acumulado roda desde hoje e os controles de data/horizonte apenas **fatiam a exibição** (`linhasVisiveis = linhas.filter(data ≥ inicial).slice(0, horizonte)`). Escolher uma data inicial futura **preserva** o saldo acumulado correto (não reseta na data escolhida).
- **Sem migration** — nenhuma mudança de banco. A RPC `get_gerencial_projecao_diaria(p_dias)` já aceitava o parâmetro; só passamos 60.

## Gates
`tsc --noEmit` **0** · `lint` **13** (= baseline, zero novos) · `next build` **limpo** (47/47) · `npm test` **131**.

## Auto-auditoria
Revisão adversarial (2 dimensões: projeção + cards, com verificação) — ver resultado no chat/commit de fechamento.

## Arquivos
**Modificados:** `src/components/financeiro/gerencial/contas-cards.tsx`, `src/components/financeiro/gerencial/visualizacao-agregada-tab.tsx`, `src/app/financeiro/fluxo-caixa/gerencial/page.tsx`, `src/app/financeiro/fluxo-caixa/page.tsx`, `package.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, este out-briefing.
**Sem ADR novo** (ajuste de UX, dentro do modelo existente; o windowing client-side não muda arquitetura).

## Pendências / fora de escopo
- Continua FORA (registrado na v4.22.0): agregada por conta/GROUP BY; cards no mobile; filtro de Valor por faixa; projeções flexíveis; `vw_fluxo_caixa_kpis_b` (view lenta).
- O lançamento de teste **id=300 "Rextur"** segue em produção (criado no preview da v4.22.0) — o Yan decide se remove.
