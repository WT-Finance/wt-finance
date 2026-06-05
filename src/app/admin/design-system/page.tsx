import type { ReactNode } from 'react'
import ChartShowcase from './chart-showcase'

export const dynamic = 'force-dynamic'

export default function DesignSystemPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-1">
          Design System
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Catálogo visual de tokens e componentes do WT Finance. Referência interna para desenvolvimento.
        </p>
      </div>

      {/* Navegação */}
      <nav className="flex flex-wrap gap-3 mb-10 pb-6 border-b border-[var(--border)]">
        {[
          ['#brand', '1. Brand'],
          ['#dessaturada', '2. Dessaturada'],
          ['#subsetores', '3. Subsetores'],
          ['#tipografia', '4. Tipografia'],
          ['#cards', '5. Cards'],
          ['#pills', '6. Pills'],
          ['#tabelas', '7. Tabelas'],
          ['#graficos', '8. Gráficos'],
          ['#drawers', '9. Drawers'],
          ['#componentes', '10. Componentes'],
        ].map(([href, label]) => (
          <a key={href} href={href}
            className="text-xs text-[var(--brand)] hover:underline px-2 py-1 rounded bg-zinc-50">
            {label}
          </a>
        ))}
      </nav>

      <Section id="brand" title="1. Paleta Brand Welcome">
        <ColorGrid items={[
          { name: '--text-primary',   hex: '#1A1814', usage: 'Texto principal, H1' },
          { name: '--brand',          hex: '#BD965C', usage: 'Dourado Welcome — valores destaque, links' },
          { name: '--text-secondary', hex: '#4B4F54', usage: 'H3, texto secundário' },
          { name: '--text-muted',     hex: '#75777B', usage: 'Legendas, sufixos, hints' },
          { name: '--border',         hex: '#E8E0D2', usage: 'Bordas suaves de separação' },
        ]} />
      </Section>

      <Section id="dessaturada" title="2. Paleta Dessaturada — Fluxo de Caixa">
        <ColorGrid items={[
          { name: '--positive',       hex: '#5F7A3D', usage: 'Entradas, saldo positivo' },
          { name: '--positive-soft',  hex: '#C4D5A6', usage: 'Fundo de células positivas, badges' },
          { name: '--positive-deep',  hex: '#3F5028', usage: 'Texto sobre --positive-soft' },
          { name: '--negative',       hex: '#A35442', usage: 'Saídas, saldo negativo' },
          { name: '--negative-soft',  hex: '#E8C9C0', usage: 'Fundo de células negativas, badges' },
          { name: '--negative-deep',  hex: '#6B2D1F', usage: 'Texto sobre --negative-soft' },
          { name: '--neutral',        hex: '#C99E5E', usage: 'Atenção, estado neutro' },
          { name: '--neutral-soft',   hex: '#F5E6CC', usage: 'Fundo badge HOJE' },
          { name: '--danger',         hex: '#B85C5C', usage: 'Pontos negativos em gráficos' },
        ]} />
      </Section>

      <Section id="subsetores" title="3. Cores de Subsetores Weddings">
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Alinhadas às barras do gráfico Composição por Subsetor. Usar via{' '}
          <code className="bg-zinc-100 px-1 rounded">var(--subsetor-*)</code>.
        </p>
        <ColorGrid items={[
          { name: '--subsetor-comercial',    hex: '#8C857B', usage: 'Comercial' },
          { name: '--subsetor-planejamento', hex: '#8F7E35', usage: 'Planejamento' },
          { name: '--subsetor-producao',     hex: '#874B52', usage: 'Produção' },
          { name: '--subsetor-hospedagens',  hex: '#4B4F54', usage: 'Convidados – Hospedagens' },
          { name: '--subsetor-extras',       hex: '#7A8289', usage: 'Convidados – Extras' },
        ]} />
      </Section>

      <Section id="tipografia" title="4. Tipografia">
        <div className="space-y-5">
          {[
            { label: 'H1 — Título de página',    cls: 'text-2xl font-semibold',                            code: 'text-2xl font-semibold' },
            { label: 'H2 — Título de seção',     cls: 'text-xl font-semibold text-[var(--brand)]',         code: 'text-xl font-semibold text-[var(--brand)]' },
            { label: 'H3 — Título de card',      cls: 'text-base font-semibold',                           code: 'text-base font-semibold' },
            { label: 'Corpo — Padrão',           cls: 'text-sm',                                           code: 'text-sm' },
            { label: 'Pequeno — Labels e hints', cls: 'text-xs text-[var(--text-muted)]',                  code: 'text-xs text-[var(--text-muted)]' },
            { label: 'Mini — Badges e pills',    cls: 'text-[11px] font-medium',                           code: 'text-[11px] font-medium' },
          ].map(({ label, cls, code }) => (
            <div key={label} className="flex items-baseline justify-between gap-4 pb-3 border-b border-zinc-100">
              <span className={cls}>{label}</span>
              <code className="text-[10px] text-[var(--text-muted)] bg-zinc-50 px-2 py-0.5 rounded">{code}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section id="cards" title="5. Cards — Variantes">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="bg-white rounded-xl shadow-sm px-5 py-4 mb-2">
              <p className="text-sm font-medium mb-1">Default</p>
              <p className="text-xs text-[var(--text-muted)]">shadow-sm, rounded-xl</p>
            </div>
            <code className="text-[10px] text-[var(--text-muted)]">shadow-sm</code>
          </div>
          <div>
            <div className="bg-white rounded-xl border-2 border-[var(--brand)] px-5 py-4 mb-2">
              <p className="text-sm font-medium mb-1">Featured</p>
              <p className="text-xs text-[var(--text-muted)]">border-2 brand</p>
            </div>
            <code className="text-[10px] text-[var(--text-muted)]">border-2 border-[--brand]</code>
          </div>
          <div>
            <div className="bg-white rounded-lg shadow-sm px-3 py-3.5 mb-2">
              <p className="text-sm font-medium mb-1">Size sm</p>
              <p className="text-xs text-[var(--text-muted)]">rounded-lg, padding menor</p>
            </div>
            <code className="text-[10px] text-[var(--text-muted)]">size=&quot;sm&quot;</code>
          </div>
        </div>

        {/* Afordância de card clicável (v4.8.1) */}
        <div className="mt-8">
          <p className="font-medium text-[var(--text-primary)] text-sm mb-1">
            Afordância de card clicável — hover na cor da aba
          </p>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Card KPI que abre drawer ou navega. Em repouso é um card padrão{' '}
            <code className="bg-zinc-100 px-1 rounded">shadow-sm</code>; no{' '}
            <strong>hover</strong> (e foco por teclado), a borda e a sombra assumem a{' '}
            cor da aba e a CTA &quot;Ver mais&quot; acompanha. Aplicar a classe{' '}
            <code className="bg-zinc-100 px-1 rounded">card-clicavel</code> no card e{' '}
            <code className="bg-zinc-100 px-1 rounded">card-clicavel-cta</code> no texto da CTA.
            A regra é <em>keyed</em> em <code className="bg-zinc-100 px-1 rounded">var(--brand)</code>,
            então cada aba herda sua própria cor via{' '}
            <code className="bg-zinc-100 px-1 rounded">[data-theme]</code> — sem duplicar regra por setor.
          </p>

          {/* Exemplo ao vivo, sob o tema da aba Weddings */}
          <div data-theme="weddings" className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <div
                className="card-clicavel bg-white rounded-xl shadow-sm px-5 py-4 cursor-pointer"
                role="button"
                tabIndex={0}
              >
                <p className="text-sm font-medium mb-1">Card clicável</p>
                <p className="text-xs text-[var(--text-muted)] mb-2">Passe o mouse / Tab para focar</p>
                <div className="flex justify-end">
                  <span className="card-clicavel-cta text-[11px] text-[var(--brand)] font-medium">Ver mais ›</span>
                </div>
              </div>
              <code className="text-[10px] text-[var(--text-muted)]">card-clicavel + card-clicavel-cta</code>
            </div>
          </div>

          <div className="bg-zinc-50 rounded-xl p-4 text-xs font-mono text-[var(--text-muted)] space-y-1">
            <p>{'<div className="card-clicavel bg-white rounded-xl shadow-sm ..." role="button" tabIndex={0}>'}</p>
            <p className="pl-4">{'...'}</p>
            <p className="pl-4">{'<span className="card-clicavel-cta text-[--brand] ...">Ver mais ›</span>'}</p>
            <p>{'</div>'}</p>
            <p className="mt-2 not-italic font-sans">{'// repouso: shadow-sm · hover/foco: border + box-shadow = var(--brand), CTA → var(--brand-deep)'}</p>
          </div>
        </div>
      </Section>

      <Section id="pills" title="6. Pills e Botões de Filtro">

        {/* Especificação */}
        <div className="bg-zinc-50 rounded-xl p-4 text-xs font-mono text-[var(--text-muted)] space-y-1 mb-5">
          <p className="font-sans font-medium text-[var(--text-primary)] mb-2 not-italic">Padrão universal de pill</p>
          <p>{'// Inativo'}</p>
          <p>{'className="... rounded-full border font-medium'}</p>
          <p className="pl-4">{'border-zinc-200 text-zinc-500'}</p>
          <p className="pl-4">{'hover:border-zinc-300 hover:bg-zinc-50"'}</p>
          <p className="mt-2">{'// Ativo — via inline style (tokens CSS)'}</p>
          <p>{'style={{ background: "var(--brand-soft)",'}</p>
          <p className="pl-8">{'borderColor: "var(--brand)",'}</p>
          <p className="pl-8">{'color: "var(--brand-deep)" }}'}</p>
          <p className="mt-2 font-sans font-medium text-[var(--text-primary)] not-italic">Tamanhos</p>
          <p>{'md (Visão Geral, drawers analíticos): px-3 py-1 text-xs'}</p>
          <p>{'sm (Próximos Lançamentos, filtros inline): px-2.5 py-0.5 text-[11px]'}</p>
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-2">Tamanho <code className="bg-zinc-100 px-1 rounded">md</code> — pills de período (Visão Geral, drawers de KPI)</p>
            <div className="flex gap-2 flex-wrap">
              <PillDemo active>Este ano</PillDemo>
              <PillDemo>Este mês</PillDemo>
              <PillDemo>Últ. 3 meses</PillDemo>
              <PillDemo>Personalizado</PillDemo>
            </div>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-2">Tamanho <code className="bg-zinc-100 px-1 rounded">sm</code> — pills de tipo e período compactos (Próximos Lançamentos)</p>
            <div className="flex gap-2 flex-wrap">
              <PillDemo active size="sm">Todos</PillDemo>
              <PillDemo size="sm">A receber</PillDemo>
              <PillDemo size="sm">A pagar</PillDemo>
              <PillDemo active size="sm">10 dias</PillDemo>
              <PillDemo size="sm">5 dias</PillDemo>
              <PillDemo size="sm">Personalizado</PillDemo>
            </div>
          </div>
        </div>
      </Section>

      <Section id="tabelas" title="7. Tabelas e Listas">
        {/* Padrão de card-tabela (v4.11) */}
        <p className="font-medium text-[var(--text-primary)] text-sm mb-1">
          Padrão de card-tabela — <code className="bg-zinc-100 px-1 rounded">CardTabela</code>
        </p>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Cards cuja essência é uma tabela (Próximos Casamentos, Mix por Produto, Top Vendedores,
          Vendas em Aberto, Receita Negativa) consomem o mesmo shell{' '}
          <code className="bg-zinc-100 px-1 rounded">@/components/shared/card-tabela</code> nas três abas. Regras:
        </p>
        <ul className="text-xs text-[var(--text-muted)] space-y-1 list-disc pl-4 mb-4">
          <li><strong>Título único</strong> no card; <strong>sem subtítulo na página</strong> — o subtítulo vive só dentro do drawer (prop <code className="bg-zinc-100 px-1 rounded">subtitulo</code> do ListDrawer).</li>
          <li>Coluna <strong>“#”</strong> só em <strong>rankings</strong> (Mix por Produto, Top Vendedores). Listas cronológicas (Próximos Casamentos) não têm.</li>
          <li>Rótulo <strong>“no período selecionado”</strong> (cor da aba) só em cards que respeitam o filtro de período. Cards atemporais/futuros não têm.</li>
          <li>Cabeçalho de coluna: caixa normal, ~11px, cor terciária — usar <code className="bg-zinc-100 px-1 rounded">CARD_TABELA_TH</code> + <code className="bg-zinc-100 px-1 rounded">text-left/right</code>.</li>
          <li>Valores à direita, <code className="bg-zinc-100 px-1 rounded">tabular-nums</code>. Casas decimais por contexto (ADR-0100): 2 casas só em operação individual (ex.: Resultado Previsto); agregados sem centavos.</li>
          <li>Truncamento via <code className="bg-zinc-100 px-1 rounded">table-fixed</code> + <code className="bg-zinc-100 px-1 rounded">colgroup</code> com larguras + <code className="bg-zinc-100 px-1 rounded">truncate</code> (não <code className="bg-zinc-100 px-1 rounded">max-w</code> ad-hoc).</li>
          <li><strong>“Ver mais”</strong>: cinza em repouso, cor da aba no hover (<code className="bg-zinc-100 px-1 rounded">.card-tabela-vermais</code>), divisória acima. Some quando não há mais itens.</li>
        </ul>
        <div className="bg-zinc-50 rounded-xl p-4 text-xs font-mono text-[var(--text-muted)] space-y-1 mb-6">
          <p>{'<CardTabela titulo="Mix por Produto" periodoLabel="no período selecionado"'}</p>
          <p className="pl-4">{'temMais={temMais} onVerMais={() => setDrawerOpen(true)}>'}</p>
          <p className="pl-4">{'<table className="w-full table-fixed text-sm">'}</p>
          <p className="pl-8">{'<colgroup><col className="w-8" /><col />...</colgroup>'}</p>
          <p className="pl-8">{'<thead><th className={`${CARD_TABELA_TH} text-left`}>#</th>...</thead>'}</p>
          <p className="pl-8">{'<tbody>...</tbody>'}</p>
          <p className="pl-4">{'</table>'}</p>
          <p className="pl-4">{'{open && <ListDrawer subtitulo="...">...lista completa...</ListDrawer>}'}</p>
          <p>{'</CardTabela>'}</p>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)] mb-2">Badges de tipo (Próximos Lançamentos)</p>
          <div className="flex gap-2 flex-wrap">
            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium"
              style={{ background: 'var(--positive-soft)', color: 'var(--positive-deep)' }}>
              A Receber
            </span>
            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium"
              style={{ background: 'var(--negative-soft)', color: 'var(--negative-deep)' }}>
              A Pagar
            </span>
            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium"
              style={{ background: 'var(--neutral-soft)', color: 'var(--neutral)' }}>
              HOJE
            </span>
          </div>
        </div>
      </Section>

      <Section id="graficos" title="8. Gráficos — Padrão (tom discreto)">
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Primitivos reutilizáveis em{' '}
          <code className="bg-zinc-100 px-1 rounded">@/components/charts</code>. Tema central
          em <code className="bg-zinc-100 px-1 rounded">chart-theme.ts</code> (cores, margens,
          dasharrays, tamanhos). Eixos, grade, linha-zero e legenda vêm prontos — não
          reimplementar. Cores sempre via token CSS.
        </p>

        {/* Exemplos visuais ao vivo */}
        <ChartShowcase />

        {/* Convenção sólido x tracejado */}
        <div className="bg-zinc-50 rounded-xl p-4 mt-6 mb-6">
          <p className="font-medium text-[var(--text-primary)] text-sm mb-2">Convenção sólido x tracejado</p>
          <ul className="text-xs text-[var(--text-muted)] space-y-1 list-disc pl-4">
            <li><strong>Sólido</strong> = dado real / efetivo. Linha principal 2px com pontos nos vértices.</li>
            <li><strong>Tracejado <code className="bg-zinc-100 px-1 rounded">{'5 4'}</code></strong> = referência (ano anterior) ou projeção (futuro). Linha 1,5px.</li>
            <li>Em barras, o <strong>previsto/projetado</strong> usa opacidade <code className="bg-zinc-100 px-1 rounded">FUTURE_OPACITY</code> (0.35); o efetivo, opacidade cheia.</li>
            <li>Grade: horizontal tracejada <code className="bg-zinc-100 px-1 rounded">{'3 4'}</code> sutil, sem grade vertical. Linha do zero sólida e mais forte.</li>
            <li>Barras: cantos 2px só nas pontas externas; stacks com segmentos internos contínuos (sem arredondar entre eles).</li>
            <li>Eixo temporal sempre contínuo — usar <code className="bg-zinc-100 px-1 rounded">fillMonths()</code> para preencher meses sem dado.</li>
          </ul>
        </div>

        {/* Formatadores de eixo */}
        <p className="font-medium text-[var(--text-primary)] text-sm mb-2">Formatadores de eixo (<code className="bg-zinc-100 px-1 rounded">@/lib/fmt</code>)</p>
        <div className="bg-zinc-50 rounded-xl p-4 text-xs font-mono text-[var(--text-muted)] space-y-1 mb-6">
          <p>{'fmtAxisBRL(1_800_000)  → "R$ 1,8 Mi"   // tickFormatter do eixo Y'}</p>
          <p>{'fmtAxisBRL(600_000)    → "R$ 600,0 k"'}</p>
          <p>{'fmtAxisBRL(0)          → "R$ 0"'}</p>
          <p>{'fmtAxisPct(14)         → "14%"          // eixo Y percentual'}</p>
          <p>{'fmtAxisMes("2026-01")  → "jan/26"       // eixo X temporal (minúsculo)'}</p>
        </div>

        {/* Casas decimais por contexto (ADR-0100, v4.9/M8) */}
        <p className="font-medium text-[var(--text-primary)] text-sm mb-2">Valor monetário: casas decimais por contexto (<code className="bg-zinc-100 px-1 rounded">@/lib/fmt</code>)</p>
        <div className="bg-zinc-50 rounded-xl p-4 text-xs font-mono text-[var(--text-muted)] space-y-1 mb-2">
          <p className="text-[var(--text-primary)] not-italic font-sans font-medium mb-1">Operação individual → 2 casas decimais:</p>
          <p>{'fmtBRL2(344444.4)  → "R$ 344.444,40"   // Lista de Operações, drawer de operação'}</p>
          <p>{'numBRL2(344444.4)  → "344.444,40"      // formato contábil (R$ à esquerda)'}</p>
          <p className="text-[var(--text-primary)] not-italic font-sans font-medium mt-2 mb-1">Agregado / eixos de gráfico → abreviado:</p>
          <p>{'fmtMi(1_800_000)   → "R$ 1,80 Mi"      // KPIs, totais agregados'}</p>
          <p>{'fmtAxisBRL(...)    → "R$ 1,8 Mi"       // ticks de eixo (sempre abreviado)'}</p>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-6">
          Convenção (ADR-0100): em <strong>contexto de operação individual</strong> (uma operação Weddings específica —
          Lista de Operações e seu drawer), todo valor monetário usa 2 casas decimais via <code className="bg-zinc-100 px-1 rounded">fmtBRL2</code>/<code className="bg-zinc-100 px-1 rounded">numBRL2</code>.
          Em contexto <strong>agregado</strong> e em <strong>eixos de gráfico</strong>, mantém-se o formato abreviado (<code className="bg-zinc-100 px-1 rounded">R$ 1,8 Mi</code>).
          Sempre pelo helper central, nunca formatação local.
        </p>

        {/* Primitivos de componente */}
        <p className="font-medium text-[var(--text-primary)] text-sm mb-2">Primitivos (<code className="bg-zinc-100 px-1 rounded">@/components/charts</code>)</p>
        <div className="bg-zinc-50 rounded-xl p-4 text-xs font-mono text-[var(--text-muted)] space-y-1 mb-6">
          <p className="text-[var(--text-primary)] not-italic font-sans font-medium mb-1">Factories (chamar como função dentro do chart):</p>
          <p>{'{ChartGrid()}          // grade horizontal tracejada, sem vertical'}</p>
          <p>{'{ChartZeroLine()}      // ReferenceLine y=0 sólida e forte'}</p>
          <p>{'{ChartXAxisMes("mes")} // eixo X temporal "jan/26"'}</p>
          <p>{'{ChartYAxisBRL()}      // eixo Y "R$ 1,8 Mi" (abs por padrão)'}</p>
          <p>{'{ChartYAxisPct()} / {ChartXAxisBRL()} / {ChartYAxisCategoria("name")}'}</p>
          <p>{'{ChartReferenceLineY(meta, { color, label })} // referência tracejada'}</p>
          <p className="text-[var(--text-primary)] not-italic font-sans font-medium mt-2 mb-1">Componentes:</p>
          <p>{'<ChartLegend items={[{ label, color, type, opacity, dashed }]} />'}</p>
          <p>{'<CustomTooltip {...props} showColorDot formatter={...} labelFormatter={...} />'}</p>
        </div>

        {/* Tokens de cor */}
        <p className="text-xs text-[var(--text-muted)] mb-2">Tokens estruturais e de série (via <code className="bg-zinc-100 px-1 rounded">chartColors</code> / <code className="bg-zinc-100 px-1 rounded">chartSeries</code>):</p>
        <ColorGrid items={[
          { name: '--chart-axis-tick', hex: '#52525b', usage: 'Labels de eixo X/Y' },
          { name: '--chart-grid',      hex: '#e4e4e7', usage: 'Grade horizontal tracejada' },
          { name: '--border-strong',   hex: '#D4C8B4', usage: 'Linha do zero (chartColors.zeroLine)' },
          { name: '--chart-success',   hex: '#10b981', usage: 'Séries positivas/sucesso' },
          { name: '--chart-warning',   hex: '#f97316', usage: 'Séries de atenção' },
          { name: '--chart-danger',    hex: '#dc2626', usage: 'Séries negativas/erro' },
          { name: '--chart-neutral',   hex: '#94a3b8', usage: 'Séries neutras / "Outros"' },
          { name: '--chart-info',      hex: '#6366f1', usage: 'Séries informativas' },
        ]} />
        <p className="text-xs text-[var(--text-muted)] mt-4 mb-2">Cores semânticas identitárias (via <code className="bg-zinc-100 px-1 rounded">fluxoColors</code> / <code className="bg-zinc-100 px-1 rounded">SETOR_COLORS</code> em <code className="bg-zinc-100 px-1 rounded">@/lib/config</code>):</p>
        <ColorGrid items={[
          { name: 'fluxoColors.entrada (--positive)', hex: '#5F7A3D', usage: 'Entradas/recebimentos (cash-flow canônico, ADR-0103)' },
          { name: 'fluxoColors.saida (--negative)',   hex: '#A35442', usage: 'Saídas/pagamentos (cash-flow canônico, ADR-0103)' },
          { name: 'fluxoColors.resultado', hex: '#2D2A26', usage: 'Linha de resultado (--text-primary)' },
          { name: '--setor-lazer',         hex: '#378ADD', usage: 'Setor Lazer / Trips' },
          { name: '--setor-weddings',      hex: '#BA7517', usage: 'Setor Weddings' },
          { name: '--setor-corporativo',   hex: '#0F6E56', usage: 'Setor Corporativo' },
        ]} />
      </Section>

      <Section id="drawers" title="9. Drawers — Padrão Estrutural">
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Subtítulo sempre via prop <code className="bg-zinc-100 px-1 rounded">subtitulo</code> do{' '}
          <code className="bg-zinc-100 px-1 rounded">ListDrawer</code> — renderiza acima da linha
          divisória do cabeçalho, não dentro do conteúdo.
        </p>
        <div className="bg-zinc-50 rounded-xl p-4 text-xs font-mono text-[var(--text-muted)] space-y-1 mb-4">
          <p>{'<ListDrawer'}</p>
          <p className="pl-4">{'titulo="Título do Drawer"'}</p>
          <p className="pl-4">{'subtitulo="Descrição curta acima da linha divisória."  ← sempre aqui'}</p>
          <p className="pl-4">{'onClose={...}'}</p>
          <p>{'>'}</p>
          <p className="pl-4">{'<div className="sticky top-0 bg-white z-10 pb-3 border-b border-zinc-100">'}</p>
          <p className="pl-8">{'// Pills de tipo (Todos / A pagar / A receber) — se aplicável'}</p>
          <p className="pl-8">{'// Pills de período (5d / 10d / Personalizado) — se aplicável'}</p>
          <p className="pl-4">{'</div>'}</p>
          <p className="pl-4">{'<div>  {/* rola sob o sticky */}'}</p>
          <p className="pl-8">{'// Conteúdo principal'}</p>
          <p className="pl-4">{'</div>'}</p>
          <p>{'</ListDrawer>'}</p>
        </div>
        <div className="text-xs text-[var(--text-muted)] space-y-1">
          <p>Exemplos em produção:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Próximos Lançamentos — <code className="bg-zinc-100 px-1 rounded">subtitulo="Próximos lançamentos de contas a pagar e a receber."</code></li>
            <li>Próximos Casamentos a Entregar — <code className="bg-zinc-100 px-1 rounded">subtitulo="Listagem dos próximos casamentos a entregar"</code></li>
          </ul>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-3">
          Componente base:{' '}
          <code className="bg-zinc-100 px-1 rounded">src/components/shared/list-drawer.tsx</code>
        </p>
      </Section>

      <Section id="componentes" title="10. Componentes Compartilhados">
        <div className="space-y-2">
          {[
            { name: 'ListDrawer',            path: 'src/components/shared/list-drawer.tsx',              desc: 'Drawer lateral padrão com título e onClose' },
            { name: 'CardTabela',            path: 'src/components/shared/card-tabela.tsx',              desc: 'Shell unificado de card-tabela (título, período, Ver mais→aba); usar com CARD_TABELA_TH + table-fixed' },
            { name: 'Card',                  path: 'src/components/ui/card.tsx',                         desc: 'Card com variantes default/featured/sm' },
            { name: 'PeriodoFilterPillsUrl', path: 'src/components/layout/periodo-filter-pills-url.tsx', desc: 'Pills de período com state em URL params' },
            { name: 'CustomTooltip',         path: 'src/components/charts/custom-tooltip.tsx',           desc: 'Tooltip padronizado para gráficos Recharts' },
            { name: 'SumarioSubsetorCard',   path: 'src/components/weddings/sumario-subsetor.tsx',       desc: 'Tabela de composição por subsetor com barras' },
            { name: 'TopSection',            path: 'src/components/layout/top-section.tsx',              desc: 'Accordion de seção com header clicável' },
            { name: 'SortTh',               path: 'src/components/financeiro/proximos-lancamentos-lateral.tsx', desc: 'Cabeçalho de coluna clicável com seta ▲▼ — padrão de Lista de Operações' },
          ].map(({ name, path, desc }) => (
            <div key={name} className="flex items-start gap-3 py-2 border-b border-zinc-100">
              <code className="text-xs font-medium text-[var(--brand)] w-44 shrink-0">{name}</code>
              <div>
                <p className="text-xs text-[var(--text-primary)]">{desc}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{path}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ── Helpers inline ───────────────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-6">
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{title}</h2>
      <div className="w-8 h-0.5 bg-[var(--brand)] mb-4" />
      {children}
    </section>
  )
}

function ColorGrid({ items }: { items: { name: string; hex: string; usage?: string }[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map(({ name, hex, usage }) => (
        <div key={name} className="flex gap-3 p-3 bg-zinc-50 rounded-lg">
          <div className="w-10 h-10 rounded-lg shrink-0 border border-zinc-200"
            style={{ backgroundColor: hex }} />
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-[var(--text-primary)] truncate">{name}</p>
            <p className="text-[10px] font-mono text-[var(--text-muted)]">{hex}</p>
            {usage && <p className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{usage}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

function PillDemo({ children, active, size = 'md' }: { children: ReactNode; active?: boolean; size?: 'md' | 'sm' }) {
  const base = size === 'sm'
    ? 'px-2.5 py-0.5 text-[11px]'
    : 'px-3 py-1 text-xs'
  return (
    <span
      className={[base, 'rounded-full border font-medium transition-colors whitespace-nowrap', active ? '' : 'text-zinc-500 border-zinc-200'].join(' ')}
      style={active ? { background: 'var(--brand-soft)', borderColor: 'var(--brand)', color: 'var(--brand-deep)' } : undefined}
    >
      {children}
    </span>
  )
}
