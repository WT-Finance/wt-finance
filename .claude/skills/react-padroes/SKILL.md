---
name: react-padroes
description: Padrões React/Next 16 do Janus — erros e avisos do lint eslint-plugin-react-hooks v7 / React Compiler (set-state-in-effect, static-components, immutability, exhaustive-deps) e os padrões canônicos que os corrigem SEM mudar comportamento (loading derivado de chave, initializer no useState, componente içado ao módulo, acumulador imutável); useEffect com fetch/setLoading; rotas pesadas com loading.tsx/skeleton (ADR-0144); startTransition em filtro que navega; promise+Suspense+use() para dado não-crítico. Use ao corrigir qualquer erro de lint de hooks, escrever useEffect/fetch com loading/estado derivado, ou criar rota/segmento novo.
---

# Padrões React/Next 16 do Janus

Duas preocupações distintas, ambas transversais a toda tela nova: (1) o lint de hooks do
React Compiler, que **falha o build** se violado mas **não valida comportamento**; e (2) a
percepção de velocidade ao navegar, que o App Router não dá de graça (RSC sem `loading.tsx`
trava a tela inteira até o servidor terminar).

## 1. `eslint-plugin-react-hooks` v7 está ligado em `error`

Vem do `eslint-config-next` (ruleset do React Compiler). Regras novas quebram padrões que
antes passavam — `set-state-in-effect`, `static-components`, `immutability` etc.

**O lint NÃO vê "comporta-se igual".** Ele só verifica a forma sintática do código; uma
correção mecânica pode preservar a intenção só por acaso ou só quebrar em runtime. Toda
correção destas regras exige **conferência funcional no preview**, não só gate verde — foi
assim que a v4.27.2 zerou os 12 achados pré-existentes do bump do plugin (comparados,
efeito por efeito, contra o comportamento do `main`; nenhuma tela mudou de aparência ou
timing perceptível).

Os cinco padrões abaixo resolvem os achados mais comuns **sem mudar comportamento**. Use-os
como receita — não invente uma correção ad-hoc por achado.

### a. Fetch com loading — nunca `setLoading(true)` síncrono no efeito

O erro clássico (`set-state-in-effect`) é chamar `setLoading(true)` como primeira linha do
corpo do `useEffect`. A saída é **derivar** `loading` de uma chave "última carregada":

```tsx
const [loadedKey, setLoadedKey] = useState<string | null>(null)
const currentKey = `${from}|${to}|${antFrom}|${antTo}` // tudo que o fetch depende
const loading = loadedKey !== currentKey || !dados

useEffect(() => {
  let cancelled = false
  fetchAlgo(from, to, antFrom, antTo).then(data => {
    if (cancelled) return
    setDados(data)
    setLoadedKey(currentKey)
  })
  return () => { cancelled = true }
}, [from, to, antFrom, antTo])
```

Durante um refetch (troca de filtro), a tela mostra os dados **anteriores** até a chave nova
chegar — idêntico ao comportamento com `setLoading` síncrono, só que sem o efeito colateral
que o lint reprova. Exemplo vivo: `src/components/weddings/weddings-kpis-section.tsx`.

### b. Init de mount → `useState` com initializer

`useEffect(() => setX(f()), [])` para inicializar estado uma vez é outro gatilho do
`set-state-in-effect`. Troque pelo **initializer** do próprio `useState`:

```tsx
// antes: useEffect(() => setX(calcularInicial()), [])
const [x, setX] = useState(() => calcularInicial())
```

`f()` roda uma vez, na primeira render, sem passar pelo efeito.

### c. Componente definido no render → içar para o MÓDULO

Definir um componente dentro do corpo de outro (`const Inner = (props) => ...` dentro de uma
function component) dispara `static-components` — e tem um custo real: a subárvore **remonta
a cada render** do pai (perde estado interno, refaz efeitos). Corrija içando `Inner` para o
escopo do módulo e passando por prop o que ele fechava por closure:

```tsx
// antes: function Pai() { const Inner = () => <div>{algoDoPai}</div>; return <Inner /> }
function Inner({ algo }: { algo: string }) { return <div>{algo}</div> }
function Pai() { return <Inner algo={algoDoPai} /> }
```

### d. Callback assíncrona reusada chamada no efeito → `void` + IIFE async

Quando o efeito recebe uma função assíncrona por prop/closure e a chama direto
(`useEffect(() => { cb() }, [cb])`), o lint acusa `set-state-in-effect` (a promise por trás
seta estado depois). Embrulhe:

