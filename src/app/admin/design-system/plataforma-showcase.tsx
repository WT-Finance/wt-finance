'use client'

import { useState } from 'react'
import Checkbox from '@/components/ui/checkbox'
import { PILL, PILL_NEUTRO, PILL_PERIGO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/admin/acessos/botoes'

// Demos ao vivo da seção "11. Plataforma" do Design System (v4.14.3). Client component
// (como o ChartShowcase) porque o Checkbox e o exemplo de foco são interativos. Usa os
// MESMOS estilos de produção (botoes.ts, Checkbox) — é documentação viva, não mock.

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-xs text-[var(--text-muted)] mb-2">{titulo}</p>
      {children}
    </div>
  )
}

export default function PlataformaShowcase() {
  const [marcado, setMarcado] = useState(true)

  return (
    <div>
      {/* 1. Hierarquia de botões */}
      <Bloco titulo="Hierarquia de botões (botoes.ts) — primária bege · secundária cinza · destrutiva perigo">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}>Criar usuário</button>
          <button type="button" className={`${PILL} ${PILL_NEUTRO}`}>Editar</button>
          <button type="button" className={`${PILL} ${PILL_PERIGO}`}>Excluir</button>
        </div>
        <div className="mt-2 bg-zinc-50 rounded-lg p-3 text-[11px] font-mono text-[var(--text-muted)] space-y-0.5">
          <p>{'<button className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}>  // primária (bege)'}</p>
          <p>{'<button className={`${PILL} ${PILL_NEUTRO}`}>   // secundária (cinza contornada)'}</p>
          <p>{'<button className={`${PILL} ${PILL_PERIGO}`}>   // destrutiva (perigo)'}</p>
        </div>
      </Bloco>

      {/* 2. Pill neutra (espelha pills de período) */}
      <Bloco titulo="Pill ativa/inativa de plataforma — mesmo visual das pills de período do Financeiro (que em tema group são bege)">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}>Usuários</button>
          <button type="button" className={`${PILL} ${PILL_NEUTRO}`}>Permissões</button>
          <button type="button" className={`${PILL} ${PILL_NEUTRO}`}>Solicitações</button>
        </div>
        <p className="text-[11px] text-zinc-400 mt-2">
          Ativa = <code className="bg-zinc-100 px-1 rounded">--action-soft</code> (#EAE6DD) /
          borda <code className="bg-zinc-100 px-1 rounded">--action-soft-border</code> /
          texto <code className="bg-zinc-100 px-1 rounded">--action-soft-fg</code>. Nunca <code className="bg-zinc-100 px-1 rounded">var(--brand)</code>.
        </p>
      </Bloco>

      {/* 3. Foco :focus-visible */}
      <Bloco titulo="Foco neutro — só em :focus-visible (.foco-neutro)">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={`${PILL} ${PILL_NEUTRO}`}>Botão (Tab para focar)</button>
          <input
            type="text"
            placeholder="Input de texto"
            aria-label="Demo de foco"
            className="foco-neutro rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none"
          />
        </div>
        <p className="text-[11px] text-zinc-400 mt-2">
          Navegue por <strong>Tab</strong>: o anel neutro aparece. <strong>Clicar com o mouse no botão NÃO deixa anel</strong>
          (sem sombreado); o input de texto mostra o anel ao clicar, pois o browser o trata como focus-visible.
        </p>
      </Bloco>

      {/* 4. Checkbox */}
      <Bloco titulo="Checkbox do design system (ui/checkbox) — substitui o nativo do browser">
        <div className="flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] cursor-pointer">
            <Checkbox id="ds-chk-live" checked={marcado} onChange={() => setMarcado(v => !v)} aria-label="Exemplo interativo" />
            Interativo (clique)
          </label>
          <span className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Checkbox id="ds-chk-on" checked onChange={() => {}} aria-label="Marcado" /> Marcado
          </span>
          <span className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Checkbox id="ds-chk-off" checked={false} onChange={() => {}} aria-label="Desmarcado" /> Desmarcado
          </span>
        </div>
      </Bloco>

      {/* 5. CTA sólido */}
      <Bloco titulo="CTA sólido das telas públicas — --action-primary escuro (caso distinto da pill bege)">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="foco-neutro rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90"
            style={{ background: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
          >
            Entrar
          </button>
          <p className="text-[11px] text-zinc-400">
            Botão sólido (ex.: Entrar do login). Usa <code className="bg-zinc-100 px-1 rounded">--action-primary</code> (#3F4144),
            não a pill bege — é o único CTA cheio das telas de plataforma.
          </p>
        </div>
      </Bloco>
    </div>
  )
}
