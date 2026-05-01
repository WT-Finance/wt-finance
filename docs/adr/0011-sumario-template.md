# ADR 0011 — Template estático para o Sumário Executivo

**Status:** aceito  
**Data:** 2026-05-01

## Contexto

A v3.0 introduz um bloco de texto narrativo no topo da Aba Executiva que contextualiza os dados do período antes do usuário ver os números. Duas abordagens foram consideradas:

1. **Template TypeScript determinístico** — frases moduladas por dados, compostas em código.
2. **IA generativa (Claude API)** — prompt com dados → texto livre.

## Decisão

Usar **template TypeScript** para v3.0. A integração com IA fica adiada para v3.1 ou v4, após validação do template com usuários reais.

**Razões:**
- O texto de IA requer chamada extra de rede (~1-3s de latência) e custo por request.
- Templates determinísticos são 100% testáveis, previsíveis e não apresentam alucinações.
- O conjunto de cenários relevantes é pequeno e bem definido — o template cobre adequadamente.
- A estrutura de `DadosSumario` e as funções auxiliares (`montarFraseFaturamento`, etc.) são projetadas para aceitar substituição por IA no futuro sem mudanças na interface.

## Desvio do briefing: sem API Route

O briefing especifica `GET /api/dashboard/executiva/sumario`. Foi decidido **não criar** essa Route Handler porque:

1. Todos os dados necessários para o Sumário (`kpis`, `mix`, `prejuizos`) já são carregados em `executiva/page.tsx` via `Promise.all`.
2. Uma Route Handler repetiria as mesmas chamadas ao banco — overhead sem benefício na v3.0.
3. O Sumário é calculado como string pura em `gerarSumarioExecutivo(dadosSumario)`, sem I/O adicional.

Caso a v3.1 migre para IA, a API Route passará a fazer sentido (o LLM roda server-side numa edge function), e será criada nesse momento.

## Estrutura técnica

```
src/lib/sumario-executivo.ts   — lógica pura (DadosSumario → string)
src/components/executiva/
  sumario-executivo.tsx        — renderização com **negrito** inline
src/app/executiva/page.tsx     — monta DadosSumario e passa para o componente
```

## Consequências

- **Positivo:** zero latência extra (texto calculado durante o render do Server Component).
- **Positivo:** totalmente testável com dados sintéticos.
- **Positivo:** estrutura preparada para upgrade para IA sem mudar a interface do componente.
- **Negativo:** texto menos natural que IA para cenários fora da árvore de condições.
- **Negativo:** cada novo tipo de frase exige mudança no código (vs prompts ajustáveis em IA).
