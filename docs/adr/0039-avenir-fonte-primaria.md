# ADR-0039 — Avenir LT Std como fonte primária

**Status:** Aceito  
**Data:** 2026-05-19  
**Versão:** v3.7-M1

## Contexto

O dashboard usava Geist Sans (Google Fonts) como fonte principal — escolha padrão do boilerplate Next.js. A identidade visual da Welcome Trips usa Avenir LT Std em materiais impressos e apresentações. A ausência da fonte no dashboard criava descontinuidade visual entre o sistema e os demais artefatos da empresa.

## Decisão

Substituir Geist Sans por Avenir LT Std auto-hospedada via `@font-face` em `globals.css`.

Cinco pesos mapeados dos arquivos OTF disponíveis:

| Arquivo OTF         | `font-weight` CSS |
|---------------------|-------------------|
| AvenirLTStd-Light   | 300               |
| AvenirLTStd-Book    | 400               |
| AvenirLTStd-Roman   | 500               |
| AvenirLTStd-Medium  | 600               |
| AvenirLTStd-Heavy   | 800               |

Arquivos armazenados em `public/fonts/`. `font-display: swap` garante que texto seja exibido imediatamente com fallback enquanto a fonte carrega.

## Consequências

- Identidade visual consistente entre dashboard e materiais da empresa
- Sem dependência de CDN externo para a fonte principal
- Fallback: `ui-sans-serif, system-ui, sans-serif` — leitura não é interrompida durante carregamento
- Geist Mono mantida para código/valores monospace
