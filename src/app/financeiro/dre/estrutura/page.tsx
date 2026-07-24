import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireArea } from '@/lib/auth/sessao'
import TopSection from '@/components/shared/top-section'
import EditorDreMockup from '@/components/financeiro/dre/editor-dre-mockup'
import { PILL, PILL_NEUTRO } from '@/components/shared/botoes'

// Editor da ESTRUTURA VIVA da DRE (v5.3.0 · Onda 2) — página própria, acessível pelo
// botão "Editar estrutura" da DRE. FASE DE MOCKUP (M0, gate do Yan): nada é persistido;
// a M5 troca o mock pelo salvar-em-lote real (padrão Metas) + diário/undo (M2) + trava
// otimista, sem mudar esta página.
//
// RBAC: mesma área 'financeiro/dre' da DRE (permissão única ver+editar — decisão firme;
// o prefixo /financeiro/dre em areasDaRota já cobre esta subrota).

export default async function DreEstruturaPage() {
  await requireArea('financeiro/dre')

  return (
    <div>
      <TopSection
        titulo="Estrutura da DRE"
        subtitulo="ordem das categorias e blocos — global, auditável; toda mudança é reversível"
      >
        <div className="mb-4">
          <Link href="/financeiro/dre" className={`${PILL} ${PILL_NEUTRO}`}>
            <ArrowLeft size={13} />
            Voltar à DRE
          </Link>
        </div>
        <EditorDreMockup />
      </TopSection>
    </div>
  )
}
