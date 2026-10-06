import { emAndamento } from './schemas'
import type { StatusSolic, Solicitacao } from './schemas'
import type { z } from 'zod'
import type { respostaSchema } from './schemas'
import { toNum, toCentavos } from '@/lib/carga/coercao'

// Helpers de apresentação do módulo (client-safe). Cores semânticas neutras de
// plataforma (sem var(--brand)); feedback semântico via tokens --success/--danger.

export const STATUS_LABEL: Record<StatusSolic, string> = {
  aberta: 'Aberta', aprovada: 'Aprovada', concluida: 'Concluída',
  rejeitada: 'Rejeitada', cancelada: 'Cancelada',
}

export function statusBadge(status: StatusSolic): string {
  switch (status) {
    case 'concluida': return 'border-success bg-success-bg text-success'
    case 'rejeitada': return 'border-danger bg-danger-bg text-danger'
    case 'cancelada': return 'border-zinc-200 bg-zinc-100 text-zinc-400'
    // 'aprovada' (v5.9.0) é ATENÇÃO/PENDENTE pelo DS — autorizada, mas ainda por
    // executar. Não é --success (que significa encerrada) nem --gestao (reservado a
    // AÇÃO ADMINISTRATIVA de admin). Tinta em --warning-deep porque o badge é corpo
    // pequeno: --warning puro não passa AA como texto (2,0:1 sobre branco).
    case 'aprovada':  return 'border-warning bg-warning-bg text-warning-deep'
    default:          return 'border-zinc-300 bg-zinc-100 text-zinc-600' // aberta (informativo)
  }
}

/** Badge por AÇÃO: Conclusão=verde(success), Rejeição=vermelho(danger), Cancelamento=cinza;
 *  Abertura usa o trio --brand — que nesta tela (tema group; e, desde a v4.40.0, também o
 *  default do :root) resolve para o NEUTRO do Grupo, não dourado. (O comentário antigo dizia
 *  "--brand=#BD965C estável" — impreciso: a rota sempre teve [data-theme=group]; o e-mail de
 *  notificação mantém o dourado #BD965C hardcoded como cor de status — paridade UI×e-mail é
 *  pendência registrada no out-briefing v4.40.0.) */
export function acaoBadge(acao: string): string {
  switch (acao) {
    case 'Abertura':     return 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-deep)]'
    case 'Aprovação':    return 'border-warning bg-warning-bg text-warning-deep'
    case 'Conclusão':    return 'border-success bg-success-bg text-success'
    case 'Rejeição':     return 'border-danger bg-danger-bg text-danger'
    case 'Cancelamento': return 'border-zinc-200 bg-zinc-100 text-zinc-500'
    default:             return 'border-zinc-200 bg-zinc-100 text-zinc-500'
  }
}

// cacheado: construir Intl por chamada custa ~ms; format() cacheado custa µs
const FMT_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })

/** Hoje em America/Sao_Paulo como 'AAAA-MM-DD' (data_limite é date puro, sem fuso). */
export function hojeSP(): string {
  return FMT_SP.format(new Date())
}

/** Vencida = data-limite anterior a hoje (SP) e a solicitação ainda em andamento.
 *  v5.9.0: 'aprovada' também vence — uma aprovação parada há duas semanas continua
 *  sendo atraso; o que encerra a contagem é o desfecho, não a autorização. */
export function vencida(dataLimite: string, status: StatusSolic): boolean {
  return emAndamento(status) && dataLimite < hojeSP()
}

/** 'AAAA-MM-DD' ou timestamptz → 'DD/MM/AAAA' (sem deslocar o dia). */
export function fmtDataBR(iso: string | null): string {
  if (!iso) return '—'
  const d = iso.slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso
}

type Resposta = z.infer<typeof respostaSchema>

/** Valor de uma resposta formatado para leitura. */
export function fmtValor(r: Resposta): string {
  if (r.valor == null || r.valor === '') return '—'
  if (r.tipo_campo === 'moeda') {
    // Coerção de moeda agora vem do módulo canônico (v4.17.0/Balde 2) — mesma
    // desambiguação BR/US que os parsers de carga usam (fonte única).
    const n = toNum(r.valor)
    return n !== null ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : r.valor
  }
  if (r.tipo_campo === 'data') return fmtDataBR(r.valor)
  return r.valor
}

