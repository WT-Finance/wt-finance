# ADR-0055 — ADRs supersedidos marcados formalmente

**Status:** Aceito
**Data:** Maio/2026
**Versão:** v3.9-m0

## Contexto

O audit técnico pós-v3.8 identificou que dois ADRs estavam com status "Aceito" mas na prática já tinham sido substituídos por decisões posteriores. Sem marcação explícita, a documentação ficava contraditória: um desenvolvedor lendo o ADR antigo não saberia que a decisão foi revisada.

## Decisão

Atualizar o campo `Status` dos seguintes ADRs:

| ADR | Título | Novo status |
|-----|--------|-------------|
| 0031 | Data canônica do evento e Hotel a partir da linha Contrato=1 | Supersedido por ADR-0052 |
| 0036 | Padrão de listas compactas com Ver todos | Supersedido por ADR-0051 |
| 0037 | Hierarquia visual de seções recolhíveis | Parcialmente supersedido por ADR-0042 e ADR-0048 |

Não alterar outros campos dos ADRs (contexto, decisão original, consequências) — o histórico da decisão original tem valor documental.

## Consequências

- Documentação reflete a realidade do código
- Desenvolvedor encontra a decisão vigente via "Supersedido por ADR-XXXX" e vai direto ao ADR correto
- ADRs antigos preservados como registro histórico
