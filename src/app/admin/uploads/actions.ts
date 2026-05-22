'use server'

import { carregarLancamentos } from '@/lib/carga/lancamentos'
import { carregarVendas } from '@/lib/carga/vendas'

export async function uploadLancamentosAction(formData: FormData) {
  const file = formData.get('file')
  const modo = (formData.get('modo') as string) ?? 'preview'

  if (!(file instanceof Blob))
    return { error: 'Campo "file" ausente ou inválido' }

  if (modo !== 'preview' && modo !== 'executar')
    return { error: 'Campo "modo" deve ser "preview" ou "executar"' }

  const fileName = file instanceof File ? file.name : ''
  const ext = fileName ? fileName.split('.').pop()?.toLowerCase() ?? '' : ''
  if (ext && ext !== 'csv' && ext !== 'xlsx')
    return { error: `Formato não suportado: .${ext}. Envie .csv ou .xlsx` }

  const buffer = Buffer.from(await file.arrayBuffer())
  try {
    return await carregarLancamentos(buffer, modo as 'preview' | 'executar')
  } catch (err) {
    console.error('[upload-lancamentos]', err)
    return { error: `Erro interno: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function uploadVendasAction(formData: FormData) {
  const file = formData.get('file')
  const modo = (formData.get('modo') as string) ?? 'preview'

  if (!(file instanceof Blob))
    return { error: 'Campo "file" ausente ou inválido' }

  if (modo !== 'preview' && modo !== 'executar')
    return { error: 'Campo "modo" deve ser "preview" ou "executar"' }

  const fileName = file instanceof File ? file.name : 'vendas.xlsx'
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (ext && ext !== 'xlsx' && ext !== 'csv')
    return { error: `Formato não suportado: .${ext}. Envie .xlsx ou .csv` }

  const buffer = Buffer.from(await file.arrayBuffer())
  try {
    return await carregarVendas(buffer, fileName, modo as 'preview' | 'executar')
  } catch (err) {
    console.error('[upload-vendas]', err)
    return { error: `Erro interno: ${err instanceof Error ? err.message : String(err)}` }
  }
}
