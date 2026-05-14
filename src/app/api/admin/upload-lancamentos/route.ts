import type { NextRequest } from 'next/server'
import { carregarLancamentos } from '@/lib/carga/lancamentos'

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

export async function POST(request: NextRequest): Promise<Response> {
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
    return Response.json({ error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo: 50 MB` }, { status: 400 })
  }

  const fileName = file instanceof File ? file.name : ''
  const ext = fileName ? fileName.split('.').pop()?.toLowerCase() ?? '' : ''
  if (ext && ext !== 'csv' && ext !== 'xlsx') {
    return Response.json({ error: `Formato não suportado: .${ext}. Envie .csv ou .xlsx` }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const resultado = await carregarLancamentos(buffer, modo as 'preview' | 'executar')
    return Response.json(resultado, { status: resultado.sucesso ? 200 : 422 })
  } catch (err) {
    console.error('[upload-lancamentos]', err)
    return Response.json(
      { error: `Erro interno: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
