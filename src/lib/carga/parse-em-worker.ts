import type { ParseKind } from './parse.worker'

// Parseia o arquivo de upload num Web Worker (fora da main thread → a UI não trava nem
// mostra "não está respondendo"; o spinner continua animando). v4.20.2.
//
// Robustez: se o Worker não existir (SSR) ou falhar ao carregar/executar, cai no
// `fallback` — o parser rodando na main thread (comportamento anterior; ainda funciona,
// só sem a fluidez). Assim a importação nunca quebra por causa do worker.
export function parseArquivoEmWorker<T>(
  kind: ParseKind,
  file: File,
  fallback: (f: File) => Promise<T[] | { error: string }>,
): Promise<T[] | { error: string }> {
  if (typeof Worker === 'undefined') return fallback(file)

  let worker: Worker
  try {
    worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return fallback(file)
  }

  return new Promise((resolve) => {
    let done = false
    const settle = (r: T[] | { error: string }) => {
      if (done) return
      done = true
      worker.terminate()
      resolve(r)
    }
    worker.onmessage = (e: MessageEvent) => settle(e.data as T[] | { error: string })
    // Falha de carga/execução do worker → fallback para a main thread.
    worker.onerror = () => {
      if (done) return
      done = true
      worker.terminate()
      fallback(file).then(resolve)
    }
    worker.postMessage({ kind, file })
  })
}
