import { requireArea } from '@/lib/auth/sessao'
import AcervoDocumentos from '@/components/financeiro/acervo-documentos'
import { listarDocumentos } from './actions'
import type { AcervoDocumento } from '@/lib/schemas-rpc'

// Acervo de Documentos (v4.34.0) — biblioteca de documentos do financeiro, em formato de
// GLOSSÁRIO (agrupado por letra inicial do título). Acesso com QUALQUER uma das duas áreas
// ('financeiro/acervo' = ver, 'financeiro/acervo/gestao' = ver + adicionar); o botão
// "Adicionar" só aparece para quem tem a de gestão.
export default async function AcervoPage() {
  const sessao = await requireArea(['financeiro/acervo', 'financeiro/acervo/gestao'])
  const podeAdicionar = sessao.permissoes.includes('financeiro/acervo/gestao')

  // Carrega a listagem inicial (SSR). PROTEGIDO: uma falha aqui NÃO pode derrubar a página —
  // em erro, nasce vazia com uma faixa de erro (espelha faturamento-corp/page.tsx:15-24).
  let documentos: AcervoDocumento[] = []
  let erroInicial: string | null = null
  try {
    const res = await listarDocumentos()
    if (res.ok) documentos = res.documentos
    else erroInicial = res.erro
  } catch {
    erroInicial = 'Não foi possível carregar o acervo.'
  }

  return (
    <div className="max-w-5xl mx-auto px-4">
      <AcervoDocumentos documentosIniciais={documentos} podeAdicionar={podeAdicionar} erroInicial={erroInicial} />
    </div>
  )
}
