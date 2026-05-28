import type { ReactNode } from 'react'

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
      </Section>

      <Section id="pills" title="6. Pills e Botões de Filtro">
        <div className="space-y-4">
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-2">Pills de período (padrão)</p>
            <div className="flex gap-2">
              <PillDemo active>Este ano</PillDemo>
              <PillDemo>Este mês</PillDemo>
              <PillDemo>Últ. 3 meses</PillDemo>
              <PillDemo>Personalizado</PillDemo>
            </div>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-2">Pills de tipo (Próximos Lançamentos)</p>
            <div className="flex gap-2">
              <PillDemo active>Todos</PillDemo>
              <PillDemo>A pagar</PillDemo>
              <PillDemo>A receber</PillDemo>
            </div>
          </div>
        </div>
      </Section>

      <Section id="tabelas" title="7. Tabelas e Listas">
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

      <Section id="graficos" title="8. Gráficos — Referência de Cores">
        <div className="space-y-2 text-xs">
          {[
            { label: 'Entradas (barras)',        color: '#0091B3', code: '#0091B3 (Pantone 632)' },
            { label: 'Saídas (barras)',          color: '#D9A23F', code: '#D9A23F (var(--warning))' },
            { label: 'Resultado mensal (linha)', color: '#2D2A26', code: '#2D2A26 (var(--text-primary))' },
            { label: 'Pontos negativos',         color: '#B85C5C', code: 'var(--danger)' },
            { label: 'Grid lines',               color: '#f4f4f5', code: '#f4f4f5 (zinc-100)' },
          ].map(({ label, color, code }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-4 h-4 rounded shrink-0" style={{ background: color }} />
              <span className="w-48 text-[var(--text-primary)]">{label}</span>
              <code className="text-[var(--text-muted)] bg-zinc-50 px-1.5 py-0.5 rounded">{code}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section id="drawers" title="9. Drawers — Padrão Estrutural">
        <div className="bg-zinc-50 rounded-xl p-4 text-xs font-mono text-[var(--text-muted)] space-y-1">
          <p>{'<ListDrawer titulo="..." onClose={...}>'}</p>
          <p className="pl-4">{'<div className="sticky top-0 bg-white z-10 pb-3 border-b">'}</p>
          <p className="pl-8">{'// Pills de tipo (se aplicável)'}</p>
          <p className="pl-8">{'// Pills de período'}</p>
          <p className="pl-4">{'</div>'}</p>
          <p className="pl-4">{'<div className="overflow-y-auto">'}</p>
          <p className="pl-8">{'// Conteúdo que rola sob o sticky'}</p>
          <p className="pl-4">{'</div>'}</p>
          <p>{'</ListDrawer>'}</p>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-2">
          Componente base:{' '}
          <code className="bg-zinc-100 px-1 rounded">src/components/shared/list-drawer.tsx</code>
        </p>
      </Section>

      <Section id="componentes" title="10. Componentes Compartilhados">
        <div className="space-y-2">
          {[
            { name: 'ListDrawer',            path: 'src/components/shared/list-drawer.tsx',              desc: 'Drawer lateral padrão com título e onClose' },
            { name: 'Card',                  path: 'src/components/ui/card.tsx',                         desc: 'Card com variantes default/featured/sm' },
            { name: 'PeriodoFilterPillsUrl', path: 'src/components/layout/periodo-filter-pills-url.tsx', desc: 'Pills de período com state em URL params' },
            { name: 'CustomTooltip',         path: 'src/components/charts/custom-tooltip.tsx',           desc: 'Tooltip padronizado para gráficos Recharts' },
            { name: 'SumarioSubsetorCard',   path: 'src/components/weddings/sumario-subsetor.tsx',       desc: 'Tabela de composição por subsetor com barras' },
            { name: 'TopSection',            path: 'src/components/layout/top-section.tsx',              desc: 'Accordion de seção com header clicável' },
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

function PillDemo({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span className={[
      'text-[11px] px-2.5 py-0.5 rounded-full border',
      active
        ? 'bg-zinc-800 text-white border-zinc-800'
        : 'text-zinc-500 border-zinc-200',
    ].join(' ')}>
      {children}
    </span>
  )
}
