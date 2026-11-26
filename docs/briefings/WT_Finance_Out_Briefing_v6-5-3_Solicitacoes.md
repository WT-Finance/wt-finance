# Out-briefing — v6.5.3 · Solicitações: data limite, moeda e notas (+ % no Registro de Antecipações)

**PATCH** (decisão do Yan — pelo critério usual seria MINOR) · **PR #316** · Branch `fix/v6-5-3-solicitacoes` · Base `38da4e57`
(pós-merge da v6.5.2) · Briefing `docs/briefings/briefing-v6-5-3-solicitacoes-correcoes-melhorias.md` ·
Migration **0309** (aditiva, **APLICADA em 26/11**) · ADR-**0185** · Banco na **0309**, livre **0310**; ADR livre **0186**.

## 1. Origem

26/11, print de uma usuária (Safari, macOS): "não consigo abrir esta solicitação" — o modal recusava com
"Informe a data-limite." com o campo mostrando 26/11/2026. Diagnóstico: o Safari do macOS desenha a data de HOJE
dentro de um `<input type="date">` **vazio**; o valor era `''`. Erro de navegador não chega a log: nos 7 dias de
produção, Solicitações teve só 2 erros de servidor (e-mail transitório do Office 365 na #3068, retentado; o anexo
147 já conhecido da v6.2.1). Decisões do Yan no chat (26/11): data padrão hoje + 3 corridos; "?" intacto;
melhorias no mesmo patch (moeda R$/US$/€, Notas, moeda na API); mais tarde, a coluna % em Antecipações.

## 2. Entregue

| Missão | Commit | O quê |
|---|---|---|
| M1 | `f13e6cc0` | Data limite nasce em hoje+3 corridos; `CampoData` (vazio em cinza); obrigatórios/anexo/data-no-passado checados no modal; campo que barra ganha foco e borda `--danger` |
| M2 | `bccd2e68` | Briefing |
| M3 | `b7a87248` | Migration 0309 aplicada + baseline + `database.ts` + sonda anon |
| M4 | `1a617e3e` | Moeda: seletor, `fmtValor`/prévia, Exportar (coluna mista com símbolo), rota e docs da API |
| M5 | `abe484cc` | Notas: `linhaDoTempo`, `NotasSolicitacao`, `adicionarNota`, e-mail `nota`, ADR-0185 |
| M7 | `0c857541` | Coluna **%** no Registro de Antecipações (tabela, linha nova, ordenação, Exportar com Total ponderado) |
| Revisão | `7dcb2b65` | Achados do `revisor` (seção 5) |
| Fechamento | `69eeb95f` | Bump 6.5.3, CHANGELOGs, out-briefing, WORKING-CONTEXT, aprendizado nas skills |

## 3. Banco

- **0309** aplicada por `npm run db:migrate -- --aditiva` (backup-gate VERDE: 94/94 tabelas, restore-test 3/3).
  Classificador: `aditiva`. `revisor-db`: APROVADA COM RESSALVAS — M1 (DOWN de `solic_json` citava a 0261; a
  última é a 0264, com `sou_autor`), B1 (`NOTIFY pgrst`), B2 (objeto em campo de texto na API passa a ser
  recusado — declarado no header), B3 (índice em `autor_id`): **todos feitos antes de aplicar**.
- **Ensaio em transação revertida** contra produção, 26 casos, ANTES de aplicar (corpo da migration dentro do
  `BEGIN…ROLLBACK`) e DEPOIS (funções vivas): snapshot com/sem moeda, moeda inválida, criação como usuário logado
  com EUR, notas (vazia, longa, inexistente, encerrada, terceiro sem acesso), `solic_detalhe` com notas, API com
  texto/número/objeto/objeto em texto/moeda fora da lista/obrigatório faltando, `solic_caixa('todas')` em 185 ms.
  Resíduo conferido: zero. Script fora do repo (não é um 6º teste que escreve — o gatilho da skill §6 não mudou).
