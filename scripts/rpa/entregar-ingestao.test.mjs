import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Sonda ESTATICA do cliente de entrega das RPAs (v6.1.0/M4). Nao executa PowerShell (a sessao nao
// consegue, e o CI e Linux): e uma rede contra regressao obvia, nao um parser de PowerShell. A
// execucao real e o GATE do Yan, no Windows. Roda em `npm test` (vitest.config inclui
// scripts/**/*.test.mjs).

const DIR = dirname(fileURLToPath(import.meta.url))
const bytesPs1 = readFileSync(join(DIR, 'entregar-ingestao.ps1'))
const ps1 = bytesPs1.toString('latin1') // 1 byte = 1 char: nenhum byte alto some na decodificacao
const readme = readFileSync(join(DIR, 'README.md'), 'utf8')

/** Codigos de saida documentados (briefing 4-D) — 0 e sucesso, os demais sao falha. */
const CODIGOS = [0, 1, 2, 3, 4, 5]

describe('entregar-ingestao.ps1 — arquivo', () => {
  it('e ASCII puro (o PowerShell 5.1 le .ps1 sem BOM como ANSI: acento vira lixo)', () => {
    const altos = []
    bytesPs1.forEach((b, i) => { if (b >= 0x80) altos.push(i) })
    expect(altos.slice(0, 5)).toEqual([])
  })

  it('nao tem BOM nem CRLF misturado com LF sem necessidade (so LF ou so CRLF)', () => {
    expect(bytesPs1[0]).not.toBe(0xEF)
    const crlf = (ps1.match(/\r\n/g) ?? []).length
    const lf = (ps1.match(/\n/g) ?? []).length
    expect(crlf === 0 || crlf === lf).toBe(true)
  })
})

describe('entregar-ingestao.ps1 — so recursos do PowerShell 5.1', () => {
  const PROIBIDOS = [
    ['-SkipHttpErrorCheck', /-SkipHttpErrorCheck/i],
    ['-StatusCodeVariable', /-StatusCodeVariable/i],
    ['-AsHashtable', /-AsHashtable/i],
    ['ConvertFrom-Json -Depth', /ConvertFrom-Json[^\r\n|]*-Depth/i],
    ['operador ??', /\?\?/],
    ['operador ?.', /\?\.\w/],
    ['ForEach-Object -Parallel', /-Parallel\b/i],
  ]
  for (const [nome, re] of PROIBIDOS) {
    it(`nao usa ${nome}`, () => { expect(re.test(ps1)).toBe(false) })
  }

  it('nao declara parametro Mandatory (em execucao sem console o PowerShell ficaria esperando prompt)', () => {
    expect(/Mandatory/i.test(ps1)).toBe(false)
  })

  it('nao liga Set-StrictMode (corpo de erro sem "erro" tem de devolver $null, nao lancar)', () => {
    expect(/^\s*Set-StrictMode/im.test(ps1)).toBe(false)
  })

  it('forca TLS 1.2, le o corpo de erro pela WebException e manda o corpo como bytes UTF-8', () => {
    expect(ps1).toMatch(/SecurityProtocol\s*=\s*\[Net\.SecurityProtocolType\]::Tls12/)
    expect(ps1).toMatch(/System\.Net\.WebException/)
    expect(ps1).toMatch(/\$ex\.Response/)
    expect(ps1).toMatch(/InnerException/) // desembrulha a WebException (MethodInvocationException)
    expect(ps1).toMatch(/GetBytes\(/)
    expect(ps1).toMatch(/ConvertTo-Json\s+-Depth\s+10/)
  })
})

describe('entregar-ingestao.ps1 — contrato', () => {
  it('cada codigo de saida documentado existe no script (return N / Sair-Com N) e na tabela do cabecalho', () => {
    for (const n of CODIGOS.filter(c => c !== 0)) {
      expect(ps1, `codigo ${n} sem "return ${n}"`).toMatch(new RegExp(`return\\s+${n}\\b`))
    }
    expect(ps1).toMatch(/Sair-Com\s+0\b/)
    for (const n of CODIGOS) {
      expect(ps1, `codigo ${n} fora da tabela do cabecalho`).toMatch(new RegExp(`^\\s+${n}\\s+-\\s`, 'm'))
    }
  })

  it('manda "confirmar" com o valor falso EXPLICITO (o default do servidor e true)', () => {
    expect(ps1).toMatch(/\$confirmar\s*=\s*\$false/)
    expect(ps1).toMatch(/confirmar\s*=\s*\$confirmar/)
    // e so vira true por -Aplicar
    expect(ps1).toMatch(/if\s*\(\$Aplicar\)\s*\{\s*\$confirmar\s*=\s*\$true\s*\}/)
  })

  it('assert de modo: FATAL nos dois sentidos', () => {
    expect(ps1).toMatch(/FATAL:[^\r\n]*CONFERENCIA[^\r\n]*aplicada/)
    expect(ps1).toMatch(/FATAL:[^\r\n]*APLICAR[^\r\n]*conferida/)
  })

  it('cabecalhos do contrato: origem rpa-pad, idempotencia (um UUID por execucao) e x-api-key so fora do PUT', () => {
    expect(ps1).toMatch(/x-ingestao-origem/)
    expect(ps1).toMatch(/'rpa-pad'/)
    expect(ps1).toMatch(/x-ingestao-idempotencia/)
    expect(ps1).toMatch(/\[guid\]::NewGuid\(\)/)
    expect((ps1.match(/NewGuid\(\)/g) ?? []).length).toBe(1)
    // o PUT nao recebe cabecalhos (nem a chave): a chamada do PUT nao passa Headers
    const trechoPut = ps1.slice(ps1.indexOf("Invoke-ComRetentativa 'put'"), ps1.indexOf("Invoke-ComRetentativa 'put'") + 300)
    expect(trechoPut).not.toMatch(/Headers\s*=/)
  })

  it('sha256 por Get-FileHash em minusculas', () => {
    expect(ps1).toMatch(/Get-FileHash[^\r\n]*-Algorithm\s+SHA256/)
    expect(ps1).toMatch(/ToLowerInvariant\(\)/)
  })

  it('distingue os 409 pelo erro.codigo do corpo e nao retenta DEPENDENCIA_AUSENTE', () => {
    expect(ps1).toMatch(/CARGA_EM_ANDAMENTO/)
    expect(ps1).toMatch(/DEPENDENCIA_AUSENTE/)
    expect(ps1).toMatch(/already exists\|Duplicate/)
  })

  it('a chave nunca e escrita em saida/log (nenhuma linha de escrita usa $chave)', () => {
    const linhas = ps1.split(/\r?\n/).filter(l => /Write-(Host|Output|Verbose|Warning|Error|Debug)|WriteLine|Out-File|Set-Content|Add-Content|WriteAllText/i.test(l))
    for (const l of linhas) {
      expect(l, `linha escreve a chave: ${l.trim()}`).not.toMatch(/\$chave\b|\$script:ChaveSecreta|\$cabecalhos/i)
    }
  })
})

describe('README.md — mesma tabela de codigos e a linha do PAD', () => {
  it('lista os 6 codigos de saida (tabela `| N |`)', () => {
    for (const n of CODIGOS) {
      expect(readme, `codigo ${n} fora da tabela do README`).toMatch(new RegExp(`\\|\\s*\`${n}\`\\s*\\|`))
    }
  })

  it('cita as 4 variaveis de ambiente e a linha do PAD com -Aplicar, -Log e -ChaveEnv', () => {
    for (const v of ['JANUS_CHAVE_RPA_VENDAS', 'JANUS_CHAVE_RPA_LANCAMENTOS', 'JANUS_CHAVE_RPA_OPERACAO', 'JANUS_CHAVE_RPA_DEMONSTRATIVO']) {
      expect(readme).toContain(v)
    }
    expect(readme).toMatch(/powershell\.exe -NoProfile[^\n]*-File[^\n]*entregar-ingestao\.ps1[^\n]*-Log[^\n]*-ChaveEnv[^\n]*-Aplicar/)
    expect(readme).toContain('chaves-rpa-runbook.md')
  })
})
