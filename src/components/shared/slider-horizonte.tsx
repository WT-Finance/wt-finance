'use client'

// Slider de horizonte com régua de marcações — primitivo compartilhado (v5.4.2/M3).
//
// A GEOMETRIA e a linguagem visual vêm do slider de horizonte do Fluxo de Caixa
// (`src/components/financeiro/posicao-projetado.tsx`, v5.2.0): rótulo `text-2xs`
// cinza acima, trilho ocupando o espaço restante, régua de riscos abaixo (menores
// finos + maiores com rótulo numérico) e o valor em texto ao lado. O Yan pediu
// explicitamente que a janela de Weddings siga esse padrão, então ele foi extraído
// para cá em vez de reinventado — e o call-site do Financeiro pode migrar para este
// primitivo quando aquela tela for tocada (migração incremental, como manda a skill
// ui-design-system; registrado no out-briefing).
//
// Duas escolhas herdadas da referência que NÃO são estéticas:
//   • O trilho é NEUTRO por DEFAULT (`--text-secondary`) — slider é controle de
//     leitura, não realce de marca. Quem quiser a cor da aba passa `corTrilho`
//     (Weddings usa `var(--brand)` por decisão do Yan); o default protege um
//     call-site futuro de herdar dourado sem querer.
//   • `posTick` compensa a MEIA-LARGURA do thumb (~7px): o centro do thumb nunca
//     alcança as bordas do trilho, então um risco posicionado em `left: f%` puro
//     fica progressivamente fora de fase com o valor. Sem a compensação a régua
//     "mente" nos extremos.

/** Posição de um risco na régua (compensa a meia-largura do thumb, ~7px). */
export function posTick(f: number): string {
  return `calc(7px + ${(f * 100).toFixed(2)}% - ${(f * 14).toFixed(2)}px)`
}

interface Props {
  valor: number
  max: number
  onChange: (v: number) => void
  min?: number
  /** Passo dos riscos MENORES (sem rótulo). Default: (max−min)/18, como na referência. */
  passoMenor?: number
  /** Valores que recebem risco MAIOR + rótulo numérico. */
  maiores?: readonly number[]
  /**
   * Espelha o eixo: o zero fica à DIREITA e arrastar para a esquerda aumenta o
   * valor. Usado no lado "passado" da janela, para o gesto acompanhar o tempo.
   */
  espelhado?: boolean
  ariaLabel: string
  ariaValueText?: string
  className?: string
  /** Cor do trilho/thumb. Default: neutro (`--text-secondary`). */
  corTrilho?: string
}

export default function SliderHorizonte({
  valor, max, onChange, min = 0,
  passoMenor, maiores = [], espelhado = false,
  ariaLabel, ariaValueText, className, corTrilho = 'var(--text-secondary)',
}: Props) {
  const menor = passoMenor ?? Math.max(1, Math.round((max - min) / 18))
  const qtd   = Math.floor((max - min) / menor)

  return (
    <div className={['flex flex-col gap-px', className ?? ''].join(' ')}>
      <input
        type="range"
        dir={espelhado ? 'rtl' : undefined}
        min={min} max={max} step={1}
        value={Math.min(Math.max(valor, min), max)}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: corTrilho }}
        aria-label={ariaLabel}
        aria-valuetext={ariaValueText}
      />
      {/* Régua: riscos menores finos + maiores com rótulo. `aria-hidden` porque o
          valor já é anunciado pelo `aria-valuetext` do input. */}
      <div className="relative h-[15px] w-full" aria-hidden>
        {Array.from({ length: qtd }, (_, i) => {
          const v = min + menor * (i + 1)
          const f = (v - min) / ((max - min) || 1)
          const marco = maiores.includes(v)
          const lado = espelhado ? { right: posTick(f) } : { left: posTick(f) }
          return (
            <span key={v}>
              <span
                className="absolute top-px w-px bg-zinc-300"
                style={{ ...lado, height: marco ? 6 : 4, opacity: marco ? 0.9 : 0.55 }}
              />
              {marco && (
                <span
                  className={`absolute top-1.5 text-[9.5px] text-zinc-400 tabular-nums ${espelhado ? 'translate-x-1/2' : '-translate-x-1/2'}`}
                  style={lado}
                >
                  {v}
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