- Smoke REST com `service_role`: `solic_nota_adicionar` → `AUTH_NECESSARIA`; `criar_solicitacao_externa` →
  `CHAVE_INVALIDA`; `solic_caixa` → `[]` (corpos executam; PostgREST já vê a RPC nova).
- ⚠️ **Efeito colateral dos ensaios:** as transações revertidas consumiram números da sequência de solicitações
  (sequência não volta no ROLLBACK). A próxima solicitação real pula alguns números depois da #3185. Inofensivo,
  mas visível na numeração.
- Baseline (`ultima_migration` 0309) e `database.ts` regenerados no commit da migration; diff só com o esperado.

## 4. Gates

`npm run build` ✓ · `npx tsc --noEmit` ✓ · `npm run lint` ✓ (sem warning novo) · `npm test`: **2.800 testes
passando**; 6 arquivos do oráculo de ingestão não carregaram por **fixture ausente** (git-ignored, não vem na
worktree — nada desta versão toca ingestão). Copiadas de `~/projects/arquivo-worktrees-janus/fixtures-ingestao/`,
4 dos 6 passaram (78 testes). Seguem sem fixture, **pré-existente**: `demonstrativo-cru.xlsx` (perdida, B-38) e
`contas-receber-cru-24.xlsx` (o arquivo tem um "Contas a receber 24.xlsx", mas nada prova que é o mesmo — não
renomeado por palpite; conferir o sha256 contra quem gerou a fixture da v6.4.0).
Casos novos: `format.test.ts` (data padrão, validação, moeda), `exportar.test.ts` (moeda por célula, rótulo
com R$), `linha-do-tempo.test.ts` (7), `email.test.ts` (nota: autor/texto/data, escape, `<br>`),
`rpc-contrato.test.ts` (anon na RPC nova; `notas`/`moeda` nas três formas), `contrato-api-externa.test.ts`
(objeto USD gravado; objeto em campo de texto recusado), Antecipações (`gestao`, ordenação por %, Exportar).

## 5. Parecer da revisão

### `revisor-db` (0309) — APROVADA COM RESSALVAS
Ver seção 3. B4 (todas as notas de todas as solicitações no jsonb da lista) e B5 (sem limite de notas por
usuário): **registrados**, aceitáveis no volume de hoje (284 solicitações, notas começando do zero) — ADR-0185,
"Consequências". B7: a RPC nova só entra na sonda anon (string solta), fora da allowlist do `verificador`.

### `revisor` — 3 ALTOS, 6 MÉDIOS (todos corrigidos em `7dcb2b65`)
- ALTO 1: `aria-invalid:border-danger` perdia para `.foco-neutro:focus-visible` (CSS sem layer) justo quando o
  modal foca o campo → `border-danger!`.
- ALTO 2: a rota barrava moeda fora da lista com 422 genérico de `union`, contrariando a doc (`VALOR_INVALIDO`)
  → a rota só tipa; o banco decide (e aceita minúscula).
- ALTO 3: Notas perdia o foco ao fechar o formulário → foco volta ao "Adicionar nota"; Ctrl/⌘+Enter salva;
  "Nota salva." para leitor de tela.
- MÉDIOs: `<br>` no e-mail (Outlook ignora `white-space`); 'nota' sem instante não herda `decidido_em`; `catch`
  no salvar; contraste (cor só na barra e no verbo); casos de contrato `notas`/`moeda`; coluna mista no Exportar
  perde o "(R$)" do próprio rótulo.
- BAIXOS registrados, não endereçados: erro de anexo obrigatório só rola até o campo (label não focável) e o
  campo inválido não aponta a mensagem por `aria-describedby`; `previa-${id}` duplicado (pré-existente); contador
  2000 conta UTF-16 (mais estrito que o banco com emoji); texto de nota não vira rascunho ao fechar o drawer.
