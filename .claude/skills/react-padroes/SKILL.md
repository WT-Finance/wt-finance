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

⚠️ **O custo não é só performance — pode ser FOCO, e aí é acessibilidade.** O React remonta
por **tipo** (a referência da função), não por `key`: com o componente definido no render,
QUALQUER estado do pai remonta a subárvore, mesmo estado alheio a ela.

**Custou caro (v5.9.1):** numa linha de anexo com botão de excluir, os `setState` de
"fecha o modal" + "marca em exclusão" são agrupados num commit só. O modal fechava e a linha
remontava **juntos** — e o cleanup de foco do `ModalCentral` (`return () => anterior?.focus?.()`)
tentava devolver o foco ao botão original, que já havia sido **substituído**. `.focus()` em nó
destacado é no-op: o foco caía no `document.body`. A navegação por teclado quebrava no fluxo
recém-criado, sem erro nenhum no console.

Ao içar, o lint pode acusar coisas que estavam escondidas: uma função que **retorna um
componente** (`const Icone = escolherIcone(...)`) dispara `static-components` dentro de um
componente de módulo. Semanticamente é falso-positivo — selecionar um de quatro componentes
existentes não cria nada —, mas a saída limpa é a função devolver o **elemento** pronto
(`return <FileText … />`), não o componente. Nunca silenciar a regra.

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

⚠️ **Esta receita estava escrita aqui e NÃO SEGUROU.** Na v5.4.2 o Yan reportou o salto ao
topo no filtro de Weddings, e a varredura achou **7 call-sites** sem o `scroll: false`
(`periodo-pills-url`, `periodo-filter-url`, `setor-filter`, `metas-periodo-pills`,
`cadastro-grade`, `solicitacoes-content` ×2) — contra **2** que o seguiam. Ou seja: o padrão
documentado perdeu de 7 a 2. Todos corrigidos na v5.4.2, mas a lição é sobre o MEIO, não
sobre o conteúdo: isto é candidato a **enforcement mecânico** (régua dos 5 destinos,
destino 1) — uma regra `wt/*` que exija `scroll: false` quando o destino do
`router.push`/`replace` é o próprio `pathname`. Enquanto a regra não existir (depende do
protocolo D5: `eslint.config.*` é alvo do hook `protecao-config`), **confira o grep antes
de dar um filtro por pronto**:

```bash
grep -rn "router.push(\`\${pathname}" src/ | grep -v "scroll: false"
```

**Critério, para não errar o alvo:** `scroll: false` é para navegação que fica no **MESMO
`pathname`** (filtro/recorte — a página é a mesma, só o conteúdo muda). Navegação **entre
rotas** deve continuar rolando ao topo; é o comportamento certo para uma página nova.

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

## 3. Tela de dado + escrita: três armadilhas que nenhum gate pega

O padrão da casa para uma tela com escrita é **dado pronto do RSC + server action +
`router.refresh()`** (`tipos-content.tsx`, `chaves-api-content.tsx`, `inventario-content.tsx`).
Sem cópia local do dado do servidor: com uma segunda fonte no cliente, ela envelhece e a tela
passa a discordar de si mesma.

🔎 **O SINTOMA, para reconhecer sem precisar deduzir:** *a ação funciona, o banco muda, e a
tela só reflete ao FECHAR E REABRIR o painel.* Se aparecer isso, procure um
`useState<Objeto>` que recebeu o dado inteiro num clique — o `router.refresh()` está
funcionando e atualizando a prop, mas alguém guardou uma cópia antes.

```tsx
// ERRADO: congela o retrato do clique; refresh atualiza `lista`, não `aberta`
const [aberta, setAberta] = useState<Item | null>(null)
<Lista itens={lista} onAbrir={setAberta} />

// CERTO: guarda o ID e DERIVA da lista viva — o refresh resolve sozinho
const [abertaId, setAbertaId] = useState<number | null>(null)
const aberta = abertaId == null ? null : lista.find(i => i.id === abertaId) ?? null
```

**Custou caro (v5.9.1):** anexar/excluir não atualizava o drawer. A regra já estava escrita
aqui e não me fez enxergar o caso — foi o sintoma que denunciou. ⚠️ E confira os OUTROS
call-sites do mesmo componente antes de dar por resolvido: se algum recebe o objeto de uma
*server action* em vez de uma lista (era o caso da página de Movimentações), não há de onde
derivar e ele precisa de um gancho próprio para rebuscar. As três armadilhas abaixo apareceram juntas na v5.6.0 e as três
compilam, passam no lint e no build.

### a. Modal de formulário reusado entre itens precisa de `key` que MUDE

`useState` com initializer só roda **na montagem**. Um modal reaproveitado (editar item A →
editar item B; ou "salvar e cadastrar outro") mantém o estado do anterior: a próxima peça nasce
com o código e a série da última. Renderizar condicionalmente **não** basta se a árvore não
muda de identidade.

```tsx
// Contador de gerações na key → remonta de verdade a cada abertura.
const [geracao, setGeracao] = useState(0)
<FormModal key={modo === 'editar' ? `editar-${item.id}` : `criar-${geracao}`} … />
```

Não usar um campo do próprio dado como `key` (`criar-${descricao}`): dois itens iguais em
sequência não remontariam.

### b. Guard de resposta atrasada compara com o último PEDIDO, não com o estado atual

Abrir o detalhe de A e, antes de a resposta chegar, abrir o de B faz duas leituras correrem.
Sem desempate, a resposta atrasada de A sobrescreve a de B — o drawer de B mostra o histórico
de A. O guard tem de saber **o que foi pedido por último**, o que é `useRef` (não estado: não
pinta tela e não pode disparar re-render):

```tsx
const pedido = useRef<number | null>(null)
async function buscar(alvo: number) {
  pedido.current = alvo
  const res = await carregarDetalhe(alvo)
  if (pedido.current !== alvo) return        // um pedido mais novo assumiu
  setDetalhe(res.detalhe)
}
```

⚠️ Comparar com o **detalhe já carregado** (`if (atual.id !== alvo) return atual`) parece
equivalente e está **invertido**: descarta justamente a resposta certa, porque no momento em
que B responde o estado ainda guarda A. Foi o bug pego na auto-auditoria da v5.6.0.

### c. Lista com teto de linhas: a tela AVISA, não trunca calada

RPC de listagem com `LIMIT`/`p_limite` devolve "as N mais recentes". Derivar dela algo que
precisa ser **completo** (o histórico de um item, um total) trunca em silêncio quando o volume
cresce, e nada acusa. Duas saídas, ambas usadas na v5.6.0: para o que precisa ser completo,
chamar a RPC específica (`detalhe_ativo`, que também dá leitura numa transação só); para a
lista em si, sinalizar na UI quando o teto foi batido.

## Ver também

- **`ui-design-system`** — a receita visual completa do skeleton (tokens de cor neutra,
  primitivos de `ui/`) e o padrão de respiro/scroll do `<main>` que o skeleton precisa
  espelhar.
- **`contrato-rpc-front`** — RPC do Supabase é *thenable*, não `Promise` (`.catch()` direto
  nela estoura em runtime); relevante para qualquer fetch dentro dos padrões acima que chame
  uma RPC.
