// Classes canônicas de campos de formulário de PLATAFORMA (tema neutro Group,
// .foco-neutro — nunca var(--brand)). Antes, INPUT_CLASSES idêntico estava
// duplicado em 3 arquivos e SELECT_CLASSES divergia (border zinc-300 vs zinc-200)
// em outros 2. Fonte única. (v4.16.1 — achado da auditoria de coerência.)

/** Campo de formulário em tamanho padrão (input/textarea), largura total. */
export const CAMPO =
  'foco-neutro w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition'

/** Select/controle COMPACTO para uso inline (ex.: dentro de célula de tabela). */
export const CAMPO_COMPACTO =
  'foco-neutro rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700 ' +
  'outline-none transition disabled:opacity-50'
