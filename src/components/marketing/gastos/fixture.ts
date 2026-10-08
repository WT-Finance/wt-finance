// FIXTURE FICTÍCIA da página "Gastos de Marketing" (v6.3.0, GATE 1 — mockup navegável).
//
// Tudo aqui é inventado: fornecedores, descrições, documentos e valores. Nada veio de produção
// (nem de longe) — as marcas genéricas (Google, Meta, Adobe…) são só rótulos plausíveis. Os
// NOMES das 6 categorias são os reais (já medidos na M0), porque são o vocabulário da DRE.
//
// DETERMINÍSTICA: um PRNG com semente = o ano. A mesma chamada devolve sempre os mesmos
// lançamentos — o mockup não "pisca" entre renders e os testes podem confiar nele.
//
// Na M3 este arquivo MORRE: `page.tsx` passa a montar `DadosGastosMarketing` a partir das RPCs
// (contrato em `tipos.ts`) e os componentes ficam como estão.
//
// Estados forçáveis pelo `?estado=` da rota:
//   vazio → o ano selecionado não tem lançamento (cada card mostra o próprio estado vazio);
//   erro  → o ranking por fornecedor falha; os outros cards seguem de pé.

import { cuboCategorias, cuboFornecedores } from '@/lib/marketing/agregacao'
import { anoDaData, mesLimite, somarDias } from '@/lib/marketing/periodo'
import type {
  DadosGastosMarketing, EstadoMockup, LancamentoMkt, ResumoMarketing,
} from './tipos'

/** Primeiro ano com pill no mockup (o dado real começa em 2024). */
export const ANO_MINIMO_FIXTURE = 2024

// ── PRNG (mulberry32) ───────────────────────────────────────────────────────────────────
function criarPrng(semente: number): () => number {
  let t = semente >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const arred2 = (n: number): number => Math.round(n * 100) / 100

// ── Vocabulário fictício ────────────────────────────────────────────────────────────────
const PREFIXOS = ['Aurora', 'Boreal', 'Cobalto', 'Delta', 'Éter', 'Faísca', 'Gaia', 'Horizonte', 'Íris', 'Jade', 'Kappa', 'Lume']
const SUFIXOS_AGENCIA = ['Studio', 'Mídia', 'Digital', 'Criativa', 'Comunicação', 'Conteúdo', 'Performance', 'Produções']

const POOL_AGENCIAS = PREFIXOS.flatMap(p => SUFIXOS_AGENCIA.map(s => `${p} ${s}`))
const POOL_GRAFICAS = PREFIXOS.map(p => `Gráfica ${p}`)

interface EspecCategoria {
  nome: string
  /** Lançamentos por ano cheio (a fixture escala pelo nº de meses alcançados). */
  porAno: number
  faixa: [number, number]
  fornecedores: readonly string[]
  /** Chance de o lançamento ficar SEM fornecedor. */
  pSemFornecedor: number
  descricoes: readonly string[]
}

const CATEGORIAS: readonly EspecCategoria[] = [
  {
    nome: 'Anúncios', porAno: 62, faixa: [1500, 18500], pSemFornecedor: 0.02,
    fornecedores: ['Google Ads', 'Meta Ads', 'TikTok Ads', 'LinkedIn Ads', 'Pinterest Ads', 'YouTube Ads'],
    descricoes: ['Campanha de busca – destinos', 'Remarketing de leads', 'Impulsionamento de posts', 'Campanha de alta temporada', 'Mídia de vídeo – awareness', 'Campanha de captação de leads'],
  },
  {
    nome: 'Agência de Marketing / Terceiros de MKT', porAno: 52, faixa: [1800, 9200], pSemFornecedor: 0.03,
    fornecedores: POOL_AGENCIAS,
    descricoes: ['Retainer mensal – gestão de mídia', 'Produção de conteúdo para redes', 'Criação de campanha', 'Assessoria de imprensa', 'Produção de vídeo institucional', 'Freelancer de design'],
  },
  {
    nome: 'Licença de Software (MKT)', porAno: 42, faixa: [79.9, 1480], pSemFornecedor: 0.02,
    fornecedores: ['Adobe', 'Canva', 'RD Station', 'Mailchimp', 'Notion', 'Semrush', 'Hotjar', 'Zapier', 'Figma', 'Hootsuite'],
    descricoes: ['Assinatura mensal', 'Renovação anual de licença', 'Licenças adicionais de usuário', 'Plano profissional – automação'],
  },
  {
    nome: 'TravelBack', porAno: 24, faixa: [320, 4200], pSemFornecedor: 0.7,
    fornecedores: ['Programa de Fidelidade Alfa', 'Parceiro de Cashback Beta'],
    descricoes: ['Crédito de campanha de relacionamento', 'Bônus de indicação', 'Cashback promocional', 'Resgate de pontos – ação de fidelidade'],
  },
  {
    nome: 'Marcas e Patentes', porAno: 8, faixa: [420, 2650], pSemFornecedor: 0,
    fornecedores: ['Registro de Marcas Alfa', 'Propriedade Industrial Beta', 'Escritório de PI Gama'],
    descricoes: ['Depósito de pedido de registro', 'Taxa de renovação de registro', 'Acompanhamento de processo'],
  },
  {
    nome: 'Material gráfico MKT', porAno: 16, faixa: [210, 3600], pSemFornecedor: 0.05,
    fornecedores: POOL_GRAFICAS,
    descricoes: ['Cartões de visita', 'Folders institucionais', 'Banner para evento', 'Brindes personalizados', 'Adesivos de divulgação', 'Cartazes para feira'],
  },
]

/** Estorno único de cada ano — o caso raro (valor POSITIVO, reduz o gasto). */
const VALOR_ESTORNO = 1248.9

function gerarDocumento(rand: () => number): string | null {
  const x = rand()
  if (x < 0.2) return null
  const n = Math.floor(10000 + rand() * 89999)
  return x < 0.78 ? `NF ${n}` : `FAT-${n}`
}

/**
 * ~200 lançamentos pagos de um ano (menos no ano em curso: só até `hoje`). Ordenados por data,
 * ids sequenciais. Inclui, por construção: 1 estorno positivo, lançamentos sem fornecedor
 * (`null`) e 1 com fornecedor em branco (`''`) — para exercitar a normalização.
 */
export function gerarLancamentos(ano: number, hoje: string): LancamentoMkt[] {
  const rand = criarPrng(ano * 7919 + 13)
  const limite = mesLimite(ano, hoje)
  const diaHoje = parseInt(hoje.slice(8, 10), 10)
  const emCurso = ano === anoDaData(hoje)
  const brutos: Omit<LancamentoMkt, 'id'>[] = []

  for (const cat of CATEGORIAS) {
    const n = Math.round(cat.porAno * (limite / 12))
    for (let i = 0; i < n; i++) {
      const mes = 1 + Math.floor(rand() * limite)
      const diaMax = emCurso && mes === limite ? Math.max(1, Math.min(28, diaHoje)) : 28
      const dia = 1 + Math.floor(rand() * diaMax)
      // Distribuição enviesada: os primeiros fornecedores da lista se repetem (ranking realista).
      const forn = cat.fornecedores[Math.floor(rand() ** 1.8 * cat.fornecedores.length)]
      const semFornecedor = rand() < cat.pSemFornecedor
      const valor = -arred2(cat.faixa[0] + rand() * (cat.faixa[1] - cat.faixa[0]))
      brutos.push({
        data: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
        categoria: cat.nome,
        fornecedor: semFornecedor ? null : forn,
        descricao: cat.descricoes[Math.floor(rand() * cat.descricoes.length)],
        documento: gerarDocumento(rand),
        valor,
      })
    }
  }

  // Um lançamento com fornecedor em BRANCO (a base real pode trazer '' em vez de NULL).
  const alvoBranco = brutos.findIndex(l => l.categoria === 'Material gráfico MKT')
  if (alvoBranco >= 0) brutos[alvoBranco] = { ...brutos[alvoBranco], fornecedor: '' }

  // O estorno: Anúncios, em março (ou no último mês alcançado, se o ano for mais curto).
  const mesEstorno = Math.min(3, limite)
  brutos.push({
    data: `${ano}-${String(mesEstorno).padStart(2, '0')}-14`,
    categoria: 'Anúncios',
    fornecedor: 'Google Ads',
    descricao: 'Estorno de cobrança em duplicidade',
    documento: `EST-${ano}-01`,
    valor: VALOR_ESTORNO,
  })

  return brutos
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.categoria.localeCompare(b.categoria, 'pt-BR')))
    .map((l, i) => ({ ...l, id: (ano - 2000) * 10000 + i + 1 }))
}

