# ADR-0058 — Paleta Corporativo reorganizada com Pantone 7476 C

**Status:** Aceito
**Data:** Maio/2026
**Versão:** v3.10-m2

## Contexto

A cor principal da aba Corporativo (`#4B4F54`, Pantone 7540) foi percebida como "cinza demais", destoando do desejo de um tom mais azul. O Pantone 7476 C (`#0D5257`) estava em uso como `--brand-deep` da aba Trips — um azul-teal profundo que atendia melhor ao desejo de Corporativo.

## Decisão

Realocar Pantone 7476 para Corporativo e dar a Trips um `--brand-deep` derivado de sua família de azul Pantone 632:

**Trips** (alterado apenas brand-deep):
- `--brand-deep: #0D5257 → #005670` (variação escura do Pantone 632)

**Corporativo** (alterado brand, brand-soft e brand-deep):
- `--brand: #4B4F54 → #0D5257` (Pantone 7476 C — azul-teal)
- `--brand-soft: #E5E7EA → #DDE7E9`
- `--brand-deep: #2C3338 → #072F33`

## Consequências

- Aba Corporativo tem tom azul-marinho perceptível
- Aba Trips mantém identidade azul brilhante (Pantone 632 inalterado)
- Cabeçalhos Opção B em ambas abas refletem novo brand-deep
- Ambas as cores Pantone são oficiais do Welcome Group