```tsx
useEffect(() => {
  void (async () => { await cb() })()
}, [cb])
```

### e. Acumulador — sem reassign de `let` capturado

`let acc = 0; dados.map(d => { acc += d.valor; return acc })` reprova `immutability` (o
`.map` reassina uma variável capturada de fora a cada iteração). Troque por prefix-sum
explícito ou `reduce`:

```tsx
// antes: let acc = 0; const acumulado = dados.map(d => (acc += d.valor))
const acumulado = dados.reduce<number[]>((acc, d) => {
  const anterior = acc.at(-1) ?? 0
  return [...acc, anterior + d.valor]
}, [])
```

## 2. Rota pesada NASCE com `loading.tsx` (skeleton) — ADR-0144

Um segmento RSC **sem** `loading.tsx` deixa a tela **congelada** até TODO o trabalho do
servidor terminar — nenhum byte chega antes. Numa plataforma com queries agregadas e volume
de dado real, isso parece "travado" ao navegar. Todo segmento pesado (dashboard, tabela
densa) nasce com um `loading.tsx` que renderiza um skeleton na **silhueta real** da página,
montado com os blocos de `@/components/shared/skeletons` (`SkeletonPagina`,
`SkeletonFiltros`, `SkeletonTabela`...):

```tsx
// src/app/financeiro/dre/loading.tsx
import { SkeletonPagina, SkeletonFiltros, SkeletonTabela } from '@/components/shared/skeletons'

export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonFiltros n={6} />
      <SkeletonTabela linhas={14} />
    </SkeletonPagina>
  )
}
```

Receita (a mesma para qualquer segmento novo):
- **Silhueta aproximada** — header + filtros + cards/tabela na MESMA forma da página real
  (número de linhas/colunas aproximado; não precisa ser pixel-perfect).
- **Sem CLS** — alturas fixas, para o conteúdo real não "pular" ao substituir o skeleton.
- **Tom neutro** — `zinc` + `animate-pulse`, nunca token de marca (o skeleton não é tema de
  setor; é um estado de carregamento genérico).
- **Sidebar FORA** — o `loading.tsx` só substitui o `<main>`; a sidebar nunca pisca.
- **Mesmo container** (`max-w`/`px`) da página real — senão o conteúdo salta na troca.

Um `loading.tsx` num segmento cobre **todas as subrotas** dele — não precisa duplicar em
cada subpágina (ex.: `/performance/loading.tsx` cobre `/performance/trips`,
`/performance/corporativo`, `/performance/weddings`).

### Filtro que navega usa `startTransition` + `isPending` visível

Um filtro que muda a URL (`router.push`) sem `startTransition` faz o clique "morrer" —
nada acontece na tela até o RSC responder. Padrão vivo em
`src/components/shared/periodo-filter-pills-url.tsx`:

```tsx
const [isPending, startTransition] = useTransition()
// ...
startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
// ...
<div aria-busy={isPending} className={isPending ? 'opacity-60 pointer-events-none' : ''}>
```

`scroll: false` evita o pulo ao topo que o App Router faz por padrão ao trocar querystring —
outro detalhe que já causou "salto" reportado. A URL/semântica do filtro não muda; só a
percepção do clique.

### Dado NÃO-crítico sai do caminho bloqueante do layout

Um badge de contagem/pendência que não é essencial ao primeiro render não deve ficar num
`await` no layout — isso segura o primeiro byte da página inteira por causa de um dado
secundário. Padrão: transmitir a **promise** (sem `await`) e resolver no client com
`Suspense` + `use()`, com `.catch(() => null)` (falha inofensiva, o badge some, a página
segue):

```tsx
// layout.tsx (Server Component) — NÃO faz `await`
const pendenciasPromise = buscarPendencias().catch(() => null)
return <Suspense fallback={null}><BadgePendencias promise={pendenciasPromise} /></Suspense>

// badge-pendencias.tsx (Client Component)
function BadgePendencias({ promise }: { promise: Promise<number | null> }) {
  const n = use(promise)
  return n ? <Badge variant="count">{n}</Badge> : null
}
```

## Ver também

- **`ui-design-system`** — a receita visual completa do skeleton (tokens de cor neutra,
  primitivos de `ui/`) e o padrão de respiro/scroll do `<main>` que o skeleton precisa
  espelhar.
- **`contrato-rpc-front`** — RPC do Supabase é *thenable*, não `Promise` (`.catch()` direto
  nela estoura em runtime); relevante para qualquer fetch dentro dos padrões acima que chame
  uma RPC.
