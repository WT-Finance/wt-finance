# ADR-0179 — Cliente de entrega das RPAs e operações puladas

**Status:** aceito (v6.1.0) · **Data:** 2026-09-29 ·
**Contexto:** versão v6.1.0, "Entrega das RPAs" · **Briefing:** `docs/briefings/briefing-v6-1-0-entrega-rpa.md`
· **Validação:** `docs/briefings/anexo-v6-1-0-m0-validacao.md` · **Contrato:** errata 4 de
`docs/contratos/ingestao-v1.md` · **Migrations:** `0287`, `0288` (aditivas) · **Código:**
`scripts/rpa/entregar-ingestao.ps1`, `src/lib/ingestao/carga.ts`, `src/lib/ingestao/aplicar.ts`,
`src/lib/api-externa/http.ts` · **Runbook:** `docs/runbooks/chaves-rpa-runbook.md`

> Numeração conferida contra `docs/adr/` e contra todas as refs do remoto em 29/09/2026 (últimos
> reais: ADR 0178, migration 0286 antes desta versão).

## O problema

As quatro RPAs (Power Automate Desktop) já extraíam os crus do Monde, mas a entrega ainda dependia de
alguém subir cada arquivo pelo card. Três lacunas separavam a extração da entrega sem humano:

1. **O PAD não fala HTTP de forma confiável** — os três passos do contrato (URL assinada → `PUT` →
   carga), com idempotência, retentativa e leitura de erro, não cabem num fluxo de PAD sem virar uma
   segunda implementação do contrato, frágil e fora do repositório.
2. **A RPA de Operação pula operação com defeito de cadastro** (nome ambíguo ou ausente no dropdown do
   Monde). Uma carga de Operação substitui a base inteira: operação pulada **some** da carteira de
   Weddings — e a plataforma não tinha como saber, nem como dizer.
3. **Não havia chave por RPA**: a mesma credencial serviria a todas, e a origem gravada em
   `ingestao.carga` era o que o chamador declarasse.

## Decisão

1. **Um cliente de entrega versionado** (`scripts/rpa/entregar-ingestao.ps1`, Windows PowerShell 5.1,
   ASCII puro, nada a instalar) é a única implementação dos três passos fora do card. O PAD só chama o
   script e lê o **código de saída** (0 aplicada/conferida · 2 rejeitada 422 · 3 chave/escopo · 4 grafo ·
   5 tamanho · 1 o resto). Nasce em **conferência** e só aplica com `-Aplicar` (lição da v6.0.1: o
   default que aponta para produção tem de ser o inofensivo), manda `confirmar:false` explícito (o default
   do servidor é `true`) e confere o próprio resultado (`aplicada` sem `-Aplicar` ⇒ FATAL). Um `carga_id`
   e uma idempotência por execução; retentativa só do transitório, com os mesmos valores.
2. **Operação pulada não some em silêncio — duas redes independentes.** (a) A RPA declara o que pulou
   (`puladas`, só em Operação), que fica em `diff.puladas` e alarma `operacoes_puladas`. (b) **Independente
   do que a RPA declarar**, o servidor compara o conjunto de operações da base com o do arquivo e alarma
   `operacoes_removidas` — mesmo que a removida conste em `puladas` (a pulada é a causa; a remoção é o
   efeito que a diretoria vê). Critério: `Operacao_Id` quando os dois lados o têm; senão nome normalizado.
3. **O "antes" da aplicação é capturado pela própria promoção** (0288): dentro da transação que troca o
   fato, sob o lock da base, e devolvido em `operacoes_antes` — que fica em `ingestao.promocao` e volta no
   replay. Uma leitura separada, antes de promover (o desenho inicial), perdia a remoção numa retentativa
   depois de um commit cujo retorno se perdeu (achado ALTO do `revisor`). A leitura prévia
   (`ingestao_operacoes_vigentes()`, 0287) ficou para a **conferência**, que não promove — e é a mesma
   função que a promoção chama, para as duas não divergirem. `null` = **não medido**, nunca "nenhuma".
4. **`puladas` mora no `diff` jsonb de `ingestao.carga`**, não numa coluna nova: coluna nova exigiria
   parâmetro novo em `ingestao_carga_concluir` — função nova, e a antiga para a próxima destrutiva (D-9).
5. **`Operacao_Id` é gravado, não lido** (`raw.lancamentos_operacao`, staging, fato). Nenhum leitor muda
   nesta versão; usá-lo em `dim_operacao_weddings` é backlog (medir antes se é o `operation_id` da API).
6. **Uma chave por RPA, escopo mínimo** (`rpa-vendas`, `rpa-lancamentos`, `rpa-operacao`,
   `rpa-demonstrativo`), criadas pela tela existente — o segredo só o Yan vê. Duas travas novas no
   servidor: **a origem segue a credencial** (chave ⇒ `rpa-pad`/`rpa-cloud`; sessão ⇒ `manual`/
   `reprocesso`), e **chave com escopo de ingestão é recusada pela API de Solicitações** (403).

## Alternativas descartadas

- **Multipart num passo só** — descartado já na v6.0.0 (D2): a Vercel recusa corpo acima de 4,5 MB.
- **O PAD chamando a API direto** — duplicaria o contrato fora do repositório, sem teste nem revisão.
- **Confiar só em `puladas`** — a RPA pode abortar, truncar o log ou errar; a comparação por conjunto no
  servidor não depende dela.
- **Ler o "antes" fora da promoção** (desenho da M1) — ver decisão 3.
- **RPC de lista de operações para a RPA** (§5 do contrato) — a RPA deriva a lista dos exports de Vendas;
  saiu do contrato (errata 4(d)).

## Consequências

- A carga pode ser feita por robô com a mesma conferência da carga manual; o GATE da v6.1.0 aplicou as
  cinco bases pelas quatro chaves, com checksums fechando, e viu a chave de Operação ser recusada em Vendas.
- Uma carga de Operação lê o conjunto de operações da base a cada execução (conferência e aplicação) e a
  promoção guarda ~240 itens a mais em `ingestao.promocao` por carga (sem retenção dessa tabela — dívida).
- **Limite conhecido:** a 0288 fecha o "antes"; não fecha a intercalação da STAGING entre duas cargas de
  Operação simultâneas (`limpar → lotes → validar → promover` não fica sob lock contínuo; o lock de carga do
  servidor é por processo). Anterior à v6.1 — backlog.
- A referência de uma chave é única para sempre (inclusive entre revogadas): rotacionar exige nome novo
  (`rpa-vendas-2`), e o "quem" que a tela mostra muda junto.
