# ADR-0082 — Calendário de Liquidez como componente novo

**Status:** Aceito  
**Data:** 2026-05-27  
**Contexto:** A seção Fluxo de Caixa Diário precisava de uma visualização navegável do fluxo diário de entradas e saídas previstas, similar ao calendário do Google mas com contexto financeiro.

**Decisão:** Criar componente `CalendarioLiquidez` — grid 7 colunas (Dom-Sáb) × ~5 linhas (semanas do mês). Cada célula mostra data, entradas/saídas do dia e saldo, colorido por magnitude relativa.

**Dados:** RPC `get_calendario_liquidez(p_mes_referencia DATE)` lê `raw.fluxo_caixa_titulos` para o mês+semanas limítrofes. Inclui status 'Entrada', 'Saída', 'A Receber Futuro', 'A Pagar Futuro'.

**Lógica de cor das células:**
```
max_abs_saldo = MAX(|saldo_dia|) do mês visível
Se saldo_dia / max_abs_saldo > +0.1  → var(--positive-soft)
Se saldo_dia / max_abs_saldo < -0.1  → var(--negative-soft)
Caso contrário                        → var(--neutral-soft)
```
Dias fora do mês atual: opacidade 30%.
Célula "hoje": outline 2px var(--brand).

**Navegação:** Setas < e > para mês anterior/próximo. Botão "Hoje" retorna ao mês corrente.

**Drill-down:** Clique em célula → modal overlay com lista de lançamentos do dia (via `get_lancamentos_do_dia`), ordenados por valor decrescente, limitado a 100.

**Justificativa:** O Calendário responde "posso pagar a folha sexta?" e "o que vence semana que vem?" — perguntas operacionais que a tabela de Próximos Vencimentos não responde visualmente.
