// Web Worker de PARSE de upload (v4.20.2). O `XLSX.read` + `sheet_to_json` + `parseXxxRows`
// são síncronos e pesados (~45k linhas) — na main thread travavam a página ("não está
// respondendo") e congelavam o spinner. Aqui rodam FORA da main thread, mantendo a UI fluida.
//
// Reaproveita os 4 parsers isomórficos (sem DOM; `@e965/xlsx` via import dinâmico) — zero
// duplicação de lógica. O `File` é clonável para o worker (structured clone).

import { parseVendasProdutoFile } from './parse-vendas-produto'
import { parseLancamentosFile } from './parse-lancamentos'
import { parseLancamentosFinanceiroFile } from './parse-lancamentos-financeiro'
import { parseFluxoCaixaTitulosFile } from './parse-fluxo-caixa-titulos'

export type ParseKind = 'vendas' | 'lancamentos' | 'lancamentos_financeiro' | 'fluxo_caixa_titulos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PARSERS: Record<ParseKind, (f: File) => Promise<any>> = {
  vendas: parseVendasProdutoFile,
  lancamentos: parseLancamentosFile,
  lancamentos_financeiro: parseLancamentosFinanceiroFile,
  fluxo_caixa_titulos: parseFluxoCaixaTitulosFile,
}

// `self` num worker é DedicatedWorkerGlobalScope; o tsconfig do projeto usa a lib DOM,
// então tipamos só o mínimo necessário para postMessage/onmessage.
interface WorkerScope {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage(msg: unknown): void
}
const ctx = self as unknown as WorkerScope

ctx.onmessage = async (e: MessageEvent) => {
  const { kind, file } = (e.data ?? {}) as { kind: ParseKind; file: File }
  try {
    const parser = PARSERS[kind]
    if (!parser) { ctx.postMessage({ error: `Base desconhecida: ${kind}` }); return }
    const res = await parser(file)        // Row[] | { error: string }
    ctx.postMessage(res)
  } catch (err) {
    ctx.postMessage({ error: err instanceof Error ? err.message : 'Erro ao processar arquivo' })
  }
}