- **Segunda passada** (coluna % + conferência de `7dcb2b65`): **APROVADO COM RESSALVAS**, nenhum CRÍTICO/ALTO/
  MÉDIO. Os ALTO 1–3 e MÉDIO 4–9 foram conferidos como fechados (MÉDIO 8 parcial: falta caso para o RETORNO de
  `solic_nota_adicionar` — coberto pelo ensaio em transação revertida, não por contrato). BAIXOS da segunda
  passada endereçados no commit de fechamento: dica "Ctrl/⌘+Enter"; exclusão do autor extraída para
  `semOAutor` (pura, testada: maiúscula/espaço, nulo, autor único); comentário do % no Exportar corrigido (tela
  divide reais, Excel divide centavos — diferença só num empate raro na 2ª casa). Registrados: cabeçalho "%" lido
  como "Ordenar por %" pelo leitor de tela (padrão do `ThOrdenavel` em todo o DS); piso `-1` na ordenação por %
  (inalcançável: o banco recusa antecipado ≤ 0); sem teste de rota para moeda inválida (a validação é do banco e
  tem caso na RPC).

### `verificador-visual`
**Não rodou** — sessão de background sem credencial de login (mesmo caso da v6.5.2). Fica para o Yan no preview
(seção 7).

## 6. Advisor

Orquestrador: 3 consultas, as três mudaram o rumo. (1) Na análise de "corrigir e reenviar" (13/10). (2) Antes da
migration: escrever o briefing antes de seguir (Rota A), medir o volume antes de pôr notas em `solic_json`,
armadilhas do `jsonb_each` (aspas no escalar), da moeda dentro de `valores` (aviso de troca de tipo) e do e-mail
sem data. (3) No fechamento: reconferir `migration list` depois da aplicação, atualizar este out-briefing com o PR e
declarar a decisão D-12 abaixo. Revisores: 0. 🔴 Custo: pendência do Yan (`/usage`).

**D-12 (skill `banco-e-rpc` × checklist do `revisor-db`):** a nota nova da skill (sequência não volta no
`ROLLBACK` de um ensaio) é OBSERVAÇÃO sobre ensaio, não convenção de banco — o checklist do `revisor-db` ficou
intocado de propósito. Não é divergência entre os dois.

## 7. 🔴 Pendências do Yan

1. **Preview — conferir no navegador** (de preferência no **Safari do Mac** da usuária do print):
   - Nova solicitação: Data limite já preenchida (+3 dias); apagar a data → "dd/mm/aaaa" em cinza; enviar com
     obrigatório vazio → foco + borda vermelha no campo.
   - Campo de valor: seletor R$/US$/€ e a prévia "Será registrado como US$ …".
   - Drawer: seção Notas (cores por tipo; comentário neutro com autor em negrito), Adicionar nota, inclusive numa
     encerrada; e-mail da nota chegando a quem acompanha (não ao autor).
   - Registro de Antecipações: coluna % e o Exportar.
2. **Mergear** (a 0309 já está aplicada; o front novo depende dela, o antigo convive com ela).
3. Avisar a usuária do print que o prazo agora vem preenchido.
4. Integradores da API: avisar que o campo de moeda aceita `{valor, moeda}` (opcional; nada muda para quem não usa).
5. Dependabot: o GitHub reporta 26 alertas na `main` (2 críticos) — fora deste patch; abrir um de segurança.

## 8. Fora desta versão (registrado)

- O mesmo `<input type="date">` nativo em Antecipações, Inventário, Estante e filtros de período (risco igual no
  Safari).
- Notas fora do Exportar e da página Movimentações.
- "Corrigir e reenviar" uma rejeitada (discutido em 13/10).
- Documentação da API na plataforma omite o e-mail de "aprovada" (divergência antiga com o `.md`).

## 9. Arquivos

Ver `git diff --stat 38da4e57..HEAD`. Novos: `campo-data.tsx`, `notas-solicitacao.tsx`, `linha-do-tempo.ts(+test)`,
`0309_solic_moeda_e_notas.sql`, ADR-0185, briefing e este out-briefing.
