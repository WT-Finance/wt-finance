# Apêndice v3.6 — Decisões e Status de Componentes

**Versão:** v3.6 · Maio de 2026
**Contexto:** Resultado da verificação M6 e decisões pendentes documentadas durante o ciclo v3.6.

---

## M6 — Performance ao longo do tempo

### Status verificado em v3.6

**Componente NÃO implementado.** Nenhuma referência ao componente encontrada no código:

- `grep -rn "Performance ao longo\|longo do tempo\|PerformanceLongoTempo"` → zero resultados
- Nenhum arquivo em `src/components/` com toggle data_venda vs data_casamento
- Nenhuma RPC ou view materializada com série temporal por data de casamento

### Histórico

O componente foi planejado na v3.5 como "gráfico de evolução com toggle: ordenar por data da venda ou por data do casamento". Nunca chegou a ser implementado — o escopo da v3.5 foi redirecionado para funcionalidades de maior prioridade (Receita Líquida, Carteira, Próximos Casamentos).

### Decisão registrada

**Manter como pendência para v3.7+**, sem prazo definido.

**Razão:** O componente requer RPC nova com granularidade mensal por data_evento (campo `data_inicio_evento` de `raw.vendas_excel`). A base de dados já tem a coluna (`ADR-0031`), então a implementação é viável. Porém, a diretoria ainda não solicitou explicitamente essa visão, e a v3.6 já entrega narrativa executiva suficiente via KPIs + Próximos Casamentos.

**Critério de retomada:** Yan ou a gestora de Weddings solicitarem a visão de evolução temporal explicitamente após uso real da v3.6.

---

## Decisões pendentes para v3.7+

Reproduzidas do briefing v3.6, seção 6:

- **Critérios de Situação:** Definir tratamento de vendas canceladas, pagamentos parciais e processo de fechamento (manual ou automático) com equipe comercial. Pode gerar ADR adicional.
- **Trips e Corporativo:** Fora do escopo até v3.6 estar consolidada e gestora de Weddings ter dado feedback do uso real.
- **Gestora de Weddings:** Compartilhamento do dashboard ainda pendente. Vale acontecer durante ou após v3.6, com sessão de demonstração e coleta estruturada de feedback.
- **Posição da Carteira:** Se diretoria não comentar sobre Carteira em reuniões pós-v3.6, considerar mover para mais perto do topo na v3.7.
- **Mix por Produto e Vendas com Prejuízo:** Reavaliação de relevância adiada para após v3.6, quando uso continuar e padrões ficarem claros.
