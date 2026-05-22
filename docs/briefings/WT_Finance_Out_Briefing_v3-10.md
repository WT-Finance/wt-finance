# WT Finance — Out-Briefing v3.10

**Data:** 2026-05-22  
**Branch:** `feat/v3-10` (base: `main` pós-PR #59)  
**Commits:** 24 (M1 + M2 + M3 + M4 + iterações de refinamento visual + correções pós-review)  
**TypeScript:** limpo (`npx tsc --noEmit --skipLibCheck`)  
**Migrations aplicadas:** nenhuma (v3.10 é puramente frontend/visual)

---

## Missões implementadas

### M1 — Logo oficial, ícones nas sub-abas e favicon (ADR-0056, ADR-0057)

**Logo Welcome Group na sidebar**

O placeholder de texto "Welcome Group / Finance Dashboard" que existia desde v3.8 foi substituído pelo logo oficial via `<Image>` do Next.js (`public/logos/welcome-group.png`). Implementação com `fill + object-cover + scale-[0.82]` dentro de um container `h-10 overflow-hidden`: o `object-cover` elimina o espaço vazio vertical do PNG quadrado (1080×1080 com whitespace interno), e o `scale-[0.82]` reduz o visual em ~18% sem cropping nem perda de proporção.

Abaixo da imagem, subtítulo centralizado com tipografia da ID Visual: "**WT FINANCE**" em `font-[800] uppercase tracking-[1px]` com `var(--brand)` (dourado), e "version 3.10" ao lado em `font-medium` com `var(--text-muted)`.

**Logo dinâmico por aba**

Ao navegar para `/performance/weddings`, o logo troca automaticamente para `welcome-weddings.png` (logo específico da unidade Weddings). Nas demais rotas, permanece o logo Welcome Group. O estado de erro (`imgError`) é resetado via `useEffect` na troca de `src`, garantindo que o fallback de texto não fique preso entre navegações.

**Ícones nas sub-abas de Performance** (ADR-0057)

As 4 sub-abas que antes tinham apenas texto receberam ícones Lucide React:

| Sub-aba     | Ícone      | Justificativa                          |
|-------------|------------|----------------------------------------|
| Geral       | Building   | Tom institucional, agregação de setores|
| Trips       | Plane      | Padrão consagrado para viagens         |
| Weddings    | Sparkles   | Celebração sofisticada                 |
| Corporativo | Briefcase  | Padrão B2B em ferramentas corporativas |

Tamanho 14px, stroke 1.8, cor `text-zinc-400` inativo / `var(--brand)` ativo — consistente com os demais ícones da sidebar.

**Favicon e apple-touch-icon**

`public/favicon.ico` e `public/apple-touch-icon.png` substituídos pelo logo oficial. Metadata em `src/app/layout.tsx` atualizada com `icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' }` e `description: 'Welcome Group'`.

---

### M2 — Paleta Corporativo reorganizada com Pantone 7476 C (ADR-0058)

A cor principal da aba Corporativo (`#4B4F54`, Pantone 7540) era percebida como cinza demais. O Pantone 7476 C (`#0D5257`) — azul-teal profundo já presente no projeto como `--brand-deep` de Trips — foi realocado para Corporativo. Trips recebeu um novo `--brand-deep` derivado de sua família Pantone 632.

**Alterações em `src/styles/tokens.css`:**

| Aba         | Token          | Antes      | Depois     |
|-------------|----------------|------------|------------|
| Trips       | `--brand-deep` | `#0D5257`  | `#005670`  |
| Corporativo | `--brand`      | `#4B4F54`  | `#0D5257`  |
| Corporativo | `--brand-soft` | `#E5E7EA`  | `#DDE7E9`  |
| Corporativo | `--brand-deep` | `#2C3338`  | `#072F33`  |

Resultado: aba Corporativo com tom azul-marinho perceptível; aba Trips mantém o azul brilhante Pantone 632 inalterado. Ambas as cores Pantone são oficiais do Welcome Group.

---

### M3 — Tooltips Recharts unificados (ADR-0059)

O `CustomTooltip` (criado na v3.8, M4) estava aplicado em todos os gráficos Recharts do projeto, exceto um: o mini-gráfico acumulado dentro do `DrilldownDrawer` (`src/components/weddings/drilldown-drawer.tsx`), que usava `contentStyle` e `labelStyle` inline.

Substituído por `<Tooltip content={<CustomTooltip formatter={fmtBRL} />}>` — idêntico ao padrão dos demais gráficos. `CustomTooltip` é agora o único ponto de manutenção de estilo de tooltip no projeto (tokens CSS, fonte Avenir, sombra do design system).

---

### M4 — Empty states e skeletons (componentes de lista)

**M4.1 — Componente `EmptyState` reutilizável**

Criado `src/components/shared/empty-state.tsx`: recebe um `LucideIcon` e uma `message`, renderiza ícone centralizado (`size={32}`, `strokeWidth={1.2}`, `var(--text-subtle)`) com texto abaixo em `var(--text-muted)`. Sem dependências externas além do tipo `LucideIcon`.

**M4.2 — Empty states nos 4 componentes de lista**

Substituídas as condições `if (!data)` que retornavam nada (ou `null`) pelos empty states com ícone contextual:

| Componente                       | Ícone        | Mensagem                                                    |
|----------------------------------|--------------|-------------------------------------------------------------|
| `proximos-casamentos-card.tsx`   | Calendar     | Nenhum casamento previsto para o horizonte selecionado      |
| `vendas-em-aberto-card.tsx`      | Inbox        | Nenhuma venda em aberto no momento                          |
| `vendas-receita-negativa-card.tsx`| TrendingDown | Nenhuma operação com receita negativa registrada            |
| `lista-operacoes.tsx`            | Search       | Nenhuma operação encontrada para os filtros selecionados    |

**M4.3 — Skeleton estruturado em Composição por Subsetor**

O skeleton anterior de `weddings-composicao-section.tsx` era um `div h-32 animate-pulse` genérico. Substituído por um skeleton estruturado que replica a forma da tabela real: título (barra de 48×20px), seguido de 4 linhas com dot colorido, barra de nome, barra de progresso, e três colunas de valor — todos `bg-zinc-100 animate-pulse`. Elimina o layout shift perceptível ao carregar.

---

## Correções pós-review

### Iterações de ajuste do logo (6 commits)

O PNG oficial (1080×1080 RGBA) tem whitespace interno significativo ao redor do lockup "W WELCOME GROUP". A abordagem final foi obtida após 6 iterações:

- `h-8 w-auto object-contain` → muito pequeno
- `w-full h-auto max-w-[160px]` → boa largura, mas PNG whitespace ocupava muito espaço vertical
- `h-16 w-16` → quadrado pequeno, imperceptível
- `h-10 object-cover` → boa proporção, mas logo levemente grande
- `w-[130px] h-10 object-cover` → horizontal cropping visível  
- **Final:** `h-10 overflow-hidden + object-cover + scale-[0.82]` — escala o visual 18% para baixo dentro do mesmo container sem cropping nem gaps visíveis

### Subtítulo "WT FINANCE version 3.10"

Adicionado após solicitação do usuário. Várias rodadas de ajuste de `margin-top` (0.5 → 4), tamanhos de fonte (11px → 14px para "WT Finance"; 10px fixo para "version 3.10") e gap (2 → 1) até aprovação.

### Logo dinâmico para aba Weddings

Adicionado ao final da sessão: `WelcomeGroupLogo` recebeu prop `src` (e `alt`). `SidebarContent` computa `logoSrc` com base em `pathname.startsWith('/performance/weddings')`. `useEffect` reseta `imgError` na troca de `src`.

---

## Estado final do codebase

| Área                                         | Status              |
|----------------------------------------------|---------------------|
| TypeScript (`npx tsc --noEmit --skipLibCheck`)| ✅ Limpo            |
| Migrations aplicadas                         | Nenhuma (v3.10 é visual) |
| ADRs 0056–0059                               | ✅ Documentados     |
| Logo oficial na sidebar                      | ✅ Implementado     |
| Logo dinâmico Weddings                       | ✅ Implementado     |
| Ícones sub-abas Performance                  | ✅ Implementado     |
| Favicon + apple-touch-icon                   | ⚠️ Parcial (ver pendências) |
| Paleta Corporativo (Pantone 7476)            | ✅ Implementado     |
| Tooltips Recharts unificados                 | ✅ Implementado     |
| Empty states (4 componentes)                 | ✅ Implementado     |
| Skeleton estruturado (Composição)            | ✅ Implementado     |

---

## Pendências para v3.11+

**Aba Trips e Corporativo — conteúdo específico**  
Ambas exibem `PerformanceContent` genérico. `PeriodoFilterProvider` já está disponível no layout — as seções de KPIs/Mix podem ser convertidas para o padrão de pills contextuais quando o conteúdo dessas abas for definido.

**RPC `get_sparklines` no banco**  
Removida do frontend na v3.9 (ADR-0054), mas permanece ativa no banco. Pode ser removida via migration de limpeza em versão futura.

**Fluxo de Caixa — granularidade efetivado/previsto intra-mês**  
A distinção atual é por mês inteiro via `eh_futuro`. Separação intra-mês requer nova RPC com campos `entrada_efetivado` e `entrada_previsto` separados.

**Demonstração para a gestora de Weddings**  
Pendente desde v3.6.

**Logo dinâmico — extensão para sub-rotas**  
Atualmente o logo Weddings aparece apenas em `/performance/weddings`. Se surgirem sub-rotas como `/performance/weddings/operacao/:id`, a condição `pathname.startsWith('/performance/weddings')` já cobre — sem alteração necessária.

**Favicon — ícone borrado na aba do navegador** ⚠️  
O logo Welcome Group é um lockup horizontal complexo ("W + WELCOME GROUP") que fica inevitavelmente borrado em 16–32px. Tentativas realizadas na v3.10: substituição do `favicon.ico` padrão do Next.js pelo logo oficial, geração de `icon.png` 512×512 com recorte do símbolo W, remoção do `favicon.ico` de `src/app/` e `public/` para forçar uso do PNG via meta tag. Nenhuma resolveu de forma visível. A remoção do `public/favicon.ico` eliminou o ícone completamente, sendo revertida. Estado atual: `public/favicon.ico` (32×32/48×48, logo completo) + `src/app/icon.png` (512×512, símbolo W recortado) — ícone aparece mas borrado. Solução definitiva requer criar um ícone dedicado para favicon — apenas o símbolo "W" isolado, desenhado/vetorizado com espessura otimizada para 16px — fora do escopo de v3.10.

---

## Arquivos modificados ou criados na v3.10

```
src/components/layout/sidebar.tsx                         ← logo oficial, ícones sub-abas, subtítulo, logo dinâmico
src/app/layout.tsx                                        ← favicon + apple-touch-icon metadata
src/styles/tokens.css                                     ← paleta Corporativo (Pantone 7476) + Trips brand-deep
src/components/weddings/drilldown-drawer.tsx              ← CustomTooltip substituindo inline styles
src/components/shared/empty-state.tsx                     ← novo: componente reutilizável
src/components/weddings/proximos-casamentos-card.tsx      ← empty state (Calendar)
src/components/weddings/vendas-em-aberto-card.tsx         ← empty state (Inbox)
src/components/weddings/vendas-receita-negativa-card.tsx  ← empty state (TrendingDown)
src/components/weddings/lista-operacoes.tsx               ← empty state (Search)
src/components/weddings/weddings-composicao-section.tsx   ← skeleton estruturado
public/logos/welcome-group.png                            ← novo: logo oficial Welcome Group
public/logos/welcome-weddings.png                         ← novo: logo Welcome Weddings
public/favicon.ico                                        ← novo: favicon oficial (restaurado pós-review)
src/app/favicon.ico                                       ← removido (substituído por icon.png)
src/app/icon.png                                          ← novo: 512×512 símbolo W recortado
public/apple-touch-icon.png                               ← novo: apple touch icon
docs/adr/0056-logo-welcome-group-sidebar.md               ← novo
docs/adr/0057-icones-subabas-performance.md               ← novo
docs/adr/0058-paleta-corporativo-pantone-7476.md          ← novo
docs/adr/0059-tooltips-recharts-customizados.md           ← novo
```
