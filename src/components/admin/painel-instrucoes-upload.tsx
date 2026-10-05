import { AlertTriangle } from 'lucide-react'
import { INSTRUCOES_GERAIS, type InstrucoesUpload } from '@/lib/ingestao/instrucoes-upload'

// Painel "Ver instruções" de um card de upload (v6.1.3). O texto vem de
// `@/lib/ingestao/instrucoes-upload` (colunas pinadas no parser do servidor por sonda).
//
// Cortina do DS (skill ui-design-system §2.1, molde `shared/top-section.tsx`): 450ms
// `cubic-bezier(.32,.72,0,1)` sobre `grid-template-rows` 0fr↔1fr, filho `min-h-0 overflow-hidden`,
// conteúdo SEMPRE montado e `inert` quando fechado (fora do tab-order e do leitor de tela), nada
// `absolute` dentro do clip. Cores neutras de plataforma (tela admin — nunca `var(--brand)`).
// O botão que abre mora no cabeçalho do card, FORA da zona de drop (`role="button"`) — botão
// dentro de botão quebraria o acesso por teclado da zona.

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-zinc-700 mb-1">{titulo}</h3>
      {children}
    </section>
  )
}

export default function PainelInstrucoesUpload({
  id,
  aberto,
  instrucoes,
}: {
  /** `id` do painel — o `aria-controls` do botão aponta para ele. */
  id:         string
  aberto:     boolean
  instrucoes: InstrucoesUpload
}) {
  return (
    <div
      id={id}
      inert={!aberto}
      className="grid transition-[grid-template-rows] duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: aberto ? '1fr' : '0fr' }}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="mt-3 mb-1 space-y-3 rounded-lg bg-surface-soft p-4 text-xs leading-relaxed text-zinc-600">
          <Secao titulo="De onde vem o arquivo">
            <p>{instrucoes.origem}</p>
            {instrucoes.ondeNoMonde && <p className="mt-1">{instrucoes.ondeNoMonde}</p>}
          </Secao>

          <section>
            <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning-deep">
              <AlertTriangle size={13} className="shrink-0 text-warning" aria-hidden />
              Atenção
            </h3>
            <ul className="list-disc space-y-1 pl-4">
              {instrucoes.atencao.map(t => <li key={t}>{t}</li>)}
            </ul>
          </section>

          <Secao titulo="Passo a passo">
            <ol className="list-decimal space-y-1 pl-4">
              {instrucoes.passos.map(t => <li key={t}>{t}</li>)}
            </ol>
          </Secao>

          <Secao titulo={instrucoes.colunas.rotulo}>
            <ul className="flex flex-wrap gap-1.5">
              {instrucoes.colunas.itens.map(c => (
                <li key={c} className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-2xs text-zinc-700">
                  {c}
                </li>
              ))}
            </ul>
            {/* zinc-600, não 500: sobre `surface-soft` o 500 fica abaixo de AA (~4,3:1) em 12px. */}
            {instrucoes.colunas.nota && <p className="mt-1.5 text-zinc-600">{instrucoes.colunas.nota}</p>}
          </Secao>

          <Secao titulo="Bom saber">
            <ul className="list-disc space-y-1 pl-4">
              {INSTRUCOES_GERAIS.map(t => <li key={t}>{t}</li>)}
              {instrucoes.limiteMB !== undefined && <li>Limite de {instrucoes.limiteMB} MB por arquivo.</li>}
            </ul>
          </Secao>
        </div>
      </div>
    </div>
  )
}
