// FIXTURE FICTÍCIA da página "Despesas de Marketing" (v6.3.0) — massa de TESTE.
//
// Tudo aqui é inventado: fornecedores, descrições, documentos e valores. Nada veio de produção
// (nem de longe) — as marcas genéricas (Google, Meta, Adobe…) são só rótulos plausíveis. Os
// NOMES das 6 categorias são os reais (já medidos na M0), porque são o vocabulário da DRE.
//
// DETERMINÍSTICA: um PRNG com semente = o ano. A mesma chamada devolve sempre os mesmos
// lançamentos, então os testes podem confiar nela.
//
// Só os testes importam este arquivo (`completude.test.ts`, `schemas.test.ts`, `fatias.test.ts`):
// a página monta `DadosGastosMarketing` a partir das RPCs (`page.tsx`; contrato em `tipos.ts`,
// schemas em `schemas.ts`). As variantes do `montarDadosFixture` forjam estados degradados:
//   vazio           → os anos selecionados não têm lançamento (cada card mostra o estado vazio);
//   erro            → o ranking por fornecedor falha; os outros cards seguem de pé;
//   erro-resumo-ano → o resumo de UM ano falha (quem soma anos tem de acusar, não somar parcial).
//
// Como a base real, a fixture NÃO tem lançamento antes de `ANO_MINIMO_FIXTURE`: o resumo de um
// ano anterior a ele vem vazio e fora de `anosDisponiveis` (ausência de dado, não zero).

import { cuboCategorias, cuboFornecedores } from './agregacao'
import { anoDaData, mesLimite, somarDias } from './periodo'
import type { DadosGastosMarketing, LancamentoMkt, LeituraAno, ResumoMarketing } from './tipos'

/** Primeiro ano com dado na fixture (o dado real também começa em 2024). */
const ANO_MINIMO_FIXTURE = 2024

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

function anosDaFixture(hoje: string): number[] {
  return Array.from({ length: anoDaData(hoje) - ANO_MINIMO_FIXTURE + 1 }, (_, i) => ANO_MINIMO_FIXTURE + i)
}

function resumoDe(ano: number, lancamentos: LancamentoMkt[], hoje: string): ResumoMarketing {
  const datas = lancamentos.map(l => l.data).sort()
  return {
    ano,
    anosDisponiveis: anosDaFixture(hoje),
    porMesCategoria: cuboCategorias(ano, lancamentos),
    cobertura: datas.length ? { min: datas[0], max: datas[datas.length - 1] } : null,
    // 11:42 em São Paulo (UTC−3).
    ultimaCarga: `${hoje}T14:42:00Z`,
    // A fatura do cartão entra com ~9 dias de atraso: o mês corrente fica subcontado.
    ultimaDataCartao: somarDias(hoje, -9),
  }
}

/** Monta o payload completo da página a partir da fixture: uma leitura por ano selecionado. */
export function montarDadosFixture(args: {
  /** Anos selecionados (ao menos 1); o payload os devolve em ordem crescente, como a página. */
  anos: readonly number[]
  hoje: string
  /** `vazio`: nenhum ano selecionado tem lançamento. `erro`: o ranking por fornecedor falha em
   *  todos os anos. `erro-resumo-ano`: o RESUMO do ano em `anoComFalha` falha (os outros anos e
   *  o ranking seguem). */
  estado: 'vazio' | 'erro' | 'erro-resumo-ano' | null
  anoComFalha?: number
}): DadosGastosMarketing {
  const { hoje, estado, anoComFalha } = args
  const anos = [...args.anos].sort((a, b) => a - b)

  return {
    anos,
    anosDisponiveis: anosDaFixture(hoje),
    hoje,
    porAno: anos.map((ano): LeituraAno => {
      // Antes do 1º ano da base não há lançamento — como na RPC, o resumo vem vazio.
      const lancamentos = estado === 'vazio' || ano < ANO_MINIMO_FIXTURE ? [] : gerarLancamentos(ano, hoje)
      return {
        ano,
        resumo: estado === 'erro-resumo-ano' && ano === anoComFalha
          ? { ok: false }
          : { ok: true, dados: resumoDe(ano, lancamentos, hoje) },
        fornecedores: estado === 'erro'
          ? { ok: false }
          : { ok: true, dados: { ano, porMesFornecedor: cuboFornecedores(ano, lancamentos) } },
      }
    }),
  }
}
