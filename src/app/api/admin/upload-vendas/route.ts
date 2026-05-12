import type { NextRequest } from 'next/server'
import { carregarVendas } from '@/lib/carga/vendas'

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
