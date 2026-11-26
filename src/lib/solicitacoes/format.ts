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

/** 'AAAA-MM-DD' + N dias corridos → 'AAAA-MM-DD'. Calendário puro: Date.UTC dos componentes,
 *  sem fuso no caminho (o `Date.UTC` normaliza 31/12 + 1 para 01/01 e o fim de fevereiro). */
export function somarDiasISO(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

/** Prazo com que a Data limite da Nova solicitação já vem preenchida — o "Prazo padrão de 3
 *  dias" do "?" do campo. Dias CORRIDOS (decisão do Yan, 26/11/2026). */
export const PRAZO_PADRAO_DIAS = 3

/** v6.5.3 — a Data limite nasce preenchida (hoje + 3 corridos, SP) e editável. Antes nascia
 *  VAZIA, e o Safari do macOS mostra a data de HOJE dentro de um `<input type="date">` vazio:
 *  quem abria o modal via uma data, enviava e levava "Informe a data-limite." sem entender. */
export function dataLimitePadrao(hoje: string = hojeSP()): string {
  return somarDiasISO(hoje, PRAZO_PADRAO_DIAS)
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

/** Regra do banco para `numero`/`moeda` — espelho de `app.solic_validar_e_snapshotar` (0212).
 *  UM separador só. `format.test.ts` reprova se o SQL e este espelho divergirem. */
export const REGEX_NUMERICO_BANCO = /^-?[0-9]+([.,][0-9]+)?$/

/** Teto de magnitude: acima disto `String(n)` perde dígitos ou vira notação exponencial
 *  ("1e+23,00"), que o banco recusa com a mensagem genérica. Em centavos, para `moeda`. */
const MAX_SEGURO = Number.MAX_SAFE_INTEGER

/**
 * v6.2.1 — valor DIGITADO num campo `numero`/`moeda` → o texto que `criar_solicitacao` grava.
 * Devolve null quando não dá para ler um número.
 *
 * Por que existe: o banco valida esses campos com `REGEX_NUMERICO_BANCO` — UM separador só. O
 * jeito mais natural de digitar dinheiro em pt-BR, `1.234,56`, tem dois, e era recusado com "Há
 * um valor inválido em um dos campos" (nenhum dos 126 valores gravados até 06/10 tinha milhar +
 * decimal: quem passava tinha redigitado). Pior, a recusa apagava os anexos já enviados (ver
 * `criarSolicitacao`).
 *
 * - `moeda`: SEMPRE pela leitura do `toNum` canônico (R$, espaço, milhar BR/US) e emitida com
 *   vírgula decimal, sem milhar e 2 casas (`toCentavos`) — a forma de 76 dos 126 valores já
 *   gravados. Não muda o significado de nada que já passava: o drawer exibe moeda pelo mesmo
 *   `toNum` (`fmtValor`), então "1.318" já era mostrado como R$ 1.318,00.
 * - `numero`: o que o banco JÁ aceita vai **como digitado**. `numero` é exibido cru, e pode ser
 *   identificador ("000123") ou medida ("2.500"); reinterpretar pelo milhar BR mudaria o que o
 *   usuário escreveu. Só o que o banco recusaria (milhar + decimal, "1.234,5") passa pelo `toNum`.
 */
export function valorNumericoCanonico(tipo: 'numero' | 'moeda', digitado: string): string | null {
  const bruto = digitado.trim()
  if (tipo === 'numero' && REGEX_NUMERICO_BANCO.test(bruto)) return bruto
  const n = toNum(bruto)
  if (n === null || !Number.isFinite(n)) return null
  if (tipo === 'moeda') {
    const centavos = toCentavos(n)
    if (centavos === null || Math.abs(centavos) > MAX_SEGURO) return null
    const abs = Math.abs(centavos)
    return `${centavos < 0 ? '-' : ''}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`
  }
  if (Math.abs(n) > MAX_SEGURO) return null
  const s = String(n).replace('.', ',')
  return REGEX_NUMERICO_BANCO.test(s) ? s : null
}

/** v6.2.1 — prévia de como o valor digitado vai ser GRAVADO e exibido ("R$ 1.318,00"), ou
 *  null se não der para ler. Sai do mesmo `fmtValor` que o drawer usa depois — a prévia não
 *  pode prometer uma leitura diferente da que a solicitação vai mostrar. */
export function previaValorNumerico(tipo: 'numero' | 'moeda', digitado: string): string | null {
  const canonico = valorNumericoCanonico(tipo, digitado)
  if (canonico === null) return null
  return fmtValor({ campo_id: 0, rotulo: '', tipo_campo: tipo, valor: canonico })
}

/** v6.2.1 — aplica `valorNumericoCanonico` às respostas de um tipo, no ENVIO do modal (nunca no
 *  `onChange`: normalizar enquanto se digita impediria escrever "1.234,56"). Campo vazio fica
 *  como está (o obrigatório é do servidor). O primeiro campo ilegível devolve o RÓTULO dele,
 *  para a tela dizer qual — sem ir ao banco e voltar com a mensagem genérica. */
export function normalizarRespostasNumericas(
  campos: readonly { id?: number; rotulo: string; tipo_campo: string }[],
  valores: Record<string, string>,
): { ok: true; respostas: Record<string, string> } | { ok: false; rotulo: string; campoId: number } {
  const respostas = { ...valores }
  for (const campo of campos) {
    if ((campo.tipo_campo !== 'numero' && campo.tipo_campo !== 'moeda') || campo.id == null) continue
    const chave = String(campo.id)
    const digitado = (valores[chave] ?? '').trim()
    if (!digitado) continue
    const canonico = valorNumericoCanonico(campo.tipo_campo, digitado)
    if (canonico === null) return { ok: false, rotulo: campo.rotulo, campoId: campo.id }
    respostas[chave] = canonico
  }
  return { ok: true, respostas }
}

/**
 * v6.5.3 — obrigatórios e "data no passado" checados NO MODAL, antes de ir ao banco. Espelho de
 * `app.solic_validar_e_snapshotar` (0212), que segue sendo a fonte de verdade — isto só faz o erro
 * aparecer no campo certo (foco + borda) em vez de voltar do servidor como faixa no rodapé.
 * Ordem = ordem dos campos na tela; devolve o PRIMEIRO problema. `anexosOk[id]` = quantos anexos
 * daquele campo já subiram sem erro.
 */
export function validarCamposAbertura(
  campos: readonly { id?: number; rotulo: string; tipo_campo: string; obrigatorio: boolean; data_permite_passado?: boolean }[],
  valores: Record<string, string>,
  anexosOk: Record<number, number>,
  hoje: string = hojeSP(),
): { campoId: number; mensagem: string } | null {
  for (const campo of campos) {
    if (campo.id == null) continue
    if (campo.tipo_campo === 'anexo') {
      if (campo.obrigatorio && !(anexosOk[campo.id] > 0)) {
        return { campoId: campo.id, mensagem: `Anexe um arquivo em "${campo.rotulo}".` }
      }
      continue
    }
    const v = (valores[String(campo.id)] ?? '').trim()
    if (!v) {
      if (!campo.obrigatorio) continue
      return {
        campoId: campo.id,
        mensagem: campo.tipo_campo === 'data'
          ? `Escolha uma data em "${campo.rotulo}".`
          : `Preencha o campo obrigatório "${campo.rotulo}".`,
      }
    }
    // Banco: `NOT data_permite_passado AND valor < hoje (SP)`. Ausente = permite (o default do
    // campo é true, e a RPC de tipos pode não emitir a chave em campo antigo).
    if (campo.tipo_campo === 'data' && campo.data_permite_passado === false && v < hoje) {
      return { campoId: campo.id, mensagem: `"${campo.rotulo}" não admite data no passado.` }
    }
  }
  return null
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
