// Pilha global de overlays (modais/drawers) para que a tecla Esc feche APENAS o
// overlay do topo. Antes, cada overlay registrava seu próprio listener no
// document — com um modal aberto sobre um drawer, um Esc fechava os DOIS.
// (v4.16.1 — achado da auditoria de UX.)

type CloseFn = () => void

const stack: { id: number; close: CloseFn }[] = []
let nextId = 1
let listening = false

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || stack.length === 0) return
  e.stopPropagation()
  stack[stack.length - 1].close()
}

/** Registra um overlay; retorna o id para remover depois. O do topo é o último a entrar. */
export function pushOverlay(close: CloseFn): number {
  const id = nextId++
  stack.push({ id, close })
  if (!listening && typeof document !== 'undefined') {
    document.addEventListener('keydown', onKey)
    listening = true
  }
  return id
}

/** Remove o overlay da pilha (idempotente). */
export function popOverlay(id: number): void {
  const i = stack.findIndex(o => o.id === id)
  if (i !== -1) stack.splice(i, 1)
  if (stack.length === 0 && listening && typeof document !== 'undefined') {
    document.removeEventListener('keydown', onKey)
    listening = false
  }
}
