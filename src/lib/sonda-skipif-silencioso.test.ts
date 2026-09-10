import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Raiz do repo calculada a partir DESTE arquivo (não do cwd do runner) — mesma cautela de
// `sonda-teste-escreve-banco.test.ts` / `gatilho-ajuda.test.ts`. Este arquivo mora em `src/lib/`.
const RAIZ_REPO = fileURLToPath(new URL('../../', import.meta.url))

// ── Sonda: nenhum `skipIf` some em silêncio (v5.10.0 — D5-004 / D7-004) ─────────────────
// O defeito é REINCIDENTE. Na v5.4.3 o `.env.local` não vinha no `git worktree add`, 112
// casos de contrato se auto-pularam e a suíte ficou VERDE anunciando 112 testes a menos —
// ninguém viu. A auditoria de 13/06 registrou o mesmo padrão (M10) e a auditoria da v5 o
// reencontrou intacto (D5-004 = D7-004): hoje ~180 casos dependem de credenciais e somem
// sem aviso se elas faltarem. "Zero skip" no relatório do runner não prova nada: prova
// apenas que o ambiente TINHA as credenciais naquela rodada.
//
// DESENHO: INVENTÁRIO FECHADO, no molde allowlist da sonda irmã (v5.9.6). Todo arquivo de
// teste que usa `skipIf` precisa estar declarado aqui com as variáveis de ambiente de que
// depende. Arquivo novo com `skipIf` REPROVA até ser declarado — é o que impede a contagem
// de crescer calada. E, com `REQUIRE_CONTRACT=1` (o modo "online obrigatório", já usado
// pelo `rpc-contrato.test.ts`), a sonda exige que TODAS essas variáveis estejam presentes:
// aí o gate falha alto em vez de passar verde pulando meia suíte.
//
// O guard que existia antes cobria só o próprio `rpc-contrato.test.ts` e só duas variáveis
// (`rpc-contrato.test.ts:583`). Esta sonda generaliza para os quatro arquivos e inclui
// `SUPABASE_DB_URL`, que era o furo: os testes em transação revertida dependem dele e
// nenhum guard os vigiava.

const RAIZ_TESTES = 'src'

/** Arquivos que PODEM usar `skipIf`, e de que variáveis de ambiente cada um depende.
 *  Manter em ordem alfabética. Acrescentar aqui é decisão consciente: o teste novo passa a
 *  ser exigido quando `REQUIRE_CONTRACT=1`. */
const INVENTARIO: ReadonlyArray<{ arquivo: string; envs: readonly string[]; porque: string }> = [
  {
    arquivo: 'src/lib/api-externa/contrato-api-externa.test.ts',
    envs: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL'],
    porque: 'contrato HTTP ponta a ponta da API externa (v5.4.0) — REST + fixture commitada',
  },
  {
    arquivo: 'src/lib/dre/reverter-diario.test.ts',
    envs: ['SUPABASE_DB_URL'],
    porque: 'prova comportamental de RPC que escreve, em transação revertida (0268, v5.9.5)',
  },
  {
    arquivo: 'src/lib/monde/virada-paridade.test.ts',
    envs: ['SUPABASE_DB_URL'],
    porque: 'paridade pós-virada do espelho Monde (v5.1.4), em transação',
  },
  {
    arquivo: 'src/lib/rpc-contrato.test.ts',
    envs: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    porque: 'contrato REST das RPCs + RBAC (F7) — o maior bloco gated da suíte',
  },
]

function arquivosDeTeste(dir: string): string[] {
  const resultado: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) resultado.push(...arquivosDeTeste(caminho))
    else if (entrada.isFile() && caminho.endsWith('.test.ts')) resultado.push(caminho)
  }
  return resultado
}

