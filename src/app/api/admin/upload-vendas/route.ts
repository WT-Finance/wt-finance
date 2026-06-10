import type { NextRequest } from 'next/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { carregarVendas } from '@/lib/carga/vendas'

const MAX_SIZE_BYTES = 50 * 1024 * 1024

export async function POST(request: NextRequest): Promise<Response> {
  // Guard v4.13: área de uploads administrativos.
  const sessao = await requireAreaApi('admin/uploads')
  if (sessao instanceof Response) return sessao

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Requisição inválida: esperado multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  const modo = (formData.get('modo') as string) ?? 'preview'

  if (!(file instanceof Blob)) {
    return Response.json({ error: 'Campo "file" ausente ou inválido' }, { status: 400 })
  }

  if (modo !== 'preview' && modo !== 'executar') {
    return Response.json({ error: 'Campo "modo" deve ser "preview" ou "executar"' }, { status: 400 })
  }

  if (file.size > MAX_SIZE_BYTES) {
    return Response.json(
      { error: 'Arquivo muito grande. Limite: 50MB.' },
      { status: 413 }
    )
  }

  const fileName = file instanceof File ? file.name : 'vendas.xlsx'
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (ext && ext !== 'xlsx' && ext !== 'csv') {
    return Response.json({ error: `Formato não suportado: .${ext}. Envie .xlsx ou .csv` }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const resultado = await carregarVendas(buffer, fileName, modo as 'preview' | 'executar')
    return Response.json(resultado, { status: resultado.sucesso ? 200 : 422 })
  } catch (err) {
    console.error('[upload-vendas]', err)
    return Response.json(
      { error: `Erro interno: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