function resumoDe(ano: number, lancamentos: LancamentoMkt[], hoje: string): ResumoMarketing {
  const datas = lancamentos.map(l => l.data).sort()
  return {
    ano,
    porMesCategoria: cuboCategorias(ano, lancamentos),
    cobertura: datas.length ? { min: datas[0], max: datas[datas.length - 1] } : null,
    // 11:42 em São Paulo (UTC−3).
    ultimaCarga: `${hoje}T14:42:00Z`,
    // A fatura do cartão entra com ~9 dias de atraso: o mês corrente fica subcontado.
    ultimaDataCartao: somarDias(hoje, -9),
  }
}

/** Monta o payload completo da página a partir da fixture. */
export function montarDadosFixture(args: {
  ano: number
  hoje: string
  estado: EstadoMockup | null
}): DadosGastosMarketing {
  const { ano, hoje, estado } = args
  const anoHoje = anoDaData(hoje)
  const anosDisponiveis = Array.from({ length: anoHoje - ANO_MINIMO_FIXTURE + 1 }, (_, i) => ANO_MINIMO_FIXTURE + i)

  const lancAtual = estado === 'vazio' ? [] : gerarLancamentos(ano, hoje)
  const lancAnterior = gerarLancamentos(ano - 1, hoje)

  return {
    ano,
    anosDisponiveis,
    hoje,
    fonte: 'fixture',
    resumo: { ok: true, dados: resumoDe(ano, lancAtual, hoje) },
    resumoAnterior: { ok: true, dados: resumoDe(ano - 1, lancAnterior, hoje) },
    fornecedores: estado === 'erro'
      ? { ok: false }
      : { ok: true, dados: { ano, porMesFornecedor: cuboFornecedores(ano, lancAtual) } },
    lancamentos: { ok: true, dados: lancAtual },
  }
}
