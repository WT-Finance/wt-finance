// Gera `supabase/migrations/0256_dre_competencia_estrutura.sql` a partir dos DOIS anexos
// do briefing da v5.8.0 (`docs/briefings/anexo-v5-8-0-*.csv`), que são a fonte curada da
// árvore e do de-para do regime de COMPETÊNCIA.
//
// Por que um gerador e não SQL escrito à mão: são 26 blocos e 141 pares, e um deles tem
// vírgula DENTRO do campo ("Feiras, Eventos e Divulgações"). Transcrever isso à mão — ou
// pedir a um agente que transcreva — é convidar um erro silencioso num de-para que define
// dinheiro. Aqui o SQL é DERIVADO do anexo, e o gerador valida antes de emitir:
//
//   • toda chave referenciada por fórmula existe na árvore;
//   • o grafo de fórmulas é ACÍCLICO (ciclo passaria pelo CREATE VIEW sem erro e
//     produziria coeficiente parcial em silêncio — ver a nota na 0257);
//   • nenhum par (grupo_arquivo, descricao_arquivo) repetido;
//   • todo `sub_chave` do de-para existe na árvore;
//   • nenhum rótulo de FOLHA carrega operador "(+)/(-)/(+/-)/(=)" — a regra de rótulos da
//     v5.7.0 (agregação carrega operador, folha nunca) vale para a árvore nova.
//
// Uso (da raiz da worktree):  node scripts/gera-seed-dre-competencia.mjs
// Reexecutar depois de mexer num anexo reescreve a migration por inteiro.

import { readFileSync, writeFileSync } from 'node:fs'

const ANEXO_ARVORE = 'docs/briefings/anexo-v5-8-0-arvore-competencia.csv'
const ANEXO_DEPARA = 'docs/briefings/anexo-v5-8-0-depara-competencia.csv'
const DESTINO = 'supabase/migrations/0256_dre_competencia_estrutura.sql'

