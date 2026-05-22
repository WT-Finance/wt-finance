# ADR-0056 — Logo Welcome Group oficial na sidebar

**Status:** Aceito
**Data:** Maio/2026
**Versão:** v3.10-m1

## Contexto

A sidebar exibia placeholder de texto "Welcome Group / Finance Dashboard" desde v3.8 (ADR mencionado em pendências). O arquivo PNG oficial do logo Welcome Group foi fornecido com fundo transparente.

## Decisão

Substituir o placeholder de texto pelo logo oficial via `<Image>` do Next.js. Arquivo armazenado em `public/logos/welcome-group.png`. Altura fixa `h-8` com largura automática. Fallback de texto mantido via estado `onError` para robustez. Favicon e apple-touch-icon também atualizados a partir do mesmo logo.

## Consequências

- Sidebar exibe identidade visual oficial do Welcome Group
- Next.js `<Image>` garante otimização automática (lazy load, formato WebP quando suportado)
- Metadata do site atualizada com favicon correto