/**
 * v6.2.1 — valor DIGITADO num campo `numero`/`moeda` → a forma canônica que
 * `criar_solicitacao` grava. Devolve null quando não dá para ler um número.
 *
 * Por que existe: o banco valida esses campos com `^-?[0-9]+([.,][0-9]+)?$` — UM separador
 * só. O jeito mais natural de digitar dinheiro em pt-BR, `1.234,56`, tem dois, e era recusado
 * com "Há um valor inválido em um dos campos" (nenhum dos 126 valores gravados até 06/10
 * tinha milhar + decimal: quem passava tinha redigitado). Pior, a recusa apagava os anexos
 * já enviados (ver `criarSolicitacao`). A leitura é a do `toNum` canônico — `R$`, espaço,
 * milhar BR/US, parênteses —, então a tela aceita o que a plataforma inteira aceita, e o
 * banco continua recebendo um formato que ele já conhece (e que a API externa também usa).
 *
 * Forma emitida: vírgula decimal, sem milhar — a mesma de 76 dos 126 valores já gravados.
 * `moeda` sai sempre com 2 casas, arredondada pela regra do `toCentavos`; `numero` sai com
 * as casas que tiver (3 → "3", não "3,00").
 */
export function valorNumericoCanonico(tipo: 'numero' | 'moeda', digitado: string): string | null {
  const n = toNum(digitado)
  if (n === null || !Number.isFinite(n)) return null
  if (tipo === 'moeda') {
    const centavos = toCentavos(n)
    if (centavos === null) return null
    const abs = Math.abs(centavos)
    return `${centavos < 0 ? '-' : ''}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`
  }
  const s = String(n)
  // Notação exponencial ("1e+21") não passa no regex do banco — melhor recusar aqui, com
  // mensagem, do que deixar o banco recusar com a genérica.
  if (/e/i.test(s)) return null
  return s.replace('.', ',')
}

/** v6.2.1 — prévia de como o valor digitado vai ser GRAVADO e exibido ("R$ 1.318,00"), ou
 *  null se não der para ler. Sai do mesmo `fmtValor` que o drawer usa depois — a prévia não
 *  pode prometer uma leitura diferente da que a solicitação vai mostrar. */
export function previaValorNumerico(tipo: 'numero' | 'moeda', digitado: string): string | null {
  const canonico = valorNumericoCanonico(tipo, digitado)
  if (canonico === null) return null
  return fmtValor({ campo_id: 0, rotulo: '', tipo_campo: tipo, valor: canonico })
}

/** Resumo (2-3 primeiros campos preenchidos) para cards/linhas. */
export function resumo(respostas: Resposta[], max = 3): string {
  const preenchidos = respostas.filter(r => r.tipo_campo !== 'anexo' && r.valor != null && r.valor !== '')
  if (preenchidos.length === 0) return '—'
  return preenchidos.slice(0, max).map(r => `${r.rotulo}: ${fmtValor(r)}`).join(' · ')
}

// ── Lista de solicitações: ordem e busca (v5.7.2) ─────────────────────────────
// Moram AQUI, e não em cada componente de lista, porque as duas visões da mesma página
// (Caixa de entrada e Minhas solicitações) precisam ordenar e buscar IGUAL. Duas cópias
// de um comparador divergem no primeiro ajuste, e o usuário vê a mesma busca devolver
// coisas diferentes conforme a aba.

/** Ordem canônica das listas: data de CRIAÇÃO, mais recente primeiro.
 *
 *  ⚠️ O que se perde: até a v5.7.1 as abertas eram ordenadas por `data_limite` ASC, o que
 *  punha a mais urgente no topo (triagem). Com `criado_em` DESC a urgência deixa de
 *  ordenar e passa a viver só na cor — o card já pinta o vencimento em `text-danger`
 *  quando vencida. Foi pedido explícito do Yan ("sempre ordenadas por data de criação"). */
export const maisRecentePrimeiro = (a: Solicitacao, b: Solicitacao): number =>
  b.criado_em.localeCompare(a.criado_em)

/** Uma REFERÊNCIA NUMÉRICA: `#1068` ou `1068`. Nada além disso.
 *
 *  A âncora importa: sem ela, extrair os dígitos de um termo qualquer faria
 *  "kissia2024@welcometrips.com.br" procurar também pela solicitação cujo id contém
 *  "2024" — um resultado que o usuário não pediu aparecendo no meio da busca por e-mail. */
const REF_NUMERICA = /^#?(\d+)$/

/**
 * A solicitação casa com o termo? Busca por **número** OU **e-mail do solicitante**.
 *
 * - Termo vazio/só espaços → casa tudo (sem filtro).
 * - Termo que é uma referência numérica (`#1068` / `1068`) → casa por id, por SUBSTRING
 *   (digitar `106` acha a 1068), e TAMBÉM tenta o e-mail: um e-mail pode ser todo
 *   numérico antes do `@`, e negar essa busca seria uma surpresa.
 * - Qualquer outro termo → casa só por e-mail, sem tentar adivinhar dígitos no meio.
 */
export function casaBuscaSolicitacao(s: Solicitacao, termoDigitado: string): boolean {
  const termo = termoDigitado.trim()
  if (!termo) return true
  const email = (s.solicitante_email ?? '').toLowerCase()
  if (email.includes(termo.toLowerCase())) return true
  const ref = REF_NUMERICA.exec(termo)
  return ref !== null && String(s.id).includes(ref[1])
}