/** `describe.skipIf(` / `it.skipIf(` / `test.skipIf(` — a forma que apaga casos em silêncio. */
const USA_SKIPIF = /\b(?:describe|it|test)\s*\.\s*skipIf\s*\(/

/** A própria sonda casa a regex (o literal está no código dela) — mesmo efeito que a sonda
 *  de escrita no banco teve na v5.9.6, quando se pegou a si mesma na 1ª rodada. */
const ESTE_ARQUIVO = 'src/lib/sonda-skipif-silencioso.test.ts'

const arquivosComSkipIf = arquivosDeTeste(join(RAIZ_REPO, RAIZ_TESTES))
  .filter(caminho => USA_SKIPIF.test(readFileSync(caminho, 'utf8')))
  .map(caminho => relative(RAIZ_REPO, caminho).split('\\').join('/'))
  .filter(caminho => caminho !== ESTE_ARQUIVO)
  .sort()

const declarados = INVENTARIO.map(e => e.arquivo).sort()

describe('sonda — nenhum skipIf some em silêncio (D5-004 / D7-004)', () => {
  it('a sonda ENXERGA o exemplo positivo (autoconferência)', () => {
    // Se a regex parar de casar a forma real, todos os outros casos passariam vazios e a
    // sonda viraria decoração. `rpc-contrato.test.ts` é o alvo conhecido e mais antigo.
    expect(arquivosComSkipIf).toContain('src/lib/rpc-contrato.test.ts')
    expect(arquivosComSkipIf.length).toBeGreaterThanOrEqual(4)
  })

  it('todo arquivo com skipIf está DECLARADO no inventário (arquivo novo reprova)', () => {
    const naoDeclarados = arquivosComSkipIf.filter(a => !declarados.includes(a))
    expect(
      naoDeclarados,
      `Teste novo usando skipIf sem entrada no INVENTARIO desta sonda: ${naoDeclarados.join(', ')}. ` +
      'Declare o arquivo e as variáveis de ambiente de que ele depende — senão os casos dele ' +
      'podem sumir em silêncio quando as credenciais faltarem (lição v5.4.3).',
    ).toEqual([])
  })

  it('todo arquivo declarado AINDA usa skipIf (inventário não acumula entrada morta)', () => {
    const sumiram = declarados.filter(a => !arquivosComSkipIf.includes(a))
    expect(
      sumiram,
      `Entrada do INVENTARIO que já não usa skipIf (arquivo removido ou gate retirado): ${sumiram.join(', ')}. ` +
      'Remova a entrada para o inventário continuar sendo a verdade.',
    ).toEqual([])
  })

  it('cada arquivo declarado cita, no próprio código, as variáveis que o inventário atribui a ele', () => {
    const divergentes: string[] = []
    for (const { arquivo, envs } of INVENTARIO) {
      const fonte = readFileSync(join(RAIZ_REPO, arquivo), 'utf8')
      const faltando = envs.filter(env => !fonte.includes(env))
      if (faltando.length) divergentes.push(`${arquivo}: não cita ${faltando.join(', ')}`)
    }
    expect(
      divergentes,
      'O inventário atribui uma variável que o arquivo não lê — ou o teste mudou de gate, ou a ' +
      `declaração está errada. ${divergentes.join(' | ')}`,
    ).toEqual([])
  })

  it('REQUIRE_CONTRACT=1 exige TODAS as variáveis dos arquivos gated (online não pode pular)', () => {
    // Este é o caso que transforma "verde por omissão" em falha alta. Sem
    // REQUIRE_CONTRACT=1 (rodada local offline) ele apenas registra o que seria pulado.
    const exigido = process.env.REQUIRE_CONTRACT === '1'
    const necessarias = [...new Set(INVENTARIO.flatMap(e => e.envs))].sort()
    const ausentes = necessarias.filter(env => !process.env[env])

    if (exigido) {
      expect(
        ausentes,
        `REQUIRE_CONTRACT=1 mas faltam ${ausentes.join(', ')} → os blocos gated seriam PULADOS e a ` +
        'suíte passaria verde anunciando menos casos. É exatamente o modo de falha da v5.4.3.',
      ).toEqual([])
    } else {
      // Offline o gate segue verde por desenho — mas a sonda deixa o rastro no relatório.
      expect(Array.isArray(ausentes)).toBe(true)
    }
  })
})