/** CSV com campo citado (um dos rótulos tem vírgula dentro). */
function parseCsvLine(l) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < l.length; i++) {
    const ch = l[i]
    if (q) {
      if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
const lerCsv = (p) => readFileSync(p, 'utf8').trim().split(/\r?\n/).slice(1).map(parseCsvLine)
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const OPERADOR_NO_INICIO = /^\s*\((\+|-|\+\/-|=)\)/

// ── árvore ──────────────────────────────────────────────────────────────────
const arvore = lerCsv(ANEXO_ARVORE)
const chaves = new Set(arvore.map((r) => r[2]))
const TIPOS = new Set(['blocoH', 'sub', 'tot'])

/** Chave de fórmula: letra ou `_` no início, letras/dígitos/`_` depois. Aceitar dígito
 *  importa — uma chave futura tipo `RH2` era silenciosamente partida pela regex antiga. */
const TERMO = /([+-]?)\s*([A-Za-z_][A-Za-z0-9_]*)/g

const refsPorChave = new Map()

const valoresArvore = arvore.map(([ordem, tipo, chave, rotulo, formula]) => {
  if (!TIPOS.has(tipo)) throw new Error(`tipo inválido em ${chave}: ${tipo}`)
  if (!OPERADOR_NO_INICIO.test(rotulo)) throw new Error(`agregação SEM operador no rótulo: ${chave} → ${rotulo}`)
  let f = 'NULL'
  const refs = []
  if (formula && formula.trim()) {
    const termos = []
    let m
    TERMO.lastIndex = 0
    while ((m = TERMO.exec(formula)) !== null) {
      const sinal = m[1] === '-' ? '-' : ''
      if (!chaves.has(m[2])) throw new Error(`fórmula de ${chave} referencia chave inexistente: ${m[2]}`)
      termos.push(`"${sinal}${m[2]}"`)
      refs.push(m[2])
    }
    if (termos.length === 0) throw new Error(`fórmula de ${chave} não produziu termo: ${formula}`)
    f = `'[${termos.join(',')}]'::jsonb`
  }
  refsPorChave.set(chave, refs)
  return `  (${ordem}, ${lit(tipo)}, ${lit(chave)}, ${lit(rotulo)}, ${f})`
})

// ── aciclicidade ────────────────────────────────────────────────────────────
// Validar que a referência EXISTE não basta. Um ciclo passaria pelo `CREATE VIEW` sem
// erro: a CTE recursiva de `vw_dre_comp_expansao` tem teto de profundidade, então a
// recursão simplesmente PARA e o `HAVING` emite coeficientes PARCIAIS — número errado,
// em silêncio, sem `RAISE`. O teto é rede de emergência do servidor, não validação de
// corretude; a validação é aqui. (Achado MÉDIO do revisor-db, v5.8.0.)
const CINZA = 1
const NEGRO = 2
const estado = new Map()
function visitar(chave, caminho) {
  if (estado.get(chave) === NEGRO) return
  if (estado.get(chave) === CINZA) {
    throw new Error(`CICLO nas fórmulas da árvore: ${[...caminho, chave].join(' → ')}`)
  }
  estado.set(chave, CINZA)
  for (const ref of refsPorChave.get(chave) ?? []) visitar(ref, [...caminho, chave])
  estado.set(chave, NEGRO)
}
for (const chave of chaves) visitar(chave, [])

// ── de-para ─────────────────────────────────────────────────────────────────
const depara = lerCsv(ANEXO_DEPARA)
const vistos = new Set()
for (const [grupo, desc, sub, rotulo] of depara) {
  if (!chaves.has(sub)) throw new Error(`par (${grupo}, ${desc}) aponta para chave inexistente: ${sub}`)
  const k = `${grupo}␟${desc}`
  if (vistos.has(k)) throw new Error(`par duplicado no de-para: ${grupo} / ${desc}`)
  vistos.add(k)
  if (OPERADOR_NO_INICIO.test(rotulo)) throw new Error(`rótulo de FOLHA com operador: ${rotulo}`)
}

// `ordem` é calculada por DESTINO (sub_chave, rotulo_linha), não por par — as duas pernas
// de uma fusão têm de receber o MESMO valor, senão a linha exibida herdaria uma ordem
// arbitrária dependendo de qual perna o agrupamento visitasse primeiro.
// Dentro de cada subgrupo a ordem é alfabética pt-BR: não existe curadoria de ordem no
// anexo, e alfabético é o único critério determinístico e previsível para quem lê.
const destinos = new Map()
for (const [, , sub, rotulo] of depara) destinos.set(`${sub}␟${rotulo}`, { sub, rotulo })

const ordemPorDestino = new Map()
for (const sub of new Set([...destinos.values()].map((d) => d.sub))) {
  const rotulos = [...destinos.values()]
    .filter((d) => d.sub === sub)
    .map((d) => d.rotulo)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  rotulos.forEach((rotulo, i) => ordemPorDestino.set(`${sub}␟${rotulo}`, (i + 1) * 10))
}

const valoresDepara = depara.map(([grupo, desc, sub, rotulo]) => {
  const ordem = ordemPorDestino.get(`${sub}␟${rotulo}`)
  return `  (${lit(grupo)}, ${lit(desc)}, ${lit(sub)}, ${lit(rotulo)}, ${ordem})`
})

const sql = `-- ---------------------------------------------------------------------------
-- 0256 — feat(db): árvore e de-para do regime de COMPETÊNCIA + view de leitura
--                  (v5.8.0, M2)
--
-- ⚠️  ARQUIVO GERADO por \`scripts/gera-seed-dre-competencia.mjs\` a partir dos anexos
--     \`docs/briefings/anexo-v5-8-0-arvore-competencia.csv\` (${arvore.length} blocos) e
--     \`docs/briefings/anexo-v5-8-0-depara-competencia.csv\` (${depara.length} pares).
--     Para mudar a curadoria, edite o ANEXO e rode o gerador — não edite o SQL à mão.
--     O gerador valida antes de emitir (chave de fórmula existente, par não repetido,
--     regra de rótulos da v5.7.0: agregação carrega operador, folha nunca).
--
-- ADITIVA / retrocompatível:
--   • 2 CREATE TABLE novas em \`financeiro\` + 1 CREATE VIEW nova
--   • NADA é tocado no motor de CAIXA: \`dre_bloco\`, \`dre_categoria_map\`,
--     \`get_dre_mensal\`, \`fato_fluxo\` e o editor da estrutura seguem intocados.
--
-- ── Por que árvore PRÓPRIA e não reuso de dre_bloco/dre_categoria_map ───────
-- As duas árvores divergem de verdade: competência não tem REPASSE nem IMOB, e tem
-- ONOP_H, LL, DL e REXG que o caixa não tem. E as CHAVES de mapeamento são de espécies
-- diferentes: o caixa chaveia por \`dim_categoria.id\` (um inteiro do próprio banco), a
-- competência chaveia pelo par de TEXTO (Grupo, Descrição) que vem no arquivo.
-- Convergir as duas é decisão futura; forçar agora criaria uma tabela que serve mal aos
-- dois regimes. (Decisão do Yan, §1 do briefing.)
--
-- ── \`formula\` com SINAL — a diferença em relação à árvore de caixa ──────────
-- Em \`financeiro.dre_bloco\` a fórmula é um array JSONB de chaves que se SOMAM, e os
-- sinais vivem no dado (despesa é negativa). Aqui isso não basta: o
-- RESULTADO GERENCIAL é \`REX − REEMB\` — uma SUBTRAÇÃO de um bloco que já está somado
-- dentro do REX. Então o array aceita chave prefixada por \`-\`: \`["REX","-REEMB"]\`.
-- Chave sem prefixo soma, chave com \`-\` subtrai. \`formula IS NULL\` = folha, que soma
-- as próprias linhas do de-para.
--
-- ── Chave COMPOSTA no de-para (não é preciosismo) ───────────────────────────
-- Exatamente 3 descrições existem sob DOIS pais diferentes no arquivo — \`Comissão\`,
-- \`Reembolso Cliente\` e \`Reembolso Fornecedor\` —, então uma chave só por descrição
-- colidiria. A FUSÃO dessas linhas acontece no DESTINO (mesmo \`sub_chave\` + mesmo
-- \`rotulo_linha\` ⇒ uma linha exibida), nunca na chave. Medido no arquivo vivo:
-- ${depara.length} pares ⇒ ${destinos.size} linhas exibidas.
--
-- ── \`IMP_H\` é a exceção estrutural da árvore ────────────────────────────────
-- Todo outro \`blocoH\` é um cabeçalho cuja fórmula soma os subgrupos que vêm depois
-- dele (RB_H = RV + REEMB; DESP_H = ADM..FIN). \`IMP_H\` não: ele tem \`formula NULL\` e
-- recebe categorias do de-para DIRETAMENTE (4 pares), ou seja, é cabeçalho na
-- apresentação e FOLHA na aritmética. É deliberado — no modelo da gerente "Impostos e
-- Deduções da Receita Bruta" não tem subdivisão — e é exatamente o que o modelo de
-- caixa já permite (\`formula IS NULL\` = soma as próprias categorias).
--
-- Medido antes de aplicar (arquivo de 25/08/2026): os ${depara.length} pares do de-para são
-- EXATAMENTE os ${depara.length} pares distintos do arquivo — bijeção, sem par órfão de nenhum
-- lado. Par novo num export futuro cai na bandeja "Não classificadas" (LEFT JOIN da view).
-- ---------------------------------------------------------------------------

CREATE TABLE financeiro.dre_comp_bloco (
  id           BIGSERIAL   PRIMARY KEY,
  chave        TEXT        NOT NULL UNIQUE,        -- âncora estável (casar por chave, nunca por posição)
  rotulo       TEXT        NOT NULL,
  tipo         TEXT        NOT NULL CHECK (tipo IN ('blocoH', 'sub', 'tot')),
  ordem        INT         NOT NULL,               -- governa a renderização
  formula      JSONB,                              -- array de chaves com sinal; NULL = folha
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dre_comp_bloco_ordem_idx ON financeiro.dre_comp_bloco (ordem);

CREATE TABLE financeiro.dre_comp_map (
  id                BIGSERIAL PRIMARY KEY,
  grupo_arquivo     TEXT    NOT NULL,
  descricao_arquivo TEXT    NOT NULL,
  sub_chave         TEXT    NOT NULL REFERENCES financeiro.dre_comp_bloco (chave),
  rotulo_linha      TEXT    NOT NULL,
  -- Ordem da LINHA EXIBIDA dentro do subgrupo (espelha \`dre_categoria_map.ordem\` do
  -- caixa). É por DESTINO, não por par: as duas pernas de uma fusão trazem o mesmo
  -- valor, senão a linha herdaria a ordem de qualquer uma delas. Semeada alfabética.
  ordem             INT     NOT NULL,
  -- Nasce toda FALSA. Existe para o dia em que uma linha precisar sair do demonstrativo
  -- sem sair da base (o análogo do \`excluida\` do caixa). Linha excluída NÃO desaparece da
  -- reconciliação: a RPC de leitura a soma num total próprio, para "linhas + bandeja +
  -- excluídas = base" continuar fechando.
  excluida          BOOLEAN NOT NULL DEFAULT false,
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dre_comp_map_par_unico UNIQUE (grupo_arquivo, descricao_arquivo)
);

CREATE INDEX dre_comp_map_sub_idx ON financeiro.dre_comp_map (sub_chave);

ALTER TABLE financeiro.dre_comp_bloco ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro.dre_comp_map   ENABLE ROW LEVEL SECURITY;

-- Leitura só pela RPC (SECURITY DEFINER, 0257). Nenhum role de aplicação toca as tabelas
-- diretamente — mesmo desenho da 0204 para o caixa.
REVOKE ALL ON financeiro.dre_comp_bloco FROM PUBLIC, anon, authenticated;
REVOKE ALL ON financeiro.dre_comp_map   FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON financeiro.dre_comp_bloco TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON financeiro.dre_comp_map   TO service_role;
GRANT USAGE, SELECT ON SEQUENCE financeiro.dre_comp_bloco_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE financeiro.dre_comp_map_id_seq   TO service_role;

-- ---------------------------------------------------------------------------
-- Seed da ÁRVORE (${arvore.length} blocos) — anexo \`anexo-v5-8-0-arvore-competencia.csv\`
-- ---------------------------------------------------------------------------

INSERT INTO financeiro.dre_comp_bloco (ordem, tipo, chave, rotulo, formula) VALUES
${valoresArvore.join(',\n')};

-- ---------------------------------------------------------------------------
-- Seed do DE-PARA (${depara.length} pares) — anexo \`anexo-v5-8-0-depara-competencia.csv\`
-- 140 derivados do modelo da gerente + 1 pelo grupo do arquivo
-- (\`Estacionamento Vaga Rotativa\` → RHB).
-- ---------------------------------------------------------------------------

INSERT INTO financeiro.dre_comp_map (grupo_arquivo, descricao_arquivo, sub_chave, rotulo_linha, ordem) VALUES
${valoresDepara.join(',\n')};

-- ---------------------------------------------------------------------------
-- View de leitura — a base já chega no GRÃO da DRE (um registro por par × mês), então
-- não há fato a materializar e não existe deriva possível entre base e leitura.
--
-- LEFT JOIN de propósito: par sem mapa sai com \`sub_chave IS NULL\` e vira a bandeja
-- "Não classificadas". INNER JOIN faria a linha SUMIR — exatamente o que o invariante
-- de completude proíbe.
-- ---------------------------------------------------------------------------

CREATE VIEW financeiro.vw_dre_competencia AS
SELECT
  r.id,
  r.tipo,
  r.grupo,
  r.descricao,
  r.ano,
  r.mes_num,
  r.competencia,
  r.valor,
  m.sub_chave,
  m.rotulo_linha,
  COALESCE(m.excluida, false) AS excluida
FROM raw.demonstrativo_competencia r
LEFT JOIN financeiro.dre_comp_map m
  ON m.grupo_arquivo = r.grupo
 AND m.descricao_arquivo = r.descricao;

REVOKE ALL ON financeiro.vw_dre_competencia FROM PUBLIC, anon, authenticated;
GRANT SELECT ON financeiro.vw_dre_competencia TO service_role;

NOTIFY pgrst, 'reload schema';
`

writeFileSync(DESTINO, sql)
console.log(
  `${DESTINO} gerado — ${arvore.length} blocos, ${depara.length} pares, ` +
    `${destinos.size} linhas exibidas (${depara.length - destinos.size} fusões).`,
)
